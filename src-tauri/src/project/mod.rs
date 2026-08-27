//! Phase 15 — `.vocalis` directory-based project save / open / autosave / recovery.

mod types;

pub use types::{
    AutosaveProjectRequest, OpenProjectRequest, OpenProjectResult, ProjectLayers,
    ProjectManifest, ProjectSourceMeta, RecoverySession, SaveProjectRequest,
};

use crate::alignment::ALIGNMENT_FILE;
use crate::correction::CORRECTED_LYRICS_FILE;
use crate::editor::EDITED_LYRICS_FILE;
use crate::error::AppError;
use crate::ffmpeg::{
    self, load_import_session, MediaImportResult, MediaMetadata,
};
use crate::resync::RESYNC_FILE;
use crate::separation::{SEPARATION_FILE, STEMS_DIR};
use crate::services::{import_dir, imports_path, validate_import_id, validate_recovery_project_dir};
use crate::structure::STRUCTURE_FILE;
use crate::transcription::RAW_TRANSCRIPTION_FILE;
use crate::translation::TRANSLATION_FILE;
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};

pub const PROJECT_MANIFEST: &str = "project.json";
pub const ARTIFACTS_DIR: &str = "artifacts";
pub const MEDIA_DIR: &str = "media";
pub const CANONICAL_COPY: &str = "canonical.wav";
pub const SOURCE_META: &str = "source.meta.json";
pub const RECOVERY_DIR: &str = "recovery";

const ARTIFACT_FILES: &[&str] = &[
    RAW_TRANSCRIPTION_FILE,
    ALIGNMENT_FILE,
    CORRECTED_LYRICS_FILE,
    STRUCTURE_FILE,
    EDITED_LYRICS_FILE,
    RESYNC_FILE,
    TRANSLATION_FILE,
    SEPARATION_FILE,
    "waveform.json",
];

pub fn save_project(
    data_dir: &Path,
    app_version: &str,
    request: &SaveProjectRequest,
) -> Result<ProjectManifest, AppError> {
    let import_id = validate_import_id(&request.import_id)?;
    let import_path = import_dir(data_dir, &import_id)?;
    let project_dir = normalize_project_dir(&request.path)?;

    save_project_bundle(
        data_dir,
        app_version,
        &import_path,
        &import_id,
        &project_dir,
        request.theme_id.as_deref(),
        request.title.as_deref(),
        false,
        Some(project_dir.to_string_lossy().into_owned()),
    )
}

pub fn autosave_project(
    data_dir: &Path,
    app_version: &str,
    request: &AutosaveProjectRequest,
) -> Result<ProjectManifest, AppError> {
    let import_id = validate_import_id(&request.import_id)?;
    let import_path = import_dir(data_dir, &import_id)?;
    let recovery_root = data_dir.join(RECOVERY_DIR);
    fs::create_dir_all(&recovery_root).map_err(|err| {
        AppError::Internal(format!("Failed to create recovery directory: {err}"))
    })?;
    let project_dir = recovery_root.join(&import_id);

    save_project_bundle(
        data_dir,
        app_version,
        &import_path,
        &import_id,
        &project_dir,
        request.theme_id.as_deref(),
        None,
        true,
        request.linked_path.clone(),
    )
}

pub fn open_project(
    data_dir: &Path,
    request: &OpenProjectRequest,
) -> Result<(MediaImportResult, ProjectManifest, PathBuf, bool), AppError> {
    let project_dir = resolve_project_dir(&request.path)?;
    let recovered = is_recovery_path(data_dir, &project_dir);
    if recovered {
        validate_recovery_project_dir(data_dir, &project_dir)?;
    }
    let manifest = read_manifest(&project_dir)?;
    let import_id = validate_import_id(&manifest.import_id)?;

    restore_project_to_import(data_dir, &project_dir, &import_id)?;

    let source = source_metadata_from_manifest(&manifest);
    let import_result = load_import_session(data_dir, &import_id, &source)?;

    Ok((import_result, manifest, project_dir, recovered))
}

fn is_recovery_path(data_dir: &Path, project_dir: &Path) -> bool {
    let recovery_root = data_dir.join(RECOVERY_DIR);
    project_dir.starts_with(&recovery_root)
}

