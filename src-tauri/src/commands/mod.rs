use crate::config::AppConfig;
use crate::error::AppError;
use crate::ffmpeg::{self, MediaImportResult, MediaMetadata};
use crate::services::{
    detect_environment, EnvironmentInfo, PythonPingResult, PythonWorker, SharedMediaServer,
    validate_import_id, validate_imports_file, validate_user_media_path,
};
use crate::audio::{NativePlayer, PlayerStatus};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerStatus {
    pub name: String,
    pub status: String,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelinePingResponse {
    pub message: String,
    pub app_version: String,
    pub environment: EnvironmentInfo,
    pub layers: Vec<LayerStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub app_version: String,
    pub environment: EnvironmentInfo,
    pub python: PythonHealth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonHealth {
    pub available: bool,
    pub version: Option<String>,
    pub worker_id: Option<String>,
}

pub struct AppState {
    pub config: AppConfig,
    pub python_worker: Arc<PythonWorker>,
    pub media_server: SharedMediaServer,
    pub player: Arc<NativePlayer>,
}

impl AppState {
    pub fn new(
        config: AppConfig,
        worker_script: PathBuf,
        media_server: SharedMediaServer,
        player: Arc<NativePlayer>,
    ) -> Self {
        let python_worker = Arc::new(PythonWorker::new(
            worker_script,
            config.python_worker_timeout_ms,
        ));

        Self {
            config,
            python_worker,
            media_server,
            player,
        }
    }

    pub fn ensure_data_dirs(&self) -> Result<(), AppError> {
        std::fs::create_dir_all(&self.config.data_dir).map_err(|err| {
            AppError::Internal(format!("Failed to create data directory: {err}"))
        })?;
        std::fs::create_dir_all(ffmpeg::imports_dir(&self.config.data_dir)).map_err(|err| {
            AppError::Internal(format!("Failed to create imports directory: {err}"))
        })?;
        Ok(())
    }
}

#[tauri::command]
pub fn get_environment_info() -> EnvironmentInfo {
    detect_environment()
}

#[tauri::command]
pub fn health_check(state: State<'_, AppState>) -> Result<HealthResponse, AppError> {
    let environment = detect_environment();

    let python = match state.python_worker.ping() {
        Ok(result) => PythonHealth {
            available: true,
            version: Some(result.version),
            worker_id: Some(result.worker_id),
        },
        Err(err) => {
            tracing::warn!("Python health check failed: {err}");
            PythonHealth {
                available: false,
                version: None,
                worker_id: None,
            }
        }
    };

    let status = if python.available {
        "healthy".into()
    } else {
        "degraded".into()
    };

    Ok(HealthResponse {
        status,
        app_version: state.config.app_version.clone(),
        environment,
        python,
    })
}

#[tauri::command]
pub fn pipeline_ping(state: State<'_, AppState>) -> Result<PipelinePingResponse, AppError> {
    let started = std::time::Instant::now();
    let environment = detect_environment();
    let rust_latency = started.elapsed().as_millis() as u64;

    let python_started = std::time::Instant::now();
    let python_result: PythonPingResult = state.python_worker.ping()?;
    let python_latency = python_started.elapsed().as_millis() as u64;

    Ok(PipelinePingResponse {
        message: format!(
            "Vocalis pipeline OK: Rust → Python ({})",
            python_result.message
        ),
        app_version: state.config.app_version.clone(),
        environment,
        layers: vec![
            LayerStatus {
                name: "frontend".into(),
                status: "ok".into(),
                latency_ms: 0,
            },
            LayerStatus {
                name: "rust".into(),
                status: "ok".into(),
                latency_ms: rust_latency,
            },
            LayerStatus {
                name: "python".into(),
                status: "ok".into(),
                latency_ms: python_latency,
            },
        ],
    })
}

#[tauri::command]
pub fn probe_media_file(path: String) -> Result<MediaMetadata, AppError> {
    let path = PathBuf::from(path);
    validate_user_media_path(&path)?;
    ffmpeg::ensure_ffmpeg_tools()?;
    ffmpeg::probe_media(&path)
}

#[tauri::command]
pub async fn import_media_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<MediaImportResult, AppError> {
    let path = PathBuf::from(path);
    validate_user_media_path(&path)?;
    state.ensure_data_dirs()?;
    crate::audio::ensure_processing_dirs(&state.config.data_dir)?;

    let data_dir = state.config.data_dir.clone();
    tracing::info!("Importing media (async): {}", path.display());

    let result = tauri::async_runtime::spawn_blocking(move || {
        ffmpeg::import_media(&path, &data_dir)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Import task join failed: {err}")))??;

    let mut result = result;
    result.playable_url = state
        .media_server
        .url_for_import_file(&result.playable.path)?;

    // Prepare native player on compact playback.wav (not 70MB canonical).
    let _ = state.player.open(
        &result.native_playback.path,
        result.native_playback.duration,
    );

    tracing::info!(
        "Import complete id={} duration={:.2}s peaks={} url={}",
        result.id,
        result.canonical.duration,
        result.waveform.peak_count,
        result.playable_url
    );

    if let Err(err) = crate::library::upsert_track(
        &state.config.data_dir,
        &crate::library::UpsertLibraryTrackRequest {
            import_id: result.id.clone(),
            file_name: result.source.file_name.clone(),
            source_path: Some(result.source.path.to_string_lossy().into_owned()),
            duration: result.source.duration,
            title: None,
            artist: None,
            album: None,
        },
    ) {
        tracing::warn!("Failed to upsert library track: {err}");
    }

    Ok(result)
}

#[tauri::command]
pub async fn transcribe_import(
    state: State<'_, AppState>,
    request: crate::transcription::TranscribeRequest,
) -> Result<crate::transcription::TranscriptionResultDto, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    let worker = Arc::clone(&state.python_worker);
    let data_dir = state.config.data_dir.clone();
    let ml_timeout =
        std::time::Duration::from_millis(state.config.python_ml_timeout_ms);
    let request = request;

    tauri::async_runtime::spawn_blocking(move || {
        crate::transcription::transcribe_import(
            &worker,
            &data_dir,
            &request.import_id,
            &request,
            ml_timeout,
        )
    })
    .await
    .map_err(|err| AppError::Internal(format!("Transcription task join failed: {err}")))?
}

#[tauri::command]
pub fn get_raw_transcription(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<Option<crate::transcription::TranscriptionResultDto>, AppError> {
    validate_import_id(&import_id)?;
    crate::transcription::load_raw_transcription(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub async fn align_import(
    state: State<'_, AppState>,
    request: crate::alignment::AlignRequest,
) -> Result<crate::alignment::AlignmentResultDto, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    let worker = Arc::clone(&state.python_worker);
    let data_dir = state.config.data_dir.clone();
    let ml_timeout = std::time::Duration::from_millis(state.config.python_ml_timeout_ms);

    tauri::async_runtime::spawn_blocking(move || {
        crate::alignment::align_import(&worker, &data_dir, &request.import_id, &request, ml_timeout)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Alignment task join failed: {err}")))?
}

#[tauri::command]
pub fn get_alignment(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<Option<crate::alignment::AlignmentResultDto>, AppError> {
    validate_import_id(&import_id)?;
    crate::alignment::load_alignment(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub async fn separate_import(
    state: State<'_, AppState>,
    request: crate::separation::SeparateRequest,
) -> Result<crate::separation::SeparationResultDto, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    let worker = Arc::clone(&state.python_worker);
    let data_dir = state.config.data_dir.clone();
    let ml_timeout = std::time::Duration::from_millis(state.config.python_ml_timeout_ms);

    tauri::async_runtime::spawn_blocking(move || {
        crate::separation::separate_import(
            &worker,
            &data_dir,
            &request.import_id,
            &request,
            ml_timeout,
        )
    })
    .await
    .map_err(|err| AppError::Internal(format!("Separation task join failed: {err}")))?
}

#[tauri::command]
pub fn get_separation(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<Option<crate::separation::SeparationResultDto>, AppError> {
    validate_import_id(&import_id)?;
    crate::separation::load_separation(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub async fn correct_lyrics(
    state: State<'_, AppState>,
    request: crate::correction::CorrectLyricsRequest,
) -> Result<crate::correction::CorrectionResultDto, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    let worker = Arc::clone(&state.python_worker);
    let data_dir = state.config.data_dir.clone();
    let ml_timeout = std::time::Duration::from_millis(state.config.python_ml_timeout_ms);

    tauri::async_runtime::spawn_blocking(move || {
        crate::correction::correct_import(
            &worker,
            &data_dir,
            &request.import_id,
            &request,
            ml_timeout,
        )
    })
    .await
    .map_err(|err| AppError::Internal(format!("Correction task join failed: {err}")))?
}

#[tauri::command]
pub fn get_corrected_lyrics(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<Option<crate::correction::CorrectionResultDto>, AppError> {
    validate_import_id(&import_id)?;
    crate::correction::load_correction(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub async fn detect_structure(
    state: State<'_, AppState>,
    request: crate::structure::DetectStructureRequest,
) -> Result<crate::structure::StructureResultDto, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    let worker = Arc::clone(&state.python_worker);
    let data_dir = state.config.data_dir.clone();
    let ml_timeout = std::time::Duration::from_millis(state.config.python_ml_timeout_ms);

    tauri::async_runtime::spawn_blocking(move || {
        crate::structure::detect_import(
            &worker,
            &data_dir,
            &request.import_id,
            &request,
            ml_timeout,
        )
    })
    .await
    .map_err(|err| AppError::Internal(format!("Structure task join failed: {err}")))?
}

#[tauri::command]
pub fn get_structure(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<Option<crate::structure::StructureResultDto>, AppError> {
    validate_import_id(&import_id)?;
    crate::structure::load_structure(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub fn save_edited_lyrics(
    state: State<'_, AppState>,
    request: crate::editor::SaveEditedLyricsRequest,
) -> Result<crate::editor::EditedLyricsDocumentDto, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    crate::editor::save_edited_lyrics(
        &state.config.data_dir,
        &request.import_id,
        &request,
    )
}

#[tauri::command]
pub fn get_edited_lyrics(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<Option<crate::editor::EditedLyricsDocumentDto>, AppError> {
    validate_import_id(&import_id)?;
    crate::editor::load_edited_lyrics(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub async fn resync_import(
    state: State<'_, AppState>,
    request: crate::resync::ResyncRequest,
) -> Result<crate::resync::ResyncResultDto, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;

    let worker = state.python_worker.clone();
    let data_dir = state.config.data_dir.clone();
    let ml_timeout = std::time::Duration::from_millis(state.config.python_ml_timeout_ms);
    let request = request.clone();

    tauri::async_runtime::spawn_blocking(move || {
        crate::resync::resync_import(&worker, &data_dir, &request.import_id, &request, ml_timeout)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Resync task join failed: {err}")))?
}

#[tauri::command]
pub fn get_resync(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<Option<crate::alignment::AlignmentResultDto>, AppError> {
    validate_import_id(&import_id)?;
    crate::resync::load_resync(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub async fn translate_import(
    state: State<'_, AppState>,
    request: crate::translation::TranslateLyricsRequest,
) -> Result<crate::translation::TranslationResultDto, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;

    let worker = state.python_worker.clone();
    let data_dir = state.config.data_dir.clone();
    let ml_timeout = std::time::Duration::from_millis(state.config.python_ml_timeout_ms);
    let request = request.clone();

    tauri::async_runtime::spawn_blocking(move || {
        crate::translation::translate_import(
            &worker,
            &data_dir,
            &request.import_id,
            &request,
            ml_timeout,
        )
    })
    .await
    .map_err(|err| AppError::Internal(format!("Translation task join failed: {err}")))?
}

#[tauri::command]
pub fn get_translation(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<Option<crate::translation::TranslationResultDto>, AppError> {
    validate_import_id(&import_id)?;
    crate::translation::load_translation(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub fn write_export_file(
    request: crate::export::WriteExportFileRequest,
) -> Result<(), AppError> {
    let path = PathBuf::from(&request.path);
    crate::export::write_export_file(&path, &request.contents)
}

#[tauri::command]
pub async fn export_karaoke_video(
    state: State<'_, AppState>,
    request: crate::video_export::ExportKaraokeVideoRequest,
) -> Result<crate::video_export::ExportKaraokeVideoResult, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    let data_dir = state.config.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::video_export::export_karaoke_video(&data_dir, &request)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Video export task join failed: {err}")))?
}

#[tauri::command]
pub async fn save_project(
    state: State<'_, AppState>,
    request: crate::project::SaveProjectRequest,
) -> Result<crate::project::ProjectManifest, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    let data_dir = state.config.data_dir.clone();
    let app_version = state.config.app_version.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::project::save_project(&data_dir, &app_version, &request)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Save project join failed: {err}")))?
}

#[tauri::command]
pub async fn autosave_project(
    state: State<'_, AppState>,
    request: crate::project::AutosaveProjectRequest,
) -> Result<crate::project::ProjectManifest, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    let data_dir = state.config.data_dir.clone();
    let app_version = state.config.app_version.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::project::autosave_project(&data_dir, &app_version, &request)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Autosave project join failed: {err}")))?
}

#[tauri::command]
pub async fn open_project(
    state: State<'_, AppState>,
    request: crate::project::OpenProjectRequest,
) -> Result<crate::project::OpenProjectResult, AppError> {
    state.ensure_data_dirs()?;
    crate::audio::ensure_processing_dirs(&state.config.data_dir)?;
    let data_dir = state.config.data_dir.clone();

    let (mut import_result, manifest, project_path, recovered) =
        tauri::async_runtime::spawn_blocking({
        let request = request.clone();
        move || crate::project::open_project(&data_dir, &request)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Open project join failed: {err}")))??;

    import_result.playable_url = state
        .media_server
        .url_for_import_file(&import_result.playable.path)?;

    let _ = state.player.open(
        &import_result.native_playback.path,
        import_result.native_playback.duration,
    );

    Ok(crate::project::OpenProjectResult {
        import: import_result,
        project_path: project_path.to_string_lossy().into_owned(),
        manifest,
        recovered,
    })
}

#[tauri::command]
pub fn list_recovery_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<crate::project::RecoverySession>, AppError> {
    crate::project::list_recovery_sessions(&state.config.data_dir)
}

#[tauri::command]
pub async fn recover_session(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<crate::project::OpenProjectResult, AppError> {
    state.ensure_data_dirs()?;
    crate::audio::ensure_processing_dirs(&state.config.data_dir)?;
    let data_dir = state.config.data_dir.clone();
    let id = import_id.clone();

    let (mut import_result, manifest, project_path, _recovered) =
        tauri::async_runtime::spawn_blocking(move || {
        crate::project::recover_session(&data_dir, &id)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Recover session join failed: {err}")))??;

    import_result.playable_url = state
        .media_server
        .url_for_import_file(&import_result.playable.path)?;

    let _ = state.player.open(
        &import_result.native_playback.path,
        import_result.native_playback.duration,
    );

    Ok(crate::project::OpenProjectResult {
        import: import_result,
        project_path: project_path.to_string_lossy().into_owned(),
        manifest,
        recovered: true,
    })
}

#[tauri::command]
pub async fn open_import_session(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<MediaImportResult, AppError> {
    validate_import_id(&import_id)?;
    state.ensure_data_dirs()?;
    crate::audio::ensure_processing_dirs(&state.config.data_dir)?;
    let data_dir = state.config.data_dir.clone();
    let id = import_id.clone();

    let mut result = tauri::async_runtime::spawn_blocking(move || {
        let source = crate::library::load_source_metadata(&data_dir, &id)?;
        crate::ffmpeg::load_import_session(&data_dir, &id, &source)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Open import join failed: {err}")))??;

    result.playable_url = state
        .media_server
        .url_for_import_file(&result.playable.path)?;

    let _ = state.player.open(
        &result.native_playback.path,
        result.native_playback.duration,
    );

    Ok(result)
}

#[tauri::command]
pub fn list_library_tracks(
    state: State<'_, AppState>,
    query: crate::library::LibraryQuery,
) -> Result<crate::library::LibraryListResult, AppError> {
    crate::library::list_tracks(&state.config.data_dir, &query)
}

#[tauri::command]
pub fn update_library_track(
    state: State<'_, AppState>,
    request: crate::library::UpdateLibraryTrackRequest,
) -> Result<crate::library::LibraryTrack, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    crate::library::update_track(&state.config.data_dir, &request)
}

#[tauri::command]
pub fn sync_library_track(
    state: State<'_, AppState>,
    request: crate::library::SyncLibraryTrackRequest,
) -> Result<crate::library::LibraryTrack, AppError> {
    validate_import_id(&request.import_id)?;
    state.ensure_data_dirs()?;
    crate::library::sync_track(&state.config.data_dir, &request)
}

#[tauri::command]
pub fn remove_library_track(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<(), AppError> {
    validate_import_id(&import_id)?;
    state.ensure_data_dirs()?;
    crate::library::remove_track(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub fn get_hardware_capabilities(
    state: State<'_, AppState>,
) -> Result<crate::hardware::HardwareCapabilities, AppError> {
    Ok(crate::hardware::get_hardware_capabilities(&state.python_worker))
}

#[tauri::command]
pub fn resolve_compute_backend(
    state: State<'_, AppState>,
    request: crate::hardware::ResolveComputeBackendRequest,
) -> Result<crate::hardware::ResolvedComputeSettings, AppError> {
    let caps = crate::hardware::get_hardware_capabilities(&state.python_worker);
    Ok(crate::hardware::resolve_compute_backend(&caps, &request))
}

#[tauri::command]
pub fn list_model_inventory(
    state: State<'_, AppState>,
) -> Result<crate::models::ModelInventory, AppError> {
    state.ensure_data_dirs()?;
    crate::models::list_model_inventory(&state.python_worker, &state.config.data_dir)
}

#[tauri::command]
pub async fn download_model(
    state: State<'_, AppState>,
    request: crate::models::DownloadModelRequest,
) -> Result<crate::models::ModelInventoryItem, AppError> {
    state.ensure_data_dirs()?;
    let worker = Arc::clone(&state.python_worker);
    let data_dir = state.config.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::models::download_model(&worker, &data_dir, &request)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Download model join failed: {err}")))?
}

#[tauri::command]
pub async fn remove_model(
    state: State<'_, AppState>,
    request: crate::models::RemoveModelRequest,
) -> Result<(), AppError> {
    state.ensure_data_dirs()?;
    let worker = Arc::clone(&state.python_worker);
    let data_dir = state.config.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::models::remove_model(&worker, &data_dir, &request)
    })
    .await
    .map_err(|err| AppError::Internal(format!("Remove model join failed: {err}")))?
}

#[tauri::command]
pub fn get_model_preferences(
    state: State<'_, AppState>,
) -> Result<crate::models::ModelPreferences, AppError> {
    state.ensure_data_dirs()?;
    crate::models::load_model_preferences(&state.config.data_dir)
}

#[tauri::command]
pub fn set_model_preferences(
    state: State<'_, AppState>,
    preferences: crate::models::ModelPreferences,
) -> Result<crate::models::ModelPreferences, AppError> {
    state.ensure_data_dirs()?;
    crate::models::save_model_preferences(&state.config.data_dir, &preferences)
}

#[tauri::command]
pub fn get_import_performance(
    state: State<'_, AppState>,
    import_id: String,
) -> Result<crate::performance::ImportPerformanceProfile, AppError> {
    validate_import_id(&import_id)?;
    crate::performance::load_import_performance(&state.config.data_dir, &import_id)
}

#[tauri::command]
pub fn get_performance_summary(
    state: State<'_, AppState>,
) -> Result<crate::performance::PerformanceSummary, AppError> {
    crate::performance::load_performance_summary(&state.config.data_dir)
}

#[tauri::command]
pub async fn mix_stems_preview(
    state: State<'_, AppState>,
    request: crate::separation::MixPreviewRequest,
) -> Result<crate::separation::MixPreviewResult, AppError> {
    validate_import_id(&request.import_id)?;

    let separation = crate::separation::load_separation(&state.config.data_dir, &request.import_id)?
        .ok_or_else(|| {
            AppError::Media("No separation result — run Separate first.".into())
        })?;

    let vocals = separation
        .stems
        .iter()
        .find(|s| s.role == "vocals")
        .ok_or_else(|| AppError::Media("Vocals stem missing".into()))?;
    let instrumental = separation
        .stems
        .iter()
        .find(|s| s.role == "instrumental")
        .ok_or_else(|| AppError::Media("Instrumental stem missing".into()))?;

    let vocals_path = validate_imports_file(
        &state.config.data_dir,
        &PathBuf::from(
            vocals
                .playback_path
                .as_ref()
                .unwrap_or(&vocals.path),
        ),
    )?;
    let instrumental_path = validate_imports_file(
        &state.config.data_dir,
        &PathBuf::from(
            instrumental
                .playback_path
                .as_ref()
                .unwrap_or(&instrumental.path),
        ),
    )?;

    let out = state
        .config
        .data_dir
        .join("imports")
        .join(&request.import_id)
        .join("stems")
        .join("mixer_preview.wav");

    let vocals_gain = request.vocals_gain.clamp(0.0, 1.5);
    let instrumental_gain = request.instrumental_gain.clamp(0.0, 1.5);
    let duration = vocals.duration.max(instrumental.duration);

    tauri::async_runtime::spawn_blocking(move || {
        crate::separation::mix_stems_preview(
            &vocals_path,
            &instrumental_path,
            &out,
            vocals_gain,
            instrumental_gain,
        )?;
        Ok(crate::separation::MixPreviewResult {
            path: out.to_string_lossy().into_owned(),
            duration,
        })
    })
    .await
    .map_err(|err| AppError::Internal(format!("Mix preview join failed: {err}")))?
}

#[tauri::command]
pub async fn generate_waveform_for_path(
    state: State<'_, AppState>,
    path: String,
    peak_count: Option<usize>,
) -> Result<crate::audio::WaveformData, AppError> {
    let path = PathBuf::from(path);
    let path = validate_imports_file(&state.config.data_dir, &path)?;
    let peaks = peak_count.unwrap_or(crate::audio::DEFAULT_WAVEFORM_PEAKS);

    tauri::async_runtime::spawn_blocking(move || crate::audio::generate_waveform(&path, peaks))
        .await
        .map_err(|err| AppError::Internal(format!("Waveform task join failed: {err}")))?
}

#[tauri::command]
pub async fn player_open(
    state: State<'_, AppState>,
    path: String,
    duration: f64,
) -> Result<PlayerStatus, AppError> {
    let path = PathBuf::from(path);
    let path = validate_imports_file(&state.config.data_dir, &path)?;
    let resolved = resolve_native_playback_path(&path)?;
    let player = Arc::clone(&state.player);
    tauri::async_runtime::spawn_blocking(move || {
        player.open(&resolved, duration)?;
        player.status()
    })
    .await
    .map_err(|err| AppError::Internal(format!("Player open join failed: {err}")))?
}

#[tauri::command]
pub async fn player_play(state: State<'_, AppState>) -> Result<PlayerStatus, AppError> {
    let player = Arc::clone(&state.player);
    tauri::async_runtime::spawn_blocking(move || {
        player.play()?;
        player.status()
    })
    .await
    .map_err(|err| AppError::Internal(format!("Player play join failed: {err}")))?
}

#[tauri::command]
pub async fn player_pause(state: State<'_, AppState>) -> Result<PlayerStatus, AppError> {
    let player = Arc::clone(&state.player);
    tauri::async_runtime::spawn_blocking(move || {
        player.pause()?;
        player.status()
    })
    .await
    .map_err(|err| AppError::Internal(format!("Player pause join failed: {err}")))?
}

#[tauri::command]
pub async fn player_seek(
    state: State<'_, AppState>,
    position: f64,
) -> Result<PlayerStatus, AppError> {
    let player = Arc::clone(&state.player);
    tauri::async_runtime::spawn_blocking(move || {
        player.seek(position)?;
        player.status()
    })
    .await
    .map_err(|err| AppError::Internal(format!("Player seek join failed: {err}")))?
}

#[tauri::command]
pub fn player_status(state: State<'_, AppState>) -> Result<PlayerStatus, AppError> {
    state.player.status()
}

#[tauri::command]
pub async fn player_stop(state: State<'_, AppState>) -> Result<PlayerStatus, AppError> {
    let player = Arc::clone(&state.player);
    tauri::async_runtime::spawn_blocking(move || {
        player.stop()?;
        player.status()
    })
    .await
    .map_err(|err| AppError::Internal(format!("Player stop join failed: {err}")))?
}

#[tauri::command]
pub fn player_set_volume(
    state: State<'_, AppState>,
    volume: f32,
) -> Result<PlayerStatus, AppError> {
    state.player.set_volume(volume)?;
    state.player.status()
}

fn resolve_native_playback_path(path: &Path) -> Result<PathBuf, AppError> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();

    if name == "playback.wav" {
        return Ok(path.to_path_buf());
    }

    if let Some(dir) = path.parent() {
        let playback = dir.join("playback.wav");
        if playback.exists() {
            return Ok(playback);
        }

        // Older imports: build playback.wav from canonical.wav if present.
        let canonical = if name == "canonical.wav" {
            path.to_path_buf()
        } else {
            dir.join("canonical.wav")
        };
        if canonical.exists() {
            crate::audio::encode_playback_wav(&canonical, &playback)?;
            return Ok(playback);
        }
    }

    Ok(path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_response_serializes_with_camel_case() {
        let response = HealthResponse {
            status: "healthy".into(),
            app_version: "0.1.0".into(),
            environment: detect_environment(),
            python: PythonHealth {
                available: true,
                version: Some("0.1.0".into()),
                worker_id: Some("worker-1".into()),
            },
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"appVersion\":\"0.1.0\""));
        assert!(json.contains("\"workerId\":\"worker-1\""));
    }

    #[test]
    fn validate_rejects_missing_user_media_path() {
        let err =
            validate_user_media_path(Path::new("/tmp/vocalis-does-not-exist-xyz.mp3")).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("not found") || msg.contains("File not found"));
    }
}
