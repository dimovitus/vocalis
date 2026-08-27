//! Phase 5 — vocal / stem separation orchestration.

mod types;

pub use types::{
    MixPreviewRequest, MixPreviewResult, RawSeparationArtifact, SeparateRequest,
    SeparationResultDto, StemAssetDto,
};

use crate::audio::encode_playback_wav;
use crate::error::AppError;
use crate::services::{import_dir, imports_path, PythonWorker};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

pub const SEPARATION_FILE: &str = "separation.json";
pub const RAW_SEPARATION_FILE: &str = "raw_separation.json";
pub const STEMS_DIR: &str = "stems";

pub fn separate_import(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &SeparateRequest,
    ml_timeout: Duration,
) -> Result<SeparationResultDto, AppError> {
    crate::performance::timed_pipeline(data_dir, import_id, "separate", None, || {
        separate_import_inner(worker, data_dir, import_id, request, ml_timeout)
    })
}

fn separate_import_inner(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &SeparateRequest,
    ml_timeout: Duration,
) -> Result<SeparationResultDto, AppError> {
    let import_dir = import_dir(data_dir, import_id)?;

    let canonical = import_dir.join("canonical.wav");
    if !canonical.exists() {
        return Err(AppError::Media(format!(
            "Canonical audio missing for import {import_id}"
        )));
    }

    let stems_dir = import_dir.join(STEMS_DIR);
    if stems_dir.exists() {
        let _ = fs::remove_dir_all(&stems_dir);
    }
    fs::create_dir_all(&stems_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create stems directory: {err}"))
    })?;

    let models_dir = data_dir.join("models").join("demucs-onnx");
    fs::create_dir_all(&models_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create demucs cache directory: {err}"))
    })?;

    let engine = request
        .engine
        .clone()
        .unwrap_or_else(|| "demucs-onnx".into());
    let model = request.model.clone().unwrap_or_else(|| "htdemucs".into());
    let precision = request
        .precision
        .clone()
        .unwrap_or_else(|| "fp16weights".into());
    let providers = request.providers.clone().unwrap_or_else(|| "cpu".into());

    let params = json!({
        "audioPath": canonical.to_string_lossy(),
        "outputDir": stems_dir.to_string_lossy(),
        "engine": engine,
        "model": model,
        "cacheDir": models_dir.to_string_lossy(),
        "providers": providers,
        "precision": precision,
        "allowDownload": false,
    });

    let mut result: SeparationResultDto =
        worker.call_with_timeout("separate", Some(params), ml_timeout)?;

    // Ensure compact playback WAVs for native rodio (avoid huge 44.1k stems).
    for stem in &mut result.stems {
        let src = PathBuf::from(&stem.path);
        if !src.exists() {
            continue;
        }
        let playback = src.with_file_name(format!(
            "{}.playback.wav",
            src.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(stem.name.as_str())
        ));
        encode_playback_wav(&src, &playback)?;
        stem.playback_path = Some(playback.to_string_lossy().into_owned());
    }

    // Attach original reference stem for the mixer UI.
    let original_playback = import_dir.join("playback.wav");
    if !original_playback.exists() {
        encode_playback_wav(&canonical, &original_playback)?;
    }
    let original_meta = fs::metadata(&canonical).ok();
    let duration = result
        .stems
        .iter()
        .find(|s| s.role == "vocals")
        .map(|s| s.duration)
        .unwrap_or(0.0);

    result.stems.insert(
        0,
        StemAssetDto {
            name: "original".into(),
            path: canonical.to_string_lossy().into_owned(),
            playback_path: Some(original_playback.to_string_lossy().into_owned()),
            role: "original".into(),
            sample_rate: 44_100,
            channels: 2,
            duration,
            file_size: original_meta.map(|m| m.len()),
        },
    );

    persist_separation(&import_dir.join(RAW_SEPARATION_FILE), &result, true)?;
    persist_separation(&import_dir.join(SEPARATION_FILE), &result, false)?;

    Ok(result)
}

fn persist_separation(
    path: &Path,
    result: &SeparationResultDto,
    archive_previous: bool,
) -> Result<(), AppError> {
    if archive_previous && path.exists() {
        let stamp = uuid::Uuid::new_v4();
        let archived = path.with_file_name(format!(
            "{}.{stamp}.json",
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("raw_separation")
        ));
        fs::rename(path, &archived).map_err(|err| {
            AppError::Internal(format!("Failed to archive previous separation: {err}"))
        })?;
    }

    let artifact = RawSeparationArtifact {
        schema_version: 1,
        preserved: true,
        note: "Stem separation artifact. Model name is provider-local, not app-wide."
            .into(),
        result: result.clone(),
    };
    let json = serde_json::to_string_pretty(&artifact).map_err(|err| {
        AppError::Internal(format!("Failed to serialize separation: {err}"))
    })?;
    fs::write(path, json).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write separation {}: {err}",
            path.display()
        ))
    })?;
    Ok(())
}

pub fn load_separation(
    data_dir: &Path,
    import_id: &str,
) -> Result<Option<SeparationResultDto>, AppError> {
    let base = imports_path(data_dir, import_id)?;
    let path = base.join(SEPARATION_FILE);
    let path = if path.exists() {
        path
    } else {
        base.join(RAW_SEPARATION_FILE)
    };
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|err| AppError::Internal(format!("Failed to read separation: {err}")))?;
    let artifact: RawSeparationArtifact = serde_json::from_slice(&bytes)
        .map_err(|err| AppError::Internal(format!("Invalid separation JSON: {err}")))?;
    Ok(Some(artifact.result))
}

/// Mix vocals + instrumental with gain into a temp playback WAV (for mixer preview).
pub fn mix_stems_preview(
    vocals: &Path,
    instrumental: &Path,
    output: &Path,
    vocals_gain: f32,
    instrumental_gain: f32,
) -> Result<(), AppError> {
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            AppError::Internal(format!("Failed to create mix output dir: {err}"))
        })?;
    }

    let filter = format!(
        "[0:a]volume={vocals_gain:.4}[v];[1:a]volume={instrumental_gain:.4}[i];[v][i]amix=inputs=2:duration=longest:dropout_transition=0,aformat=sample_fmts=s16:sample_rates=22050:channel_layouts=stereo[out]"
    );

    let result = Command::new("ffmpeg")
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(vocals)
        .arg("-i")
        .arg(instrumental)
        .args(["-filter_complex", &filter, "-map", "[out]", "-acodec", "pcm_s16le"])
        .arg(output)
        .output()
        .map_err(|err| AppError::Ffmpeg(format!("Failed to mix stems: {err}")))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(AppError::Ffmpeg(format!(
            "Stem mix failed: {}",
            stderr.trim()
        )));
    }
    Ok(())
}