pub fn list_recovery_sessions(data_dir: &Path) -> Result<Vec<RecoverySession>, AppError> {
    let recovery_root = data_dir.join(RECOVERY_DIR);
    if !recovery_root.is_dir() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();
    for entry in fs::read_dir(&recovery_root).map_err(|err| {
        AppError::Internal(format!("Failed to read recovery directory: {err}"))
    })? {
        let entry = entry.map_err(|err| AppError::Internal(format!("Recovery entry: {err}")))?;
        if !entry.file_type().map_err(|err| {
            AppError::Internal(format!("Recovery entry type: {err}"))
        })?.is_dir()
        {
            continue;
        }

        let manifest_path = entry.path().join(PROJECT_MANIFEST);
        if !manifest_path.is_file() {
            continue;
        }

        let manifest = read_manifest(&entry.path())?;
        sessions.push(RecoverySession {
            import_id: manifest.import_id,
            title: manifest.title,
            updated_at: manifest.updated_at,
            linked_project_path: manifest.linked_path,
            recovery_path: entry.path().to_string_lossy().into_owned(),
        });
    }

    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

pub fn recover_session(
    data_dir: &Path,
    import_id: &str,
) -> Result<(MediaImportResult, ProjectManifest, PathBuf, bool), AppError> {
    let id = validate_import_id(import_id)?;
    let recovery_path = data_dir.join(RECOVERY_DIR).join(&id);
    if !recovery_path.is_dir() {
        return Err(AppError::Media(format!("No recovery session for {id}")));
    }

    open_project(
        data_dir,
        &OpenProjectRequest {
            path: recovery_path.to_string_lossy().into_owned(),
        },
    )
}

fn save_project_bundle(
    _data_dir: &Path,
    app_version: &str,
    import_path: &Path,
    import_id: &str,
    project_dir: &Path,
    theme_id: Option<&str>,
    title_override: Option<&str>,
    autosave: bool,
    linked_path: Option<String>,
) -> Result<ProjectManifest, AppError> {
    let canonical = import_path.join(CANONICAL_COPY);
    if !canonical.is_file() {
        return Err(AppError::Media(
            "Cannot save project — canonical audio is missing.".into(),
        ));
    }

    let artifacts_dir = project_dir.join(ARTIFACTS_DIR);
    let media_dir = project_dir.join(MEDIA_DIR);
    fs::create_dir_all(&artifacts_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create project artifacts dir: {err}"))
    })?;
    fs::create_dir_all(&media_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create project media dir: {err}"))
    })?;

    copy_file(&canonical, &media_dir.join(CANONICAL_COPY))?;

    let source_meta = build_source_meta(import_path)?;
    write_json(&media_dir.join(SOURCE_META), &source_meta)?;

    for name in ARTIFACT_FILES {
        let src = import_path.join(name);
        if src.is_file() {
            copy_file(&src, &artifacts_dir.join(name))?;
        }
    }

    let stems_src = import_path.join(STEMS_DIR);
    let stems_dst = project_dir.join(STEMS_DIR);
    if stems_src.is_dir() {
        copy_dir_recursive(&stems_src, &stems_dst)?;
    } else if stems_dst.exists() {
        let _ = fs::remove_dir_all(&stems_dst);
    }

    let layers = detect_layers(&artifacts_dir, project_dir);
    let now = Utc::now().to_rfc3339();
    let created_at = project_dir
        .join(PROJECT_MANIFEST)
        .exists()
        .then(|| read_manifest(project_dir).ok().map(|m| m.created_at))
        .flatten()
        .unwrap_or_else(|| now.clone());

    let title = title_override
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            read_manifest(project_dir)
                .ok()
                .map(|m| m.title)
        })
        .unwrap_or_else(|| source_meta.file_name.clone());

    let manifest = ProjectManifest {
        schema_version: 1,
        format: "vocalis-project".into(),
        app_version: app_version.into(),
        created_at,
        updated_at: now,
        import_id: import_id.into(),
        title,
        source: source_meta,
        theme_id: theme_id.map(str::to_owned),
        layers,
        linked_path: if autosave { linked_path } else { Some(project_dir.to_string_lossy().into_owned()) },
        autosave,
    };

    write_json(&project_dir.join(PROJECT_MANIFEST), &manifest)?;

    tracing::info!(
        "Saved {} project {} (import={})",
        if autosave { "autosave" } else { "user" },
        project_dir.display(),
        import_id
    );

    Ok(manifest)
}

