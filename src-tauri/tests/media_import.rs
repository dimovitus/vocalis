use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use vocalis_lib::ffmpeg::{
    convert_to_canonical, import_media, probe_media, CANONICAL_CHANNELS, CANONICAL_SAMPLE_RATE,
};

fn temp_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("vocalis-media-test-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
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

#[test]
#[ignore = "requires ffmpeg/ffprobe"]
fn probe_and_import_real_wav() {
    let dir = temp_dir();
    let source = dir.join("source.wav");
    assert!(
        generate_sine_wav(&source, 1.0),
        "ffmpeg must be available to generate test audio"
    );

    let meta = probe_media(&source).expect("probe should succeed");
    assert!(meta.has_audio);
    assert!(!meta.has_video);
    assert!(meta.duration > 0.9 && meta.duration < 1.2);
    assert_eq!(meta.sample_rate, Some(48_000));
    assert_eq!(meta.channels, Some(1));

    let data_dir = dir.join("data");
    let imported = import_media(&source, &data_dir).expect("import should succeed");

    assert!(imported.canonical.path.exists());
    assert_eq!(imported.canonical.sample_rate, CANONICAL_SAMPLE_RATE);
    assert_eq!(imported.canonical.channels, CANONICAL_CHANNELS);
    assert!(imported.canonical.duration > 0.9);
    assert!(!imported.waveform.peaks.is_empty());
    assert!(imported.playable.path.exists());

    let canonical_meta = probe_media(&imported.canonical.path).unwrap();
    assert_eq!(canonical_meta.sample_rate, Some(CANONICAL_SAMPLE_RATE));
    assert_eq!(canonical_meta.channels, Some(CANONICAL_CHANNELS));
    assert_eq!(canonical_meta.codec.as_deref(), Some("pcm_s16le"));

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[ignore = "requires ffmpeg/ffprobe"]
fn convert_rejects_non_media_file() {
    let dir = temp_dir();
    let junk = dir.join("notes.txt");
    std::fs::write(&junk, b"not audio").unwrap();

    let out = dir.join("out.wav");
    let err = convert_to_canonical(&junk, &out).unwrap_err();
    let msg = err.to_string().to_lowercase();
    assert!(
        msg.contains("ffmpeg") || msg.contains("fail"),
        "unexpected error: {msg}"
    );

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[ignore = "requires ffmpeg/ffprobe"]
fn probe_invalid_file_returns_media_error() {
    let dir = temp_dir();
    let junk = dir.join("broken.bin");
    std::fs::write(&junk, b"\x00\x01\x02not-a-media-file").unwrap();

    let err = probe_media(&junk).unwrap_err();
    let response = err.to_response();
    assert_eq!(response.code, "MEDIA_ERROR");
    assert!(response.recoverable);

    let _ = std::fs::remove_dir_all(dir);
}
