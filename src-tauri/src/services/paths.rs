//! Path validation helpers — sandbox IPC file access under the Vocalis data directory.

use crate::error::AppError;
use std::path::{Component, Path, PathBuf};

/// Maximum export payload (lyrics / JSON project state).
pub const MAX_EXPORT_BYTES: usize = 16 * 1024 * 1024;

/// Conservative OS path length guard.
pub const MAX_PATH_LEN: usize = 4096;

/// Validate import IDs (UUID v4 strings only — no path segments).
pub fn validate_import_id(import_id: &str) -> Result<String, AppError> {
    let id = import_id.trim();
    if id.is_empty() {
        return Err(AppError::Media("importId is required".into()));
    }

    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err(AppError::Media("Invalid importId".into()));
    }

    let uuid = uuid::Uuid::parse_str(id)
        .map_err(|_| AppError::Media("importId must be a UUID".into()))?;

    Ok(uuid.to_string())
}

/// Resolve `{data_dir}/imports/{import_id}` after validating the id (dir may not exist yet).
pub fn imports_path(data_dir: &Path, import_id: &str) -> Result<PathBuf, AppError> {
    let id = validate_import_id(import_id)?;
    Ok(data_dir.join("imports").join(id))
}

/// Resolve `{data_dir}/imports/{import_id}` after validating the id.
pub fn import_dir(data_dir: &Path, import_id: &str) -> Result<PathBuf, AppError> {
    let dir = imports_path(data_dir, import_id)?;
    if !dir.is_dir() {
        return Err(AppError::Media(format!("Import not found: {import_id}")));
    }
    Ok(dir)
}

fn reject_traversal_segments(path: &Path) -> Result<(), AppError> {
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(AppError::Media(
            "Path must not contain parent directory segments".into(),
        ));
    }
    Ok(())
}

fn reject_null_bytes(display: &str) -> Result<(), AppError> {
    if display.contains('\0') {
        return Err(AppError::Media("Invalid file path".into()));
    }
    Ok(())
}

fn reject_overlong_path(display: &str) -> Result<(), AppError> {
    if display.len() > MAX_PATH_LEN {
        return Err(AppError::Media("Path is too long".into()));
    }
    Ok(())
}

/// Ensure `path` resolves to a location under `root` (both canonicalized).
pub fn validate_path_under_root(root: &Path, path: &Path) -> Result<PathBuf, AppError> {
    reject_traversal_segments(path)?;

    let display = path.to_string_lossy();
    reject_null_bytes(&display)?;
    reject_overlong_path(&display)?;

    std::fs::create_dir_all(root).map_err(|err| {
        AppError::Internal(format!("Failed to create sandbox root {}: {err}", root.display()))
    })?;

    let canonical_root = root
        .canonicalize()
        .map_err(|err| AppError::Internal(format!("Sandbox root unavailable: {err}")))?;

    let canonical = path
        .canonicalize()
        .map_err(|err| AppError::Media(format!("Invalid file path: {err}")))?;

    if !canonical.starts_with(&canonical_root) {
        return Err(AppError::Media(format!(
            "Path must stay under {}",
            canonical_root.display()
        )));
    }

    Ok(canonical)
}

/// Basic checks for user-selected media files (import / probe).
pub fn validate_user_media_path(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::Media("Empty file path".into()));
    }

    let display = path.to_string_lossy();
    reject_null_bytes(&display)?;
    reject_overlong_path(&display)?;
    reject_traversal_segments(path)?;

    if !path.exists() {
        return Err(AppError::Media(format!(
            "File not found: {}",
            path.display()
        )));
    }

    if !path.is_file() {
        return Err(AppError::Media(format!(
            "Path is not a regular file: {}",
            path.display()
        )));
    }

    Ok(())
}

/// Ensure `path` resolves to a regular file under `{data_dir}/imports`.
pub fn validate_imports_file(data_dir: &Path, path: &Path) -> Result<PathBuf, AppError> {
    validate_user_media_path(path)?;
    validate_path_under_root(&data_dir.join("imports"), path)
}

/// User-selected export destination (absolute path from save dialog).
pub fn validate_export_path(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::Media("Export path is required".into()));
    }

    let display = path.to_string_lossy();
    reject_null_bytes(&display)?;
    reject_overlong_path(&display)?;
    reject_traversal_segments(path)?;

    if !path.is_absolute() {
        return Err(AppError::Media(
            "Export path must be absolute (use the save dialog)".into(),
        ));
    }

    Ok(())
}

/// Guard against oversized export payloads arriving over IPC.
pub fn validate_export_contents(contents: &str) -> Result<(), AppError> {
    let bytes = contents.as_bytes().len();
    if bytes > MAX_EXPORT_BYTES {
        return Err(AppError::Media(format!(
            "Export payload too large ({bytes} bytes; max {MAX_EXPORT_BYTES})"
        )));
    }
    Ok(())
}

/// Recovery autosaves must live under `{data_dir}/recovery`.
pub fn validate_recovery_project_dir(data_dir: &Path, project_dir: &Path) -> Result<PathBuf, AppError> {
    validate_path_under_root(&data_dir.join("recovery"), project_dir)
}

/// Reject obvious path traversal in relative segments (defense in depth).
#[allow(dead_code)]
pub fn has_traversal(path: &Path) -> bool {
    path.components().any(|c| matches!(c, Component::ParentDir))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn rejects_traversal_import_id() {
        assert!(validate_import_id("../etc").is_err());
        assert!(validate_import_id("not-a-uuid").is_err());
    }

    #[test]
    fn accepts_uuid_import_id() {
        let id = Uuid::new_v4().to_string();
        assert_eq!(validate_import_id(&id).unwrap(), id);
    }

    #[test]
    fn sandbox_rejects_outside_imports() {
        let tmp = std::env::temp_dir().join(format!("vocalis-paths-{}", Uuid::new_v4()));
        fs::create_dir_all(&tmp).unwrap();
        let data_dir = tmp.join("data");
        let imports = data_dir.join("imports");
        fs::create_dir_all(&imports).unwrap();

        let outside = tmp.join("outside.wav");
        fs::write(&outside, b"x").unwrap();

        let err = validate_imports_file(&data_dir, &outside).unwrap_err();
        assert!(err.to_string().contains("imports") || err.to_string().contains("under"));

        let inside = imports.join("inside.wav");
        fs::write(&inside, b"x").unwrap();
        assert!(validate_imports_file(&data_dir, &inside).is_ok());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn export_path_rejects_relative() {
        let err = validate_export_path(Path::new("lyrics.lrc")).unwrap_err();
        assert!(err.to_string().contains("absolute"));
    }

    #[test]
    fn export_contents_rejects_oversized_payload() {
        let huge = "x".repeat(MAX_EXPORT_BYTES + 1);
        let err = validate_export_contents(&huge).unwrap_err();
        assert!(err.to_string().contains("too large"));
    }

    #[test]
    fn recovery_dir_must_stay_under_recovery_root() {
        let tmp = std::env::temp_dir().join(format!("vocalis-recovery-{}", Uuid::new_v4()));
        let data_dir = tmp.join("data");
        let recovery = data_dir.join("recovery").join(Uuid::new_v4().to_string());
        fs::create_dir_all(&recovery).unwrap();

        assert!(validate_recovery_project_dir(&data_dir, &recovery).is_ok());

        let outside = tmp.join("outside.vocalis");
        fs::create_dir_all(&outside).unwrap();
        assert!(validate_recovery_project_dir(&data_dir, &outside).is_err());

        let _ = fs::remove_dir_all(&tmp);
    }
}