fn restore_project_to_import(
    data_dir: &Path,
    project_dir: &Path,
    import_id: &str,
) -> Result<(), AppError> {
    let import_path = imports_path(data_dir, import_id)?;
    fs::create_dir_all(&import_path).map_err(|err| {
        AppError::Internal(format!("Failed to create import directory: {err}"))
    })?;

    let canonical_src = project_dir.join(MEDIA_DIR).join(CANONICAL_COPY);
    if !canonical_src.is_file() {
        return Err(AppError::Media(
            "Project is missing media/canonical.wav".into(),
        ));
    }
    copy_file(&canonical_src, &import_path.join(CANONICAL_COPY))?;

    let artifacts_src = project_dir.join(ARTIFACTS_DIR);
    if artifacts_src.is_dir() {
        for name in ARTIFACT_FILES {
            let src = artifacts_src.join(name);
            if src.is_file() {
                copy_file(&src, &import_path.join(name))?;
            }
        }
    }

    let stems_src = project_dir.join(STEMS_DIR);
    let stems_dst = import_path.join(STEMS_DIR);
    if stems_src.is_dir() {
        if stems_dst.exists() {
            fs::remove_dir_all(&stems_dst).map_err(|err| {
                AppError::Internal(format!("Failed to replace stems directory: {err}"))
            })?;
        }
        copy_dir_recursive(&stems_src, &stems_dst)?;
    }

    Ok(())
}

fn build_source_meta(import_path: &Path) -> Result<ProjectSourceMeta, AppError> {
    let meta_path = import_path.join("source.json");
    if meta_path.is_file() {
        if let Ok(bytes) = fs::read(&meta_path) {
            if let Ok(source) = serde_json::from_slice::<MediaMetadata>(&bytes) {
                return Ok(project_source_from_media(&source));
            }
        }
    }

    let canonical = import_path.join(CANONICAL_COPY);
    let probed = ffmpeg::probe_media(&canonical)?;
    Ok(project_source_from_media(&probed))
}

fn project_source_from_media(source: &MediaMetadata) -> ProjectSourceMeta {
    ProjectSourceMeta {
        file_name: source.file_name.clone(),
        original_path: Some(source.path.to_string_lossy().into_owned()),
        duration: source.duration,
        sample_rate: source.sample_rate,
        channels: source.channels,
        codec: source.codec.clone(),
        format_name: source.format_name.clone(),
        bit_rate: source.bit_rate,
        file_size: source.file_size,
        has_audio: source.has_audio,
        has_video: source.has_video,
    }
}

fn source_metadata_from_manifest(manifest: &ProjectManifest) -> MediaMetadata {
    MediaMetadata {
        path: manifest
            .source
            .original_path
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(&manifest.source.file_name)),
        file_name: manifest.source.file_name.clone(),
        format_name: manifest.source.format_name.clone(),
        duration: manifest.source.duration,
        sample_rate: manifest.source.sample_rate,
        channels: manifest.source.channels,
        codec: manifest.source.codec.clone(),
        bit_rate: manifest.source.bit_rate,
        has_audio: manifest.source.has_audio,
        has_video: manifest.source.has_video,
        file_size: manifest.source.file_size,
    }
}

fn detect_layers(artifacts_dir: &Path, project_dir: &Path) -> ProjectLayers {
    ProjectLayers {
        has_transcription: artifacts_dir.join(RAW_TRANSCRIPTION_FILE).is_file(),
        has_alignment: artifacts_dir.join(ALIGNMENT_FILE).is_file(),
        has_correction: artifacts_dir.join(CORRECTED_LYRICS_FILE).is_file(),
        has_structure: artifacts_dir.join(STRUCTURE_FILE).is_file(),
        has_edited_lyrics: artifacts_dir.join(EDITED_LYRICS_FILE).is_file(),
        has_resync: artifacts_dir.join(RESYNC_FILE).is_file(),
        has_translation: artifacts_dir.join(TRANSLATION_FILE).is_file(),
        has_separation: artifacts_dir.join(SEPARATION_FILE).is_file(),
        has_stems: project_dir.join(STEMS_DIR).is_dir(),
    }
}

fn read_manifest(project_dir: &Path) -> Result<ProjectManifest, AppError> {
    let path = project_dir.join(PROJECT_MANIFEST);
    let bytes = fs::read(&path).map_err(|err| {
        AppError::Media(format!("Failed to read project manifest: {err}"))
    })?;
    let manifest: ProjectManifest = serde_json::from_slice(&bytes).map_err(|err| {
        AppError::Media(format!("Invalid project manifest: {err}"))
    })?;
    if manifest.schema_version != 1 || manifest.format != "vocalis-project" {
        return Err(AppError::Media(
            "Unsupported project format or schema version".into(),
        ));
    }
    Ok(manifest)
}

