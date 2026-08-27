use serde::{Deserialize, Serialize};

pub const PERFORMANCE_LOG_FILE: &str = "performance_log.json";
pub const IMPORT_TIMINGS_FILE: &str = "pipeline_timings.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PipelineTimingRecord {
    pub stage: String,
    pub duration_ms: u64,
    pub started_at: String,
    pub finished_at: String,
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPerformanceProfile {
    pub import_id: String,
    pub records: Vec<PipelineTimingRecord>,
    pub total_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceSummary {
    pub total_records: usize,
    pub recent: Vec<PipelineTimingRecord>,
    pub averages_by_stage: Vec<StageAverage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageAverage {
    pub stage: String,
    pub runs: u32,
    pub average_ms: u64,
    pub last_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PerformanceLog {
    pub(crate) schema_version: u32,
    pub(crate) records: Vec<LoggedTimingRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoggedTimingRecord {
    pub(crate) import_id: String,
    pub(crate) stage: String,
    pub(crate) duration_ms: u64,
    pub(crate) started_at: String,
    pub(crate) finished_at: String,
    pub(crate) success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) detail: Option<String>,
}

impl From<LoggedTimingRecord> for PipelineTimingRecord {
    fn from(value: LoggedTimingRecord) -> Self {
        Self {
            stage: value.stage,
            duration_ms: value.duration_ms,
            started_at: value.started_at,
            finished_at: value.finished_at,
            success: value.success,
            detail: value.detail,
        }
    }
}

impl PerformanceLog {
    pub(crate) fn new() -> Self {
        Self {
            schema_version: 1,
            records: Vec::new(),
        }
    }
}
