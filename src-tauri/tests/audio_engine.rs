use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use vocalis_lib::audio::{generate_waveform, peak_normalize_to_file, prepare_from_canonical};
use vocalis_lib::ffmpeg::{convert_to_canonical, import_media};

fn temp_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("vocalis-audio-test-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn generate_sine_wav(path: &PathBuf, seconds: f32, sample_rate: u32, channels: u32) -> bool {
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
            &channels.to_string(),
            "-ar",
            &sample_rate.to_string(),
            "-acodec",
            "pcm_s16le",
        ])
        .arg(path)
        .status();
    matches!(status, Ok(s) if s.success())
}

#[test]
#[ignore = "requires ffmpeg"]
fn waveform_peaks_from_real_audio() {
    let dir = temp_dir();
    let wav = dir.join("tone.wav");
    assert!(generate_sine_wav(&wav, 0.5, 44_100, 2));

    let waveform = generate_waveform(&wav, 64).expect("waveform");
    assert_eq!(waveform.peak_count, 64);
    assert_eq!(waveform.peaks.len(), 64);
    assert!(waveform.duration > 0.4);
    let energy: f32 = waveform.peaks.iter().sum();
    assert!(energy > 0.0, "peaks should reflect real signal energy");

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[ignore = "requires ffmpeg"]
fn peak_normalize_and_prepare_pipeline() {
    let dir = temp_dir();
    let quiet = dir.join("quiet.wav");
    assert!(generate_sine_wav(&quiet, 0.4, 44_100, 2));

    let normalized = dir.join("normalized.wav");
    let result = peak_normalize_to_file(&quiet, &normalized).expect("normalize");
    assert!(normalized.exists());
    assert!(result.source_peak > 0.0);

    let import_dir = dir.join("import");
    std::fs::create_dir_all(&import_dir).unwrap();
    let canonical = import_dir.join("canonical.wav");
    convert_to_canonical(&quiet, &canonical).unwrap();

    let prepared = prepare_from_canonical(&import_dir, &canonical, 0.4).expect("prepare");
    assert!(prepared
        .playable
        .path
        .extension()
        .is_some_and(|ext| ext == "mp3"));
    assert!(prepared.native_playback.path.exists());
    assert!(prepared
        .native_playback
        .path
        .extension()
        .is_some_and(|ext| ext == "wav"));
    assert_eq!(prepared.waveform.peaks.len(), prepared.waveform.peak_count);
    assert!(prepared.waveform_cache_path.exists());

    // Preview must be much smaller than canonical WAV.
    let wav_size = std::fs::metadata(&canonical).unwrap().len();
    let preview_size = prepared.playable.file_size.unwrap_or(0);
    assert!(
        preview_size > 0 && preview_size < wav_size,
        "preview={preview_size} wav={wav_size}"
    );

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[ignore = "requires ffmpeg"]
fn import_includes_waveform_and_playable() {
    let dir = temp_dir();
    let source = dir.join("source.wav");
    assert!(generate_sine_wav(&source, 0.6, 48_000, 1));

    let data_dir = dir.join("data");
    let imported = import_media(&source, &data_dir).expect("import");
    assert!(!imported.waveform.peaks.is_empty());
    assert!(imported.playable.path.exists());
    assert!(imported.playable.path.extension().is_some_and(|e| e == "mp3"));
    assert!(imported.playable.duration > 0.5);
    assert_eq!(imported.waveform.sample_rate, 44_100);

    let _ = std::fs::remove_dir_all(dir);
}
