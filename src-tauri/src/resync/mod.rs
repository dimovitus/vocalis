//! Phase 11 — text-aware lyrics resync after manual edits.

mod types;

pub use types::{RawResyncArtifact, ResyncRequest, ResyncResultDto, ResyncStatsDto};

use crate::alignment::{AlignmentResultDto, AlignedWordDto};
use crate::editor::{self, EditedLineDto, EditedLyricsDocumentDto, EditedWordDto, SaveEditedLyricsRequest};
use crate::error::AppError;
use crate::services::{import_dir, imports_path, PythonWorker};
use crate::transcription::{prepare_whisper_wav, WHISPER_WAV_FILE};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::time::Duration;

pub const RAW_RESYNC_FILE: &str = "raw_resync.json";
pub const RESYNC_FILE: &str = "resync.json";

const DEFAULT_MIN_CONFIDENCE: f64 = 0.35;

pub fn resync_import(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &ResyncRequest,
    ml_timeout: Duration,
) -> Result<ResyncResultDto, AppError> {
    crate::performance::timed_pipeline(data_dir, import_id, "resync", None, || {
        resync_import_inner(worker, data_dir, import_id, request, ml_timeout)
    })
}

fn resync_import_inner(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &ResyncRequest,
    ml_timeout: Duration,
) -> Result<ResyncResultDto, AppError> {
    let import_dir = import_dir(data_dir, import_id)?;

    let canonical = import_dir.join("canonical.wav");
    if !canonical.exists() {
        return Err(AppError::Media(format!(
            "Canonical audio missing for import {import_id}"
        )));
    }

    let edited = editor::load_edited_lyrics(data_dir, import_id)?.ok_or_else(|| {
        AppError::Media(format!(
            "No edited lyrics for import {import_id}. Save edits in the Editor first."
        ))
    })?;

    if edited.lines.is_empty() {
        return Err(AppError::Media(
            "Edited lyrics document has no lines to resync".into(),
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
    let model_size = request.model_size.clone().unwrap_or_else(|| "tiny".into());
    let language = request.language.clone().or(edited.language.clone());
    let min_confidence = request
        .min_confidence
        .unwrap_or(DEFAULT_MIN_CONFIDENCE)
        .clamp(0.0, 1.0);

    let lines: Vec<serde_json::Value> = edited
        .lines
        .iter()
        .map(|line| {
            let mut payload = json!({
                "text": line.text,
                "start": line.start,
                "end": line.end,
            });
            if !line.words.is_empty() {
                payload["words"] = json!(line
                    .words
                    .iter()
                    .map(|w| json!({
                        "text": w.text,
                        "start": w.start,
                        "end": w.end,
                    }))
                    .collect::<Vec<_>>());
            }
            payload
        })
        .collect();

    let params = json!({
        "audioPath": whisper_wav.to_string_lossy(),
        "engine": engine,
        "modelSize": model_size,
        "language": language,
        "lines": lines,
        "downloadRoot": models_dir.to_string_lossy(),
        "device": request.device,
        "computeType": request.compute_type,
        "allowDownload": false,
    });

    let alignment: AlignmentResultDto =
        worker.call_with_timeout("resync", Some(params), ml_timeout)?;

    persist_resync(&import_dir.join(RAW_RESYNC_FILE), &alignment, true)?;
    persist_resync(&import_dir.join(RESYNC_FILE), &alignment, false)?;

    let (document, stats) = merge_resync(&edited, &alignment, min_confidence);

    editor::save_edited_lyrics(
        data_dir,
        import_id,
        &SaveEditedLyricsRequest {
            import_id: import_id.to_string(),
            document: document.clone(),
        },
    )?;

    Ok(ResyncResultDto {
        engine: alignment.engine.clone(),
        model: alignment.model.clone(),
        language: alignment.language.clone(),
        duration: alignment.duration,
        document,
        stats,
        raw: alignment.raw.clone(),
    })
}

fn persist_resync(
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
                .unwrap_or("raw_resync")
        ));
        fs::rename(path, &archived).map_err(|err| {
            AppError::Internal(format!("Failed to archive previous resync: {err}"))
        })?;
        tracing::info!("Archived previous resync to {}", archived.display());
    }

    let artifact = RawResyncArtifact {
        schema_version: 1,
        preserved: true,
        note: "Text-aware resync from edited lyrics. Raw transcription untouched.".into(),
        result: result.clone(),
    };

    let json = serde_json::to_string_pretty(&artifact)
        .map_err(|err| AppError::Internal(format!("Failed to serialize resync: {err}")))?;
    fs::write(path, json).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write resync {}: {err}",
            path.display()
        ))
    })?;
    Ok(())
}

pub fn load_resync(
    data_dir: &Path,
    import_id: &str,
) -> Result<Option<AlignmentResultDto>, AppError> {
    let base = imports_path(data_dir, import_id)?;
    let path = base.join(RESYNC_FILE);
    let path = if path.exists() {
        path
    } else {
        base.join(RAW_RESYNC_FILE)
    };
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|err| AppError::Internal(format!("Failed to read resync: {err}")))?;
    let artifact: RawResyncArtifact = serde_json::from_slice(&bytes)
        .map_err(|err| AppError::Internal(format!("Invalid resync JSON: {err}")))?;
    Ok(Some(artifact.result))
}

