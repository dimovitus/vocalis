use crate::error::AppError;
use std::path::Path;
use std::time::{Duration, SystemTime};

pub fn ensure_temp_dir(path: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(path).map_err(|err| {
        AppError::Internal(format!("Failed to create temp directory: {err}"))
    })
}

/// Remove files older than `max_age` from a temp directory.
pub fn cleanup_temp_dir(path: &Path, max_age: Duration) -> Result<usize, AppError> {
    if !path.exists() {
        return Ok(0);
    }

    let now = SystemTime::now();
    let mut removed = 0usize;

    for entry in std::fs::read_dir(path).map_err(|err| {
        AppError::Internal(format!("Failed to read temp directory: {err}"))
    })? {
        let entry = entry.map_err(|err| {
            AppError::Internal(format!("Failed to read temp entry: {err}"))
        })?;
        let meta = entry.metadata().map_err(|err| {
            AppError::Internal(format!("Failed to read temp metadata: {err}"))
        })?;

        if !meta.is_file() {
            continue;
        }

        let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let age = now.duration_since(modified).unwrap_or_default();
        if age >= max_age {
            if std::fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }

    Ok(removed)
}

/// Remove known temporary intermediates inside an import directory.
pub fn cleanup_import_temps(import_dir: &Path) -> Result<usize, AppError> {
    let candidates = ["*.ch.wav", "tmp-*.wav"];
    let mut removed = 0usize;

    if !import_dir.exists() {
        return Ok(0);
    }

    for entry in std::fs::read_dir(import_dir).map_err(|err| {
        AppError::Internal(format!("Failed to read import dir: {err}"))
    })? {
        let entry = entry.map_err(|err| {
            AppError::Internal(format!("Failed to read import entry: {err}"))
        })?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let matches = name.ends_with(".ch.wav")
            || name.starts_with("tmp-")
            || candidates.iter().any(|p| {
                // Simple patterns only.
                *p == "*.ch.wav" && name.ends_with(".ch.wav")
                    || (*p == "tmp-*.wav" && name.starts_with("tmp-") && name.ends_with(".wav"))
            });

        if matches && entry.path().is_file() {
            if std::fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }

    Ok(removed)
}
