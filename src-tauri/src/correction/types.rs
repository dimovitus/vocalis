use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectLyricsRequest {
    pub import_id: String,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub model_size: Option<String>,
    #[serde(default)]
    pub device: Option<String>,
    #[serde(default)]
    pub compute_type: Option<String>,
    #[serde(default)]
    pub low_confidence_threshold: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectedWordDto {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectedLineDto {
    pub text: String,
    pub start: f64,
    pub end: f64,
    #[serde(default)]
    pub words: Vec<CorrectedWordDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricChangeDto {
    pub original: String,
    pub corrected: String,
    pub reason: String,
    pub confidence: f64,
    pub line_index: i32,
    #[serde(default)]
    pub word_index: Option<i32>,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionResultDto {
    pub engine: String,
    #[serde(default)]
    pub language: Option<String>,
    pub lines: Vec<CorrectedLineDto>,
    pub changes: Vec<LyricChangeDto>,
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawCorrectionArtifact {
    pub schema_version: u32,
    pub preserved: bool,
    pub note: String,
    pub result: CorrectionResultDto,
}
