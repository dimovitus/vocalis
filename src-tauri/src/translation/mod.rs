//! Phase 12 — lyrics translation orchestration (separate from transcription).

mod types;

pub use types::{
    RawTranslationArtifact, TranslateLyricsRequest, TranslatedLineDto, TranslationResultDto,
};

use crate::alignment::{self, AlignmentResultDto};
use crate::correction::{self, CorrectionResultDto};
use crate::editor::{self, EditedLyricsDocumentDto, SaveEditedLyricsRequest};
use crate::error::AppError;
use crate::services::{import_dir, imports_path, PythonWorker};
use crate::transcription::{self, TranscriptionResultDto};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::time::Duration;

pub const TRANSLATION_FILE: &str = "translation.json";
pub const RAW_TRANSLATION_FILE: &str = "raw_translation_lyrics.json";

pub fn translate_import(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &TranslateLyricsRequest,
    ml_timeout: Duration,
) -> Result<TranslationResultDto, AppError> {
    crate::performance::timed_pipeline(data_dir, import_id, "translate", None, || {
        translate_import_inner(worker, data_dir, import_id, request, ml_timeout)
    })
}

fn translate_import_inner(
    worker: &PythonWorker,
    data_dir: &Path,
    import_id: &str,
    request: &TranslateLyricsRequest,
    ml_timeout: Duration,
) -> Result<TranslationResultDto, AppError> {
    let import_dir = import_dir(data_dir, import_id)?;

    let edited = editor::load_edited_lyrics(data_dir, import_id)?;
    let correction = correction::load_correction(data_dir, import_id)?;
    let alignment = alignment::load_alignment(data_dir, import_id)?;
    let transcription = transcription::load_raw_transcription(data_dir, import_id)?;

    let (source_language, lines_json) = build_translation_input(
        edited.as_ref(),
        correction.as_ref(),
        alignment.as_ref(),
        transcription.as_ref(),
        request.source_language.as_deref(),
    )?;

    let models_dir = data_dir.join("models").join("argos-translate");
    fs::create_dir_all(&models_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create translation models directory: {err}"))
    })?;

    let engine = request
        .engine
        .clone()
        .unwrap_or_else(|| "argos-translate".into());
    let mode = request
        .mode
        .clone()
        .unwrap_or_else(|| "natural".into());

    let params = json!({
        "lines": lines_json,
        "engine": engine,
        "sourceLanguage": source_language,
        "targetLanguage": request.target_language,
        "mode": mode,
        "includeTransliteration": request.include_transliteration.unwrap_or(true),
        "downloadRoot": models_dir.to_string_lossy(),
        "allowDownload": false,
    });

    let result: TranslationResultDto =
        worker.call_with_timeout("translate", Some(params), ml_timeout)?;

    persist_translation(&import_dir.join(RAW_TRANSLATION_FILE), &result, true)?;
    persist_translation(&import_dir.join(TRANSLATION_FILE), &result, false)?;

    if request.apply_to_edited.unwrap_or(true) {
        if let Some(mut document) = edited.or_else(|| lyrics_document_from_layers(
            correction.as_ref(),
            alignment.as_ref(),
            transcription.as_ref(),
        )) {
            apply_translation_to_document(&mut document, &result);
            editor::save_edited_lyrics(
                data_dir,
                import_id,
                &SaveEditedLyricsRequest {
                    import_id: import_id.to_string(),
                    document,
                },
            )?;
        }
    }

    Ok(result)
}

fn build_translation_input(
    edited: Option<&EditedLyricsDocumentDto>,
    correction: Option<&CorrectionResultDto>,
    alignment: Option<&AlignmentResultDto>,
    transcription: Option<&TranscriptionResultDto>,
    source_override: Option<&str>,
) -> Result<(String, Vec<serde_json::Value>), AppError> {
    if let Some(edited) = edited {
        if !edited.lines.is_empty() {
            let lines: Vec<serde_json::Value> = edited
                .lines
                .iter()
                .map(|line| json!({ "text": line.text, "start": line.start, "end": line.end }))
                .collect();
            let source = source_override
                .map(str::to_string)
                .or_else(|| edited.language.clone())
                .unwrap_or_else(|| "en".into());
            return Ok((source, lines));
        }
    }

    if let Some(correction) = correction {
        if !correction.lines.is_empty() {
            let lines: Vec<serde_json::Value> = correction
                .lines
                .iter()
                .map(|line| json!({ "text": line.text, "start": line.start, "end": line.end }))
                .collect();
            let source = source_override
                .map(str::to_string)
                .or_else(|| correction.language.clone())
                .unwrap_or_else(|| "en".into());
            return Ok((source, lines));
        }
    }

    if let Some(alignment) = alignment {
        if !alignment.lines.is_empty() {
            let lines: Vec<serde_json::Value> = alignment
                .lines
                .iter()
                .map(|line| json!({ "text": line.text, "start": line.start, "end": line.end }))
                .collect();
            let source = source_override
                .map(str::to_string)
                .or_else(|| alignment.language.clone())
                .unwrap_or_else(|| "en".into());
            return Ok((source, lines));
        }
    }

    if let Some(transcription) = transcription {
        if !transcription.segments.is_empty() {
            let lines: Vec<serde_json::Value> = transcription
                .segments
                .iter()
                .map(|seg| json!({ "text": seg.text, "start": seg.start, "end": seg.end }))
                .collect();
            let source = source_override
                .map(str::to_string)
                .or_else(|| transcription.language.clone())
                .unwrap_or_else(|| "en".into());
            return Ok((source, lines));
        }
    }

    Err(AppError::Media(
        "Need lyrics (edited, corrected, aligned, or transcribed) before translation".into(),
    ))
}

