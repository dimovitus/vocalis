use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::editor::EditedLyricsDocumentDto;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResyncRequest {
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
    #[serde(default)]
    pub min_confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResyncStatsDto {
    pub lines_total: u32,
    pub lines_updated: u32,
    pub words_updated: u32,
    pub words_kept: u32,
    pub min_confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResyncResultDto {
    pub engine: String,
    pub model: String,
    #[serde(default)]
    pub language: Option<String>,
    pub duration: f64,
    pub document: EditedLyricsDocumentDto,
    pub stats: ResyncStatsDto,
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawResyncArtifact {
    pub schema_version: u32,
    pub preserved: bool,
    pub note: String,
    pub result: crate::alignment::AlignmentResultDto,
}
