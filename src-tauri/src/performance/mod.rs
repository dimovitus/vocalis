//! Phase 19 — pipeline timing, profiling, and performance telemetry.

mod types;

pub use types::{
    ImportPerformanceProfile, PerformanceSummary, PipelineTimingRecord, StageAverage,
    IMPORT_TIMINGS_FILE, PERFORMANCE_LOG_FILE,
};

use crate::error::AppError;
use crate::services::{import_dir, validate_import_id};
use chrono::Utc;
use std::path::Path;
use std::time::Instant;
use types::{LoggedTimingRecord, PerformanceLog};

const MAX_GLOBAL_RECORDS: usize = 500;

pub fn record_pipeline_timing(
    data_dir: &Path,
    import_id: &str,
    stage: &str,
    duration_ms: u64,
    success: bool,
    detail: Option<String>,
) -> Result<PipelineTimingRecord, AppError> {
    let import_id = validate_import_id(import_id)?;
    let started_at = Utc::now();
    let finished_at = started_at;
    let started_at = (finished_at - chrono::Duration::milliseconds(duration_ms as i64)).to_rfc3339();
    let finished_at = finished_at.to_rfc3339();

    let record = PipelineTimingRecord {
        stage: stage.into(),
        duration_ms,
        started_at,
        finished_at,
        success,
        detail,
    };

    append_import_timing(data_dir, &import_id, &record)?;
    append_global_record(data_dir, &import_id, &record)?;
    Ok(record)
}

pub fn timed_pipeline<F, T>(
    data_dir: &Path,
    import_id: &str,
    stage: &str,
    detail: Option<&str>,
    operation: F,
) -> Result<T, AppError>
where
    F: FnOnce() -> Result<T, AppError>,
{
    let started = Instant::now();
    let result = operation();
    let duration_ms = started.elapsed().as_millis() as u64;
    let success = result.is_ok();
    if let Err(err) = record_pipeline_timing(
        data_dir,
        import_id,
        stage,
        duration_ms,
        success,
        detail.map(str::to_string),
    ) {
        tracing::warn!("Failed to record pipeline timing for {stage}: {err}");
    }
    result
}

pub fn load_import_performance(
    data_dir: &Path,
    import_id: &str,
) -> Result<ImportPerformanceProfile, AppError> {
    let import_id = validate_import_id(import_id)?;
    let path = import_dir(data_dir, &import_id)?.join(IMPORT_TIMINGS_FILE);
    if !path.exists() {
        return Ok(ImportPerformanceProfile {
            import_id,
            records: Vec::new(),
            total_ms: 0,
        });
    }

    let content = std::fs::read_to_string(&path).map_err(|err| {
        AppError::Internal(format!("Failed to read import timings: {err}"))
    })?;
    let records: Vec<PipelineTimingRecord> = serde_json::from_str(&content).map_err(|err| {
        AppError::Internal(format!("Failed to parse import timings: {err}"))
    })?;
    let total_ms = records.iter().map(|record| record.duration_ms).sum();
    Ok(ImportPerformanceProfile {
        import_id,
        records,
        total_ms,
    })
}

pub fn load_performance_summary(data_dir: &Path) -> Result<PerformanceSummary, AppError> {
    let log = load_global_log(data_dir)?;
    let recent: Vec<PipelineTimingRecord> = log
        .records
        .iter()
        .rev()
        .take(20)
        .map(|record| PipelineTimingRecord::from(record.clone()))
        .collect();

    let mut stage_map: std::collections::BTreeMap<String, (u64, u32, u64)> =
        std::collections::BTreeMap::new();
    for record in &log.records {
        let entry = stage_map.entry(record.stage.clone()).or_insert((0, 0, 0));
        entry.0 += record.duration_ms;
        entry.1 += 1;
        entry.2 = record.duration_ms;
    }

    let averages_by_stage = stage_map
        .into_iter()
        .map(|(stage, (total, runs, last_ms))| StageAverage {
            stage,
            runs,
            average_ms: if runs > 0 { total / u64::from(runs) } else { 0 },
            last_ms,
        })
        .collect();

    Ok(PerformanceSummary {
        total_records: log.records.len(),
        recent,
        averages_by_stage,
    })
}