fn lyrics_document_from_layers(
    correction: Option<&CorrectionResultDto>,
    alignment: Option<&AlignmentResultDto>,
    transcription: Option<&TranscriptionResultDto>,
) -> Option<EditedLyricsDocumentDto> {
    if let Some(correction) = correction {
        if !correction.lines.is_empty() {
            return Some(EditedLyricsDocumentDto {
                language: correction.language.clone(),
                lines: correction
                    .lines
                    .iter()
                    .map(|line| crate::editor::EditedLineDto {
                        text: line.text.clone(),
                        start: line.start,
                        end: line.end,
                        words: line
                            .words
                            .iter()
                            .map(|w| crate::editor::EditedWordDto {
                                text: w.text.clone(),
                                start: w.start,
                                end: w.end,
                                confidence: w.confidence,
                            })
                            .collect(),
                        section: None,
                        translation: None,
                        transliteration: None,
                    })
                    .collect(),
            });
        }
    }

    if let Some(alignment) = alignment {
        if !alignment.lines.is_empty() {
            return Some(EditedLyricsDocumentDto {
                language: alignment.language.clone(),
                lines: alignment
                    .lines
                    .iter()
                    .map(|line| crate::editor::EditedLineDto {
                        text: line.text.clone(),
                        start: line.start,
                        end: line.end,
                        words: line
                            .words
                            .iter()
                            .map(|w| crate::editor::EditedWordDto {
                                text: w.text.clone(),
                                start: w.start,
                                end: w.end,
                                confidence: w.confidence,
                            })
                            .collect(),
                        section: None,
                        translation: None,
                        transliteration: None,
                    })
                    .collect(),
            });
        }
    }

    if let Some(transcription) = transcription {
        if !transcription.segments.is_empty() {
            return Some(EditedLyricsDocumentDto {
                language: transcription.language.clone(),
                lines: transcription
                    .segments
                    .iter()
                    .map(|seg| crate::editor::EditedLineDto {
                        text: seg.text.clone(),
                        start: seg.start,
                        end: seg.end,
                        words: seg
                            .words
                            .iter()
                            .map(|w| crate::editor::EditedWordDto {
                                text: w.text.clone(),
                                start: w.start,
                                end: w.end,
                                confidence: w.confidence,
                            })
                            .collect(),
                        section: None,
                        translation: None,
                        transliteration: None,
                    })
                    .collect(),
            });
        }
    }

    None
}

pub fn apply_translation_to_document(
    document: &mut EditedLyricsDocumentDto,
    result: &TranslationResultDto,
) {
    for item in &result.lines {
        let idx = item.line_index as usize;
        if let Some(line) = document.lines.get_mut(idx) {
            line.translation = Some(item.translation.clone());
            line.transliteration = item.transliteration.clone();
        }
    }
}

fn persist_translation(
    path: &Path,
    result: &TranslationResultDto,
    archive_previous: bool,
) -> Result<(), AppError> {
    if archive_previous && path.exists() {
        let stamp = uuid::Uuid::new_v4();
        let archived = path.with_file_name(format!(
            "{}.{stamp}.json",
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("raw_translation_lyrics")
        ));
        fs::rename(path, &archived).map_err(|err| {
            AppError::Internal(format!("Failed to archive previous translation: {err}"))
        })?;
    }

    let artifact = RawTranslationArtifact {
        schema_version: 1,
        preserved: true,
        note: "Lyrics translation layer. Transcription and alignment remain untouched.".into(),
        result: result.clone(),
    };

    let json = serde_json::to_string_pretty(&artifact).map_err(|err| {
        AppError::Internal(format!("Failed to serialize translation: {err}"))
    })?;
    fs::write(path, json).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write translation {}: {err}",
            path.display()
        ))
    })?;
    Ok(())
}

pub fn load_translation(
    data_dir: &Path,
    import_id: &str,
) -> Result<Option<TranslationResultDto>, AppError> {
    let base = imports_path(data_dir, import_id)?;
    let path = base.join(TRANSLATION_FILE);
    let path = if path.exists() {
        path
    } else {
        base.join(RAW_TRANSLATION_FILE)
    };
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|err| AppError::Internal(format!("Failed to read translation: {err}")))?;
    let artifact: RawTranslationArtifact = serde_json::from_slice(&bytes)
        .map_err(|err| AppError::Internal(format!("Invalid translation JSON: {err}")))?;
    Ok(Some(artifact.result))
}
