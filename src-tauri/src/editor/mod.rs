//! Phase 10 — user-edited lyrics layer (separate from AI artifacts).

mod types;

pub use types::{
    EditedLineDto, EditedLyricsArtifact, EditedLyricsDocumentDto, EditedWordDto,
    SaveEditedLyricsRequest,
};

use crate::error::AppError;
use crate::services::imports_path;
use std::fs;
use std::path::Path;

pub const EDITED_LYRICS_FILE: &str = "edited_lyrics.json";

pub fn save_edited_lyrics(
    data_dir: &Path,
    import_id: &str,
    request: &SaveEditedLyricsRequest,
) -> Result<EditedLyricsDocumentDto, AppError> {
    let import_dir = imports_path(data_dir, import_id)?;
    if !import_dir.is_dir() {
        return Err(AppError::Media(format!("Import not found: {import_id}")));
    }

    let path = import_dir.join(EDITED_LYRICS_FILE);
    if path.exists() {
        let stamp = uuid::Uuid::new_v4();
        let archived = path.with_file_name(format!("edited_lyrics.{stamp}.json"));
        fs::rename(&path, &archived).map_err(|err| {
            AppError::Internal(format!("Failed to archive previous edited lyrics: {err}"))
        })?;
    }

    let artifact = EditedLyricsArtifact {
        schema_version: 1,
        preserved: true,
        note: "User-edited lyrics layer. AI raw artifacts remain untouched.".into(),
        document: request.document.clone(),
    };

    let json = serde_json::to_string_pretty(&artifact).map_err(|err| {
        AppError::Internal(format!("Failed to serialize edited lyrics: {err}"))
    })?;
    fs::write(&path, json).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write edited lyrics {}: {err}",
            path.display()
        ))
    })?;

    Ok(artifact.document)
}

pub fn load_edited_lyrics(
    data_dir: &Path,
    import_id: &str,
) -> Result<Option<EditedLyricsDocumentDto>, AppError> {
    let path = imports_path(data_dir, import_id)?.join(EDITED_LYRICS_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|err| AppError::Internal(format!("Failed to read edited lyrics: {err}")))?;
    let artifact: EditedLyricsArtifact = serde_json::from_slice(&bytes).map_err(|err| {
        AppError::Internal(format!("Invalid edited lyrics JSON: {err}"))
    })?;
    Ok(Some(artifact.document))
}
