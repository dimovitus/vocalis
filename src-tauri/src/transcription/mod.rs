//! Phase 3 — AI transcription orchestration (Rust ↔ Python engines).

mod prepare;
mod types;

pub use prepare::prepare_whisper_wav;
pub use types::{
    RawTranscriptionArtifact, TranscribeRequest, TranscriptionResultDto, TranscriptionSegmentDto,
};

use crate::error::AppError;
use crate::services::{import_dir, imports_path, PythonWorker};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::time::Duration;

pub const RAW_TRANSCRIPTION_FILE: &str = "raw_transcription.json";
pub const WHISPER_WAV_FILE: &str = "whisper_16k_mono.wav";

/// Run local transcription for an imported track and persist the raw artifact.
pub fn transcribe_import(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &TranscribeRequest,
    ml_timeout: Duration,
) -> Result<TranscriptionResultDto, AppError> {
    crate::performance::timed_pipeline(data_dir, import_id, "transcribe", None, || {
        transcribe_import_inner(worker, data_dir, import_id, request, ml_timeout)
    })
}

fn transcribe_import_inner(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &TranscribeRequest,
    ml_timeout: Duration,
) -> Result<TranscriptionResultDto, AppError> {
    let import_dir = import_dir(data_dir, import_id)?;

    let canonical = import_dir.join("canonical.wav");
    if !canonical.exists() {
        return Err(AppError::Media(format!(
            "Canonical audio missing for import {import_id}"
        )));
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
        .unwrap_or_else(|| "faster-whisper".into());
    let model_size = request.model_size.clone().unwrap_or_else(|| "tiny".into());

    let params = json!({
        "audioPath": whisper_wav.to_string_lossy(),
        "engine": engine,
        "modelSize": model_size,
        "language": request.language,
        "wordTimestamps": request.word_timestamps.unwrap_or(false),
        "downloadRoot": models_dir.to_string_lossy(),
        "device": request.device,
        "computeType": request.compute_type,
        "allowDownload": false,
    });

    let result: TranscriptionResultDto =
        worker.call_with_timeout("transcribe", Some(params), ml_timeout)?;

    let raw_path = import_dir.join(RAW_TRANSCRIPTION_FILE);
    persist_raw_transcription(&raw_path, &result)?;

    Ok(result)
}

fn persist_raw_transcription(
    path: &Path,
    result: &TranscriptionResultDto,
) -> Result<(), AppError> {
    // Never overwrite an existing raw artifact — archive it first.
    if path.exists() {
        let stamp = uuid::Uuid::new_v4();
        let archived = path.with_file_name(format!("raw_transcription.{stamp}.json"));
        fs::rename(path, &archived).map_err(|err| {
            AppError::Internal(format!(
                "Failed to archive previous raw transcription: {err}"
            ))
        })?;
        tracing::info!(
            "Archived previous raw transcription to {}",
            archived.display()
        );
    }

    let artifact = RawTranscriptionArtifact {
        schema_version: 1,
        preserved: true,
        note: "Raw model output. Do not mutate; corrections are stored separately.".into(),
        result: result.clone(),
    };

    let json = serde_json::to_string_pretty(&artifact).map_err(|err| {
        AppError::Internal(format!("Failed to serialize raw transcription: {err}"))
    })?;
    fs::write(path, json).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write raw transcription {}: {err}",
            path.display()
        ))
    })?;
    Ok(())
}

pub fn load_raw_transcription(
    data_dir: &Path,
    import_id: &str,
) -> Result<Option<TranscriptionResultDto>, AppError> {
    let path = imports_path(data_dir, import_id)?.join(RAW_TRANSCRIPTION_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|err| {
        AppError::Internal(format!("Failed to read raw transcription: {err}"))
    })?;
    let artifact: RawTranscriptionArtifact = serde_json::from_slice(&bytes).map_err(|err| {
        AppError::Internal(format!("Invalid raw transcription JSON: {err}"))
    })?;
    Ok(Some(artifact.result))
}
