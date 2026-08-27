use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSourceMeta {
    pub file_name: String,
    pub original_path: Option<String>,
    pub duration: f64,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub codec: Option<String>,
    pub format_name: Option<String>,
    pub bit_rate: Option<u64>,
    pub file_size: Option<u64>,
    pub has_audio: bool,
    pub has_video: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLayers {
    pub has_transcription: bool,
    pub has_alignment: bool,
    pub has_correction: bool,
    pub has_structure: bool,
    pub has_edited_lyrics: bool,
    pub has_resync: bool,
    pub has_translation: bool,
    pub has_separation: bool,
    pub has_stems: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub format: String,
    pub app_version: String,
    pub created_at: String,
    pub updated_at: String,
    pub import_id: String,
    pub title: String,
    pub source: ProjectSourceMeta,
    pub theme_id: Option<String>,
    pub layers: ProjectLayers,
    /// User-facing project file path when saved outside recovery.
    pub linked_path: Option<String>,
    pub autosave: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectRequest {
    pub import_id: String,
    pub path: String,
    pub theme_id: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutosaveProjectRequest {
    pub import_id: String,
    pub theme_id: Option<String>,
    pub linked_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectResult {
    pub import: crate::ffmpeg::MediaImportResult,
    pub project_path: String,
    pub manifest: ProjectManifest,
    pub recovered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySession {
    pub import_id: String,
    pub title: String,
    pub updated_at: String,
    pub linked_project_path: Option<String>,
    pub recovery_path: String,
}
