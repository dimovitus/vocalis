use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeRequest {
    pub import_id: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub model_size: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub word_timestamps: Option<bool>,
    #[serde(default)]
    pub device: Option<String>,
    #[serde(default)]
    pub compute_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionWordDto {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSegmentDto {
    pub id: u32,
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
    #[serde(default)]
    pub words: Vec<TranscriptionWordDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResultDto {
    pub engine: String,
    pub model: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub language_probability: Option<f64>,
    pub duration: f64,
    pub text: String,
    pub segments: Vec<TranscriptionSegmentDto>,
    /// Exact provider payload preserved for audit / later correction layers.
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawTranscriptionArtifact {
    pub schema_version: u32,
    pub preserved: bool,
    pub note: String,
    pub result: TranscriptionResultDto,
}
