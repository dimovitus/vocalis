//! Phase 4 — word-level alignment orchestration.

mod types;

pub use types::{
    AlignRequest, AlignedLineDto, AlignedWordDto, AlignmentResultDto, RawAlignmentArtifact,
};

use crate::error::AppError;
use crate::services::{import_dir, imports_path, PythonWorker};
use crate::transcription::{
    load_raw_transcription, prepare_whisper_wav, RAW_TRANSCRIPTION_FILE, WHISPER_WAV_FILE,
};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::time::Duration;

pub const RAW_ALIGNMENT_FILE: &str = "raw_alignment.json";
pub const ALIGNMENT_FILE: &str = "alignment.json";

pub fn align_import(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &AlignRequest,
    ml_timeout: Duration,
) -> Result<AlignmentResultDto, AppError> {
    crate::performance::timed_pipeline(data_dir, import_id, "align", None, || {
        align_import_inner(worker, data_dir, import_id, request, ml_timeout)
    })
}

fn align_import_inner(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &AlignRequest,
    ml_timeout: Duration,
) -> Result<AlignmentResultDto, AppError> {
    let import_dir = import_dir(data_dir, import_id)?;

    let canonical = import_dir.join("canonical.wav");
    if !canonical.exists() {
        return Err(AppError::Media(format!(
            "Canonical audio missing for import {import_id}"
        )));
    }

    let transcription = load_raw_transcription(data_dir, import_id)?.ok_or_else(|| {
        AppError::Media(format!(
            "No raw transcription for import {import_id}. Run Transcribe first."
        ))
    })?;

    if transcription.segments.is_empty() && transcription.text.trim().is_empty() {
        return Err(AppError::Media(
            "Transcription has no segments/text to align".into(),
        ));
    }

    let whisper_wav = import_dir.join(WHISPER_WAV_FILE);
    prepare_whisper_wav(&canonical, &whisper_wav)?;

    let models_dir = data_dir.join("models").join("faster-whisper");
    fs::create_dir_all(&models_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create models directory: {err}"))
    })?;

    let engine = request
        .engine
        .clone()
        .unwrap_or_else(|| "stable-ts".into());
    let model_size = request
        .model_size
        .clone()
        .or(Some(transcription.model.clone()))
        .unwrap_or_else(|| "tiny".into());
    let language = request
        .language
        .clone()
        .or(transcription.language.clone());

    let segments: Vec<serde_json::Value> = transcription
        .segments
        .iter()
        .map(|seg| {
            json!({
                "id": seg.id,
                "text": seg.text,
                "start": seg.start,
                "end": seg.end,
                "confidence": seg.confidence,
            })
        })
        .collect();

    let params = json!({
        "audioPath": whisper_wav.to_string_lossy(),
        "engine": engine,
        "modelSize": model_size,
        "language": language,
        "segments": segments,
        "downloadRoot": models_dir.to_string_lossy(),
        "device": request.device,
        "computeType": request.compute_type,
        "allowDownload": false,
    });

    let result: AlignmentResultDto =
        worker.call_with_timeout("align", Some(params), ml_timeout)?;

    persist_alignment(&import_dir.join(RAW_ALIGNMENT_FILE), &result, true)?;
    persist_alignment(&import_dir.join(ALIGNMENT_FILE), &result, false)?;

    let _ = RAW_TRANSCRIPTION_FILE; // keep import paired with transcription artifact
    Ok(result)
}

fn persist_alignment(
    path: &Path,
    result: &AlignmentResultDto,
    archive_previous: bool,
) -> Result<(), AppError> {
    if archive_previous && path.exists() {
        let stamp = uuid::Uuid::new_v4();
        let archived = path.with_file_name(format!(
            "{}.{stamp}.json",
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("raw_alignment")
        ));
        fs::rename(path, &archived).map_err(|err| {
            AppError::Internal(format!("Failed to archive previous alignment: {err}"))
        })?;
        tracing::info!("Archived previous alignment to {}", archived.display());
    }

    let artifact = RawAlignmentArtifact {
        schema_version: 1,
        preserved: true,
        note: "Word-level alignment (audio-aware). Separate from raw transcription.".into(),
        result: result.clone(),
    };

    let json = serde_json::to_string_pretty(&artifact).map_err(|err| {
        AppError::Internal(format!("Failed to serialize alignment: {err}"))
    })?;
    fs::write(path, json).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write alignment {}: {err}",
            path.display()
        ))
    })?;
    Ok(())
}

pub fn load_alignment(
    data_dir: &Path,
    import_id: &str,
) -> Result<Option<AlignmentResultDto>, AppError> {
    let base = imports_path(data_dir, import_id)?;
    let path = base.join(ALIGNMENT_FILE);
    let path = if path.exists() {
        path
    } else {
        base.join(RAW_ALIGNMENT_FILE)
    };
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|err| AppError::Internal(format!("Failed to read alignment: {err}")))?;
    let artifact: RawAlignmentArtifact = serde_json::from_slice(&bytes)
        .map_err(|err| AppError::Internal(format!("Invalid alignment JSON: {err}")))?;
    Ok(Some(artifact.result))
}
