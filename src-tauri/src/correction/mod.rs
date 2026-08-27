//! Phase 6 — AI lyrics correction orchestration.

mod types;

pub use types::{
    CorrectLyricsRequest, CorrectedLineDto, CorrectedWordDto, CorrectionResultDto, LyricChangeDto,
    RawCorrectionArtifact,
};

use crate::alignment::{self, AlignmentResultDto};
use crate::error::AppError;
use crate::services::{import_dir, imports_path, PythonWorker};
use crate::transcription::{
    self, prepare_whisper_wav, TranscriptionResultDto, WHISPER_WAV_FILE,
};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::time::Duration;

pub const CORRECTED_LYRICS_FILE: &str = "corrected_lyrics.json";
pub const RAW_CORRECTION_FILE: &str = "raw_correction.json";

pub fn correct_import(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &CorrectLyricsRequest,
    ml_timeout: Duration,
) -> Result<CorrectionResultDto, AppError> {
    crate::performance::timed_pipeline(data_dir, import_id, "correct", None, || {
        correct_import_inner(worker, data_dir, import_id, request, ml_timeout)
    })
}

fn correct_import_inner(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &CorrectLyricsRequest,
    ml_timeout: Duration,
) -> Result<CorrectionResultDto, AppError> {
    let import_dir = import_dir(data_dir, import_id)?;

    let canonical = import_dir.join("canonical.wav");
    if !canonical.exists() {
        return Err(AppError::Media(format!(
            "Canonical audio missing for import {import_id}"
        )));
    }

    let alignment = alignment::load_alignment(data_dir, import_id)?;
    let transcription = transcription::load_raw_transcription(data_dir, import_id)?;

    let (language, lines_json) = build_correction_input(alignment.as_ref(), transcription.as_ref())?;

    let whisper_wav = import_dir.join(WHISPER_WAV_FILE);
    prepare_whisper_wav(&canonical, &whisper_wav)?;

    let models_dir = data_dir.join("models").join("faster-whisper");
    fs::create_dir_all(&models_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create models directory: {err}"))
    })?;

    let engine = request
        .engine
        .clone()
        .unwrap_or_else(|| "whisper-context".into());
    let model_size = request.model_size.clone().unwrap_or_else(|| {
        transcription
            .as_ref()
            .map(|t| t.model.clone())
            .unwrap_or_else(|| "tiny".into())
    });
    let language = request.language.clone().or(language);

    let params = json!({
        "audioPath": whisper_wav.to_string_lossy(),
        "engine": engine,
        "language": language,
        "lines": lines_json,
        "modelSize": model_size,
        "downloadRoot": models_dir.to_string_lossy(),
        "device": request.device,
        "computeType": request.compute_type,
        "lowConfidenceThreshold": request.low_confidence_threshold.unwrap_or(0.35),
        "allowDownload": false,
    });

    let result: CorrectionResultDto =
        worker.call_with_timeout("correct", Some(params), ml_timeout)?;

    persist_correction(&import_dir.join(RAW_CORRECTION_FILE), &result, true)?;
    persist_correction(&import_dir.join(CORRECTED_LYRICS_FILE), &result, false)?;

    Ok(result)
}

fn build_correction_input(
    alignment: Option<&AlignmentResultDto>,
    transcription: Option<&TranscriptionResultDto>,
) -> Result<(Option<String>, Vec<serde_json::Value>), AppError> {
    if let Some(alignment) = alignment {
        if !alignment.lines.is_empty() {
            let lines = alignment
                .lines
                .iter()
                .map(|line| {
                    let words: Vec<serde_json::Value> = line
                        .words
                        .iter()
                        .map(|w| {
                            json!({
                                "text": w.text,
                                "start": w.start,
                                "end": w.end,
                                "confidence": w.confidence,
                            })
                        })
                        .collect();
                    let avg_conf = if line.words.is_empty() {
                        0.5
                    } else {
                        line.words.iter().map(|w| w.confidence).sum::<f64>()
                            / line.words.len() as f64
                    };
                    json!({
                        "text": line.text,
                        "start": line.start,
                        "end": line.end,
                        "confidence": avg_conf,
                        "words": words,
                    })
                })
                .collect();
            return Ok((alignment.language.clone(), lines));
        }
    }

    if let Some(transcription) = transcription {
        if !transcription.segments.is_empty() {
            let lines = transcription
                .segments
                .iter()
                .map(|seg| {
                    let words: Vec<serde_json::Value> = seg
                        .words
                        .iter()
                        .map(|w| {
                            json!({
                                "text": w.text,
                                "start": w.start,
                                "end": w.end,
                                "confidence": w.confidence,
                            })
                        })
                        .collect();
                    json!({
                        "text": seg.text,
                        "start": seg.start,
                        "end": seg.end,
                        "confidence": seg.confidence,
                        "words": words,
                    })
                })
                .collect();
            return Ok((transcription.language.clone(), lines));
        }
    }

    Err(AppError::Media(
        "Need transcription or alignment before lyrics correction".into(),
    ))
}

fn persist_correction(
    path: &Path,
    result: &CorrectionResultDto,
    archive_previous: bool,
) -> Result<(), AppError> {
    if archive_previous && path.exists() {
        let stamp = uuid::Uuid::new_v4();
        let archived = path.with_file_name(format!(
            "{}.{stamp}.json",
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("raw_correction")
        ));
        fs::rename(path, &archived).map_err(|err| {
            AppError::Internal(format!("Failed to archive previous correction: {err}"))
        })?;
    }

    let artifact = RawCorrectionArtifact {
        schema_version: 1,
        preserved: true,
        note: "Corrected lyrics layer. Raw transcription remains untouched.".into(),
        result: result.clone(),
    };
    let json = serde_json::to_string_pretty(&artifact).map_err(|err| {
        AppError::Internal(format!("Failed to serialize correction: {err}"))
    })?;
    fs::write(path, json).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write correction {}: {err}",
            path.display()
        ))
    })?;
    Ok(())
}

pub fn load_correction(
    data_dir: &Path,
    import_id: &str,
) -> Result<Option<CorrectionResultDto>, AppError> {
    let base = imports_path(data_dir, import_id)?;
    let path = base.join(CORRECTED_LYRICS_FILE);
    let path = if path.exists() {
        path
    } else {
        base.join(RAW_CORRECTION_FILE)
    };
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|err| AppError::Internal(format!("Failed to read correction: {err}")))?;
    let artifact: RawCorrectionArtifact = serde_json::from_slice(&bytes)
        .map_err(|err| AppError::Internal(format!("Invalid correction JSON: {err}")))?;
    Ok(Some(artifact.result))
}