fn append_import_timing(
    data_dir: &Path,
    import_id: &str,
    record: &PipelineTimingRecord,
) -> Result<(), AppError> {
    let import_path = import_dir(data_dir, import_id)?;
    let path = import_path.join(IMPORT_TIMINGS_FILE);

    let mut records = if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|err| {
            AppError::Internal(format!("Failed to read import timings: {err}"))
        })?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::<PipelineTimingRecord>::new()
    };

    records.push(record.clone());
    let json = serde_json::to_string_pretty(&records).map_err(|err| {
        AppError::Internal(format!("Failed to serialize import timings: {err}"))
    })?;
    std::fs::write(path, json).map_err(|err| {
        AppError::Internal(format!("Failed to write import timings: {err}"))
    })?;
    Ok(())
}

fn append_global_record(
    data_dir: &Path,
    import_id: &str,
    record: &PipelineTimingRecord,
) -> Result<(), AppError> {
    let mut log = load_global_log(data_dir)?;
    log.records.push(LoggedTimingRecord {
        import_id: import_id.into(),
        stage: record.stage.clone(),
        duration_ms: record.duration_ms,
        started_at: record.started_at.clone(),
        finished_at: record.finished_at.clone(),
        success: record.success,
        detail: record.detail.clone(),
    });

    if log.records.len() > MAX_GLOBAL_RECORDS {
        let drain = log.records.len() - MAX_GLOBAL_RECORDS;
        log.records.drain(0..drain);
    }

    save_global_log(data_dir, &log)
}

fn load_global_log(data_dir: &Path) -> Result<PerformanceLog, AppError> {
    let path = data_dir.join(PERFORMANCE_LOG_FILE);
    if !path.exists() {
        return Ok(PerformanceLog::new());
    }

    let content = std::fs::read_to_string(&path).map_err(|err| {
        AppError::Internal(format!("Failed to read performance log: {err}"))
    })?;
    serde_json::from_str(&content).map_err(|err| {
        AppError::Internal(format!("Failed to parse performance log: {err}"))
    })
}

fn save_global_log(data_dir: &Path, log: &PerformanceLog) -> Result<(), AppError> {
    std::fs::create_dir_all(data_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create data directory: {err}"))
    })?;
    let path = data_dir.join(PERFORMANCE_LOG_FILE);
    let json = serde_json::to_string_pretty(log).map_err(|err| {
        AppError::Internal(format!("Failed to serialize performance log: {err}"))
    })?;
    std::fs::write(path, json).map_err(|err| {
        AppError::Internal(format!("Failed to write performance log: {err}"))
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_and_summarizes_pipeline_timings() {
        let dir = std::env::temp_dir().join(format!("vocalis-perf-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let import_id = uuid::Uuid::new_v4().to_string();
        std::fs::create_dir_all(dir.join("imports").join(&import_id)).unwrap();

        record_pipeline_timing(&dir, &import_id, "transcribe", 1200, true, None).unwrap();
        record_pipeline_timing(&dir, &import_id, "align", 800, true, None).unwrap();

        let profile = load_import_performance(&dir, &import_id).unwrap();
        assert_eq!(profile.records.len(), 2);
        assert_eq!(profile.total_ms, 2000);

        let summary = load_performance_summary(&dir).unwrap();
        assert_eq!(summary.total_records, 2);
        assert_eq!(summary.averages_by_stage.len(), 2);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn timed_pipeline_records_on_failure() {
        let dir = std::env::temp_dir().join(format!("vocalis-perf-fail-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let import_id = uuid::Uuid::new_v4().to_string();
        std::fs::create_dir_all(dir.join("imports").join(&import_id)).unwrap();

        let err: Result<(), AppError> = timed_pipeline(&dir, &import_id, "transcribe", None, || {
            Err(AppError::Media("boom".into()))
        });
        assert!(err.unwrap_err().to_string().contains("boom"));

        let profile = load_import_performance(&dir, &import_id).unwrap();
        assert_eq!(profile.records.len(), 1);
        assert!(!profile.records[0].success);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
