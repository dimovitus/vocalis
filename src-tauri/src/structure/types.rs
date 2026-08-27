use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectStructureRequest {
    pub import_id: String,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub min_confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureSectionDto {
    pub label: String,
    pub confidence: f64,
    pub start: f64,
    pub end: f64,
    #[serde(default)]
    pub line_indexes: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineStructureLabelDto {
    pub line_index: i32,
    #[serde(default)]
    pub label: Option<String>,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureResultDto {
    pub engine: String,
    pub sections: Vec<StructureSectionDto>,
    pub line_labels: Vec<LineStructureLabelDto>,
    pub overall_confidence: f64,
    pub applied: bool,
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureArtifact {
    pub schema_version: u32,
    pub preserved: bool,
    pub note: String,
    pub result: StructureResultDto,
}
