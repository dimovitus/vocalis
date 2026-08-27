use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LibraryTrackStatus {
    Imported,
    Processing,
    Ready,
    KaraokeReady,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackLayers {
    pub has_transcription: bool,
    pub has_alignment: bool,
    pub has_correction: bool,
    pub has_structure: bool,
    pub has_edited_lyrics: bool,
    pub has_resync: bool,
    pub has_translation: bool,
    pub has_separation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrack {
    pub import_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub file_name: String,
    pub source_path: Option<String>,
    pub favorite: bool,
    pub status: LibraryTrackStatus,
    pub status_message: Option<String>,
    pub project_path: Option<String>,
    pub added_at: String,
    pub updated_at: String,
    pub layers: LibraryTrackLayers,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIndex {
    pub schema_version: u32,
    pub updated_at: String,
    pub tracks: Vec<LibraryTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryQuery {
    pub search: Option<String>,
    pub favorites_only: Option<bool>,
    pub status: Option<LibraryTrackStatus>,
    pub sort_by: Option<String>,
    pub sort_desc: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryListResult {
    pub tracks: Vec<LibraryTrack>,
    pub artists: Vec<String>,
    pub albums: Vec<String>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLibraryTrackRequest {
    pub import_id: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncLibraryTrackRequest {
    pub import_id: String,
    pub processing: Option<bool>,
    pub status_message: Option<String>,
    pub project_path: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertLibraryTrackRequest {
    pub import_id: String,
    pub file_name: String,
    pub source_path: Option<String>,
    pub duration: f64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
}
