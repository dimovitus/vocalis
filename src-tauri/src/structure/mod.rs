//! Phase 7 — optional lyrics structure detection.

mod types;

pub use types::{
    DetectStructureRequest, LineStructureLabelDto, StructureArtifact, StructureResultDto,
    StructureSectionDto,
};

use crate::alignment::{self, AlignmentResultDto};
use crate::correction;
use crate::error::AppError;
use crate::services::{import_dir, imports_path, PythonWorker};
use crate::transcription::{self, TranscriptionResultDto};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::time::Duration;

pub const STRUCTURE_FILE: &str = "structure.json";
pub const RAW_STRUCTURE_FILE: &str = "raw_structure.json";

pub fn detect_import(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &DetectStructureRequest,
    ml_timeout: Duration,
) -> Result<StructureResultDto, AppError> {
    crate::performance::timed_pipeline(data_dir, import_id, "structure", None, || {
        detect_import_inner(worker, data_dir, import_id, request, ml_timeout)
    })
}

fn detect_import_inner(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &DetectStructureRequest,
    ml_timeout: Duration,
) -> Result<StructureResultDto, AppError> {
    let import_dir = import_dir(data_dir, import_id)?;

    let correction = correction::load_correction(data_dir, import_id)?;
    let alignment = alignment::load_alignment(data_dir, import_id)?;
    let transcription = transcription::load_raw_transcription(data_dir, import_id)?;

    let (lines_json, duration) =
        build_structure_input(correction.as_ref(), alignment.as_ref(), transcription.as_ref())?;

    // Prefer 16 kHz mono whisper wav for energy; fall back to canonical
    let whisper_wav = import_dir.join(crate::transcription::WHISPER_WAV_FILE);
    let canonical = import_dir.join("canonical.wav");
    let audio_path = if whisper_wav.exists() {
        whisper_wav
    } else if canonical.exists() {
        canonical
    } else {
        return Err(AppError::Media(format!(
            "Audio missing for structure detection on import {import_id}"
        )));
    };

    let engine = request
        .engine
        .clone()
        .unwrap_or_else(|| "lyric-audio-structure".into());

    let params = json!({
        "engine": engine,
        "lines": lines_json,
        "audioPath": audio_path.to_string_lossy(),
        "duration": duration,
        "minConfidence": request.min_confidence.unwrap_or(0.45),
    });

    let result: StructureResultDto =
        worker.call_with_timeout("detect_structure", Some(params), ml_timeout)?;

    persist_structure(&import_dir.join(RAW_STRUCTURE_FILE), &result, true)?;
    persist_structure(&import_dir.join(STRUCTURE_FILE), &result, false)?;

    Ok(result)
}

fn build_structure_input(
    correction: Option<&crate::correction::CorrectionResultDto>,
    alignment: Option<&AlignmentResultDto>,
    transcription: Option<&TranscriptionResultDto>,
) -> Result<(Vec<serde_json::Value>, Option<f64>), AppError> {
    if let Some(correction) = correction {
        if !correction.lines.is_empty() {
            let duration = correction
                .lines
                .iter()
                .map(|l| l.end)
                .fold(0.0_f64, f64::max);
            let lines = correction
                .lines
                .iter()
                .map(|line| {
                    json!({
                        "text": line.text,
                        "start": line.start,
                        "end": line.end,
                    })
                })
                .collect();
            return Ok((lines, Some(duration)));
        }
    }

    if let Some(alignment) = alignment {
        if !alignment.lines.is_empty() {
            let lines = alignment
                .lines
                .iter()
                .map(|line| {
                    json!({
                        "text": line.text,
                        "start": line.start,
                        "end": line.end,
                    })
                })
                .collect();
            return Ok((lines, Some(alignment.duration)));
        }
    }

    if let Some(transcription) = transcription {
        if !transcription.segments.is_empty() {
            let lines = transcription
                .segments
                .iter()
                .map(|seg| {
                    json!({
                        "text": seg.text,
                        "start": seg.start,
                        "end": seg.end,
                    })
                })
                .collect();
            return Ok((lines, Some(transcription.duration)));
        }
    }

    Err(AppError::Media(
        "Need transcription, alignment, or corrected lyrics before structure detection".into(),
    ))
}

fn persist_structure(
    path: &Path,
    result: &StructureResultDto,
    archive_previous: bool,
) -> Result<(), AppError> {
    if archive_previous && path.exists() {
        let stamp = uuid::Uuid::new_v4();
        let archived = path.with_file_name(format!(
            "{}.{stamp}.json",
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("raw_structure")
        ));
        fs::rename(path, &archived).map_err(|err| {
            AppError::Internal(format!("Failed to archive previous structure: {err}"))
        })?;
    }

    let artifact = StructureArtifact {
        schema_version: 1,
        preserved: true,
        note: "Optional structure overlay. Lyrics text and timestamps are never mutated.".into(),
        result: result.clone(),
    };
    let json = serde_json::to_string_pretty(&artifact).map_err(|err| {
        AppError::Internal(format!("Failed to serialize structure: {err}"))
    })?;
    fs::write(path, json).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write structure {}: {err}",
            path.display()
        ))
    })?;
    Ok(())
}

pub fn load_structure(
    data_dir: &Path,
    import_id: &str,
) -> Result<Option<StructureResultDto>, AppError> {
    let base = imports_path(data_dir, import_id)?;
    let path = base.join(STRUCTURE_FILE);
    let path = if path.exists() {
        path
    } else {
        base.join(RAW_STRUCTURE_FILE)
    };
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|err| AppError::Internal(format!("Failed to read structure: {err}")))?;
    let artifact: StructureArtifact = serde_json::from_slice(&bytes)
        .map_err(|err| AppError::Internal(format!("Invalid structure JSON: {err}")))?;
    Ok(Some(artifact.result))
}
