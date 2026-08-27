use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
use vocalis_lib::error::AppError;
use vocalis_lib::library::{
    list_tracks, sync_track, upsert_track, LibraryQuery, SyncLibraryTrackRequest,
    UpsertLibraryTrackRequest,
};
use vocalis_lib::project::{
    open_project, save_project, OpenProjectRequest, SaveProjectRequest, CANONICAL_COPY,
    PROJECT_MANIFEST,
};

fn temp_root() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("vocalis-pl-test-{stamp}"))
}

fn generate_sine_wav(path: &PathBuf, seconds: f32) -> bool {
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            &format!("sine=frequency=440:duration={seconds}"),
            "-ac",
            "1",
            "-ar",
            "48000",
        ])
        .arg(path)
        .status();

    matches!(status, Ok(s) if s.success())
}

fn seed_import(data_dir: &PathBuf, import_id: &str, canonical_bytes: &[u8]) -> PathBuf {
    let import_path = data_dir.join("imports").join(import_id);
    fs::create_dir_all(&import_path).unwrap();
    fs::write(import_path.join(CANONICAL_COPY), canonical_bytes).unwrap();
    fs::write(
        import_path.join("source.json"),
        br#"{"path":"/tmp/demo.mp3","fileName":"Artist - Song.mp3","duration":180.0,"hasAudio":true,"hasVideo":false}"#,
    )
    .unwrap();
    import_path
}

#[test]
fn library_index_and_project_save() {
    let root = temp_root();
    let data_dir = root.join("data");
    let import_id = Uuid::new_v4().to_string();
    seed_import(&data_dir, &import_id, b"RIFF");

    upsert_track(
        &data_dir,
        &UpsertLibraryTrackRequest {
            import_id: import_id.clone(),
            file_name: "Artist - Song.mp3".into(),
            source_path: Some("/tmp/song.mp3".into()),
            duration: 180.0,
            title: None,
            artist: None,
            album: None,
        },
    )
    .expect("upsert library track");

    let listed = list_tracks(
        &data_dir,
        &LibraryQuery {
            search: Some("song".into()),
            ..Default::default()
        },
    )
    .expect("list tracks");
    assert_eq!(listed.total, 1);
    assert_eq!(listed.tracks[0].import_id, import_id);

    let project_path = root.join("Song.vocalis");
    let manifest = save_project(
        &data_dir,
        "0.1.0",
        &SaveProjectRequest {
            import_id: import_id.clone(),
            path: project_path.to_string_lossy().into_owned(),
            theme_id: Some("neon".into()),
            title: Some("Song".into()),
        },
    )
    .expect("save project");

    assert_eq!(manifest.title, "Song");
    assert!(project_path.join(PROJECT_MANIFEST).is_file());

    sync_track(
        &data_dir,
        &SyncLibraryTrackRequest {
            import_id: import_id.clone(),
            processing: Some(false),
            status_message: None,
            project_path: Some(project_path.to_string_lossy().into_owned()),
            title: None,
        },
    )
    .expect("sync library track");

    let synced = list_tracks(&data_dir, &LibraryQuery::default()).expect("list after sync");
    assert_eq!(synced.tracks[0].project_path.as_deref(), Some(project_path.to_str().unwrap()));

    let _ = fs::remove_dir_all(root);
}

#[test]
#[ignore = "requires ffmpeg/ffprobe"]
fn project_open_restores_import_session() {
    let root = temp_root();
    let data_dir = root.join("data");
    let import_id = Uuid::new_v4().to_string();
    let import_path = data_dir.join("imports").join(&import_id);
    fs::create_dir_all(&import_path).unwrap();

    let canonical = import_path.join(CANONICAL_COPY);
    assert!(
        generate_sine_wav(&canonical, 0.5),
        "ffmpeg must be available to generate test audio"
    );
    fs::write(
        import_path.join("source.json"),
        br#"{"path":"/tmp/demo.mp3","fileName":"Artist - Song.mp3","duration":0.5,"hasAudio":true,"hasVideo":false}"#,
    )
    .unwrap();

    let project_path = root.join("Song.vocalis");
    save_project(
        &data_dir,
        "0.1.0",
        &SaveProjectRequest {
            import_id: import_id.clone(),
            path: project_path.to_string_lossy().into_owned(),
            theme_id: Some("neon".into()),
            title: Some("Song".into()),
        },
    )
    .expect("save project");

    let (import_result, opened_manifest, _, recovered) = open_project(
        &data_dir,
        &OpenProjectRequest {
            path: project_path.to_string_lossy().into_owned(),
        },
    )
    .expect("open project");

    assert_eq!(opened_manifest.import_id, import_id);
    assert_eq!(import_result.id, import_id);
    assert!(!recovered);
    assert!(import_result.canonical.path.exists());

    let _ = fs::remove_dir_all(root);
}

#[test]
fn structured_media_error_classifies_prerequisites() {
    let err = AppError::Media("Run transcribe first before alignment.".into());
    let response = err.to_response();
    assert_eq!(response.code, "PIPELINE_PREREQUISITE");
    assert!(response.recoverable);
    assert!(response.suggested_action.is_some());
}

#[test]
fn structured_media_error_classifies_not_found() {
    let err = AppError::Media("Import not found: missing-id".into());
    let response = err.to_response();
    assert_eq!(response.code, "MEDIA_ERROR");
    assert!(response.recoverable);
}
