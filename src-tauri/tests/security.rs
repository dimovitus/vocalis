//! Phase 22 — security and path sandbox integration tests.

use std::fs;
use std::path::Path;
use uuid::Uuid;
use vocalis_lib::export::write_export_file;
use vocalis_lib::video_export::{ExportKaraokeVideoRequest, export_karaoke_video};
use vocalis_lib::services::{
    validate_export_contents, validate_imports_file, validate_recovery_project_dir,
    MAX_EXPORT_BYTES,
};

#[test]
fn tampered_stem_path_outside_imports_is_rejected() {
    let tmp = std::env::temp_dir().join(format!("vocalis-sec-{}", Uuid::new_v4()));
    let data_dir = tmp.join("data");
    let imports = data_dir.join("imports");
    fs::create_dir_all(&imports).unwrap();

    let outside = tmp.join("evil.wav");
    fs::write(&outside, b"RIFF").unwrap();

    let err = validate_imports_file(&data_dir, &outside).unwrap_err();
    assert!(err.to_string().to_lowercase().contains("under"));

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn export_ipc_payload_limit_is_enforced() {
    let oversize = "a".repeat(MAX_EXPORT_BYTES + 64);
    let err = validate_export_contents(&oversize).unwrap_err();
    assert!(err.to_string().contains("too large"));
}

#[test]
fn write_export_rejects_relative_paths() {
    let err = write_export_file(Path::new("escape.lrc"), "hello").unwrap_err();
    assert!(err.to_string().contains("absolute"));
}

#[test]
fn video_export_rejects_relative_output_path() {
    let tmp = std::env::temp_dir().join(format!("vocalis-vid-sec-{}", Uuid::new_v4()));
    let data_dir = tmp.join("data");
    fs::create_dir_all(&data_dir).unwrap();

    let request = ExportKaraokeVideoRequest {
        import_id: Uuid::new_v4().to_string(),
        output_path: "relative.mp4".into(),
        ass_contents: "[Script Info]\n".into(),
        width: 1920,
        height: 1080,
        fps: 30,
        duration: 10.0,
        background_path: None,
        background_color: Some("#0b0d12".into()),
    };

    let err = export_karaoke_video(&data_dir, &request).unwrap_err();
    assert!(err.to_string().contains("absolute"));

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn recovery_project_outside_data_dir_is_rejected() {
    let tmp = std::env::temp_dir().join(format!("vocalis-rec-sec-{}", Uuid::new_v4()));
    let data_dir = tmp.join("data");
    fs::create_dir_all(&data_dir.join("recovery")).unwrap();

    let outside = tmp.join("other.vocalis");
    fs::create_dir_all(&outside).unwrap();

    assert!(validate_recovery_project_dir(&data_dir, &outside).is_err());

    let _ = fs::remove_dir_all(&tmp);
}
