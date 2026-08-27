use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditedWordDto {
    pub text: String,
    pub start: f64,
    pub end: f64,
    #[serde(default = "default_confidence")]
    pub confidence: f64,
}

fn default_confidence() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditedLineDto {
    pub text: String,
    pub start: f64,
    pub end: f64,
    #[serde(default)]
    pub words: Vec<EditedWordDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub translation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transliteration: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditedLyricsDocumentDto {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub lines: Vec<EditedLineDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEditedLyricsRequest {
    pub import_id: String,
    pub document: EditedLyricsDocumentDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditedLyricsArtifact {
    pub schema_version: u32,
    pub preserved: bool,
    pub note: String,
    pub document: EditedLyricsDocumentDto,
}
