use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignRequest {
    pub import_id: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub model_size: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub device: Option<String>,
    #[serde(default)]
    pub compute_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignedWordDto {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignedLineDto {
    pub text: String,
    pub start: f64,
    pub end: f64,
    #[serde(default)]
    pub words: Vec<AlignedWordDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentResultDto {
    pub engine: String,
    pub model: String,
    #[serde(default)]
    pub language: Option<String>,
    pub duration: f64,
    pub lines: Vec<AlignedLineDto>,
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAlignmentArtifact {
    pub schema_version: u32,
    pub preserved: bool,
    pub note: String,
    pub result: AlignmentResultDto,
}