fn merge_resync(
    edited: &EditedLyricsDocumentDto,
    alignment: &AlignmentResultDto,
    min_confidence: f64,
) -> (EditedLyricsDocumentDto, ResyncStatsDto) {
    let mut lines_updated = 0u32;
    let mut words_updated = 0u32;
    let mut words_kept = 0u32;

    let lines: Vec<EditedLineDto> = edited
        .lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let aligned = alignment.lines.get(index);
            let Some(aligned) = aligned else {
                words_kept += line.words.len() as u32;
                return line.clone();
            };

            let (words, updated, kept) =
                merge_words(&line.words, &aligned.words, min_confidence);
            words_updated += updated;
            words_kept += kept;

            if updated == 0 {
                return line.clone();
            }

            lines_updated += 1;
            let mut merged = line.clone();
            merged.words = words;
            merged = sync_line_bounds(merged);

            if merged.words.is_empty() && line_avg_confidence(&aligned.words) >= min_confidence {
                merged.start = aligned.start;
                merged.end = aligned.end;
            }

            merged
        })
        .collect();

    let document = EditedLyricsDocumentDto {
        language: edited.language.clone(),
        lines,
    };

    let stats = ResyncStatsDto {
        lines_total: edited.lines.len() as u32,
        lines_updated,
        words_updated,
        words_kept,
        min_confidence,
    };

    (document, stats)
}

fn merge_words(
    edited_words: &[EditedWordDto],
    aligned_words: &[AlignedWordDto],
    min_confidence: f64,
) -> (Vec<EditedWordDto>, u32, u32) {
    if aligned_words.is_empty() {
        return (
            edited_words.to_vec(),
            0,
            edited_words.len() as u32,
        );
    }

    if edited_words.is_empty() {
        if line_avg_confidence(aligned_words) < min_confidence {
            return (Vec::new(), 0, 0);
        }
        let words = aligned_words
            .iter()
            .map(|w| EditedWordDto {
                text: w.text.clone(),
                start: w.start,
                end: w.end,
                confidence: w.confidence,
            })
            .collect();
        return (words, aligned_words.len() as u32, 0);
    }

    let max_len = edited_words.len().max(aligned_words.len());
    let mut merged = Vec::with_capacity(max_len);
    let mut updated = 0u32;
    let mut kept = 0u32;

    for i in 0..max_len {
        match (edited_words.get(i), aligned_words.get(i)) {
            (Some(edited), Some(aligned)) if aligned.confidence >= min_confidence => {
                merged.push(EditedWordDto {
                    text: edited.text.clone(),
                    start: aligned.start,
                    end: aligned.end,
                    confidence: aligned.confidence,
                });
                updated += 1;
            }
            (Some(edited), Some(_)) => {
                merged.push(edited.clone());
                kept += 1;
            }
            (Some(edited), None) => {
                merged.push(edited.clone());
                kept += 1;
            }
            (None, Some(aligned)) if aligned.confidence >= min_confidence => {
                merged.push(EditedWordDto {
                    text: aligned.text.clone(),
                    start: aligned.start,
                    end: aligned.end,
                    confidence: aligned.confidence,
                });
                updated += 1;
            }
            _ => {}
        }
    }

    (merged, updated, kept)
}

fn sync_line_bounds(mut line: EditedLineDto) -> EditedLineDto {
    if line.words.is_empty() {
        return line;
    }
    line.start = line.words[0].start;
    line.end = line.words[line.words.len() - 1].end;
    line.text = line.words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
    line
}

fn line_avg_confidence(words: &[AlignedWordDto]) -> f64 {
    if words.is_empty() {
        return 0.0;
    }
    words.iter().map(|w| w.confidence).sum::<f64>() / words.len() as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::alignment::{AlignedLineDto, AlignedWordDto};

    #[test]
    fn merge_resync_respects_confidence_threshold() {
        let edited = EditedLyricsDocumentDto {
            language: Some("en".into()),
            lines: vec![EditedLineDto {
                text: "hello world".into(),
                start: 0.0,
                end: 1.0,
                words: vec![
                    EditedWordDto {
                        text: "hello".into(),
                        start: 0.0,
                        end: 0.5,
                        confidence: 1.0,
                    },
                    EditedWordDto {
                        text: "world".into(),
                        start: 0.5,
                        end: 1.0,
                        confidence: 1.0,
                    },
                ],
                section: None,
                translation: None,
                transliteration: None,
            }],
        };

        let alignment = AlignmentResultDto {
            engine: "stable-ts".into(),
            model: "tiny".into(),
            language: Some("en".into()),
            duration: 2.0,
            lines: vec![AlignedLineDto {
                text: "hello world".into(),
                start: 1.0,
                end: 2.0,
                words: vec![
                    AlignedWordDto {
                        text: "hello".into(),
                        start: 1.0,
                        end: 1.4,
                        confidence: 0.9,
                    },
                    AlignedWordDto {
                        text: "world".into(),
                        start: 1.4,
                        end: 2.0,
                        confidence: 0.2,
                    },
                ],
            }],
            raw: json!({}),
        };

        let (document, stats) = merge_resync(&edited, &alignment, 0.35);
        assert_eq!(document.lines[0].words[0].start, 1.0);
        assert_eq!(document.lines[0].words[1].start, 0.5);
        assert_eq!(stats.words_updated, 1);
        assert_eq!(stats.words_kept, 1);
    }
}