fn normalize_project_dir(path: &str) -> Result<PathBuf, AppError> {
    let raw = PathBuf::from(path.trim());
    if raw.as_os_str().is_empty() {
        return Err(AppError::Media("Project path is required".into()));
    }
    if !raw.is_absolute() {
        return Err(AppError::Media(
            "Project path must be absolute (use the save dialog)".into(),
        ));
    }

    let project_dir = if raw.extension().and_then(|e| e.to_str()) == Some("vocalis") {
        raw
    } else if raw.file_name().and_then(|n| n.to_str()) == Some(PROJECT_MANIFEST) {
        raw.parent()
            .ok_or_else(|| AppError::Media("Invalid project path".into()))?
            .to_path_buf()
    } else {
        return Err(AppError::Media(
            "Project path must be a .vocalis directory".into(),
        ));
    };

    fs::create_dir_all(&project_dir).map_err(|err| {
        AppError::Internal(format!(
            "Failed to create project directory {}: {err}",
            project_dir.display()
        ))
    })?;

    Ok(project_dir)
}

fn resolve_project_dir(path: &str) -> Result<PathBuf, AppError> {
    let raw = PathBuf::from(path.trim());
    if raw.as_os_str().is_empty() {
        return Err(AppError::Media("Project path is required".into()));
    }
    if !raw.is_absolute() {
        return Err(AppError::Media(
            "Project path must be absolute (use the open dialog)".into(),
        ));
    }

    let project_dir = if raw.is_dir() {
        if raw.join(PROJECT_MANIFEST).is_file() {
            raw
        } else if raw.extension().and_then(|e| e.to_str()) == Some("vocalis") {
            return Err(AppError::Media(format!(
                "Not a Vocalis project (missing {PROJECT_MANIFEST}): {}",
                raw.display()
            )));
        } else {
            return Err(AppError::Media(
                "Selected folder is not a Vocalis project".into(),
            ));
        }
    } else if raw.file_name().and_then(|n| n.to_str()) == Some(PROJECT_MANIFEST) {
        raw.parent()
            .ok_or_else(|| AppError::Media("Invalid project path".into()))?
            .to_path_buf()
    } else {
        return Err(AppError::Media(
            "Open a .vocalis project directory or its project.json".into(),
        ));
    };

    Ok(project_dir)
}

fn copy_file(from: &Path, to: &Path) -> Result<(), AppError> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            AppError::Internal(format!("Failed to create directory {}: {err}", parent.display()))
        })?;
    }
    fs::copy(from, to).map_err(|err| {
        AppError::Internal(format!(
            "Failed to copy {} → {}: {err}",
            from.display(),
            to.display()
        ))
    })?;
    Ok(())
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), AppError> {
    fs::create_dir_all(to).map_err(|err| {
        AppError::Internal(format!("Failed to create directory {}: {err}", to.display()))
    })?;

    for entry in fs::read_dir(from).map_err(|err| {
        AppError::Internal(format!("Failed to read directory {}: {err}", from.display()))
    })? {
        let entry = entry.map_err(|err| AppError::Internal(format!("Directory entry: {err}")))?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if src.is_dir() {
            copy_dir_recursive(&src, &dst)?;
        } else {
            copy_file(&src, &dst)?;
        }
    }
    Ok(())
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    let json = serde_json::to_string_pretty(value).map_err(|err| {
        AppError::Internal(format!("Failed to serialize JSON: {err}"))
    })?;
    fs::write(path, format!("{json}\n")).map_err(|err| {
        AppError::Internal(format!("Failed to write {}: {err}", path.display()))
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("vocalis-project-test-{stamp}"))
    }

    #[test]
    fn save_and_open_roundtrip() {
        let root = temp_root();
        let data_dir = root.join("data");
        let import_id = Uuid::new_v4().to_string();
        let import_path = data_dir.join("imports").join(&import_id);
        fs::create_dir_all(&import_path).unwrap();
        fs::write(import_path.join(CANONICAL_COPY), b"RIFF").unwrap();
        fs::write(
            import_path.join("source.json"),
            br#"{"path":"/tmp/demo.mp3","fileName":"demo.mp3","duration":120.0,"hasAudio":true,"hasVideo":false}"#,
        )
        .unwrap();

        let project_path = root.join("MySong.vocalis");
        let manifest = save_project_bundle(
            &data_dir,
            "0.1.0",
            &import_path,
            &import_id,
            &project_path,
            Some("neon"),
            Some("Test Song"),
            false,
            None,
        )
        .expect("save");

        assert_eq!(manifest.title, "Test Song");
        assert_eq!(manifest.theme_id.as_deref(), Some("neon"));
        assert!(project_path.join(MEDIA_DIR).join(CANONICAL_COPY).is_file());

        let new_import = Uuid::new_v4().to_string();
        restore_project_to_import(&data_dir, &project_path, &new_import).expect("restore");
        assert!(data_dir
            .join("imports")
            .join(&new_import)
            .join(CANONICAL_COPY)
            .is_file());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_relative_project_path() {
        let err = normalize_project_dir("relative/MySong.vocalis").unwrap_err();
        assert!(err.to_string().contains("absolute"));
    }
}
