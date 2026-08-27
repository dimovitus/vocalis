//! Phase 14 — lyrics export file writes (user-selected destination).

mod types;

pub use types::WriteExportFileRequest;

use crate::error::AppError;
use crate::services::{validate_export_contents, validate_export_path};
use std::fs;
use std::path::Path;

pub fn write_export_file(path: &Path, contents: &str) -> Result<(), AppError> {
    validate_export_path(path)?;
    validate_export_contents(contents)?;

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| {
                AppError::Internal(format!(
                    "Failed to create export directory {}: {err}",
                    parent.display()
                ))
            })?;
        }
    }

    fs::write(path, contents).map_err(|err| {
        AppError::Internal(format!(
            "Failed to write export file {}: {err}",
            path.display()
        ))
    })?;

    tracing::info!("Exported lyrics to {}", path.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::MAX_EXPORT_BYTES;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn write_export_file_requires_absolute_path() {
        let err = write_export_file(Path::new("relative.txt"), "hello").unwrap_err();
        assert!(err.to_string().contains("absolute"));
    }

    #[test]
    fn write_export_file_rejects_oversized_contents() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("vocalis-export-big-{stamp}.lrc"));
        let huge = "x".repeat(MAX_EXPORT_BYTES + 1);
        let err = write_export_file(&path, &huge).unwrap_err();
        assert!(err.to_string().contains("too large"));
    }

    #[test]
    fn write_export_file_writes_content() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("vocalis-export-test-{stamp}.lrc"));
        write_export_file(&path, "[00:01.00]test").expect("write");
        let read = std::fs::read_to_string(&path).expect("read");
        assert_eq!(read, "[00:01.00]test");
        let _ = std::fs::remove_file(path);
    }
}
