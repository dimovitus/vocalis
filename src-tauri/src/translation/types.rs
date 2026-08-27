use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateLyricsRequest {
    pub import_id: String,
    pub target_language: String,
    #[serde(default)]
    pub source_language: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub include_transliteration: Option<bool>,
    #[serde(default)]
    pub apply_to_edited: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslatedLineDto {
    pub line_index: u32,
    pub original: String,
    pub translation: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transliteration: Option<String>,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResultDto {
    pub engine: String,
    pub source_language: String,
    pub target_language: String,
    pub mode: String,
    pub lines: Vec<TranslatedLineDto>,
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawTranslationArtifact {
    pub schema_version: u32,
    pub preserved: bool,
    pub note: String,
    pub result: TranslationResultDto,
}
