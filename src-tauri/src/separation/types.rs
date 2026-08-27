use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeparateRequest {
    pub import_id: String,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub providers: Option<String>,
    #[serde(default)]
    pub precision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StemAssetDto {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub playback_path: Option<String>,
    pub role: String,
    pub sample_rate: u32,
    pub channels: u32,
    pub duration: f64,
    #[serde(default)]
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeparationResultDto {
    pub engine: String,
    pub model: String,
    pub stems: Vec<StemAssetDto>,
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawSeparationArtifact {
    pub schema_version: u32,
    pub preserved: bool,
    pub note: String,
    pub result: SeparationResultDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixPreviewRequest {
    pub import_id: String,
    pub vocals_gain: f32,
    pub instrumental_gain: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixPreviewResult {
    pub path: String,
    pub duration: f64,
}
