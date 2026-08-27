//! Phase 3 transcription integration (ignored without ffmpeg + python model).

use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use vocalis_lib::ffmpeg;
use vocalis_lib::services::PythonWorker;
use vocalis_lib::transcription::{self, TranscribeRequest};

fn worker_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("apps")
        .join("ai-worker")
        .join("worker.py")
}

fn write_tone_wav(path: &PathBuf, seconds: f64) {
    let sample_rate = 44100u32;
    let channels = 2u16;
    let n_frames = (sample_rate as f64 * seconds) as usize;
    let mut data = Vec::with_capacity(n_frames * channels as usize * 2);
    for i in 0..n_frames {
        let t = i as f64 / sample_rate as f64;
        let sample = (0.2 * (2.0 * std::f64::consts::PI * 440.0 * t).sin() * 32767.0) as i16;
        for _ in 0..channels {
            data.extend_from_slice(&sample.to_le_bytes());
        }
    }

    let mut out = Vec::new();
    out.extend_from_slice(b"RIFF");
    let data_len = data.len() as u32;
    let file_size = 36 + data_len;
    out.extend_from_slice(&file_size.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    let byte_rate = sample_rate * u32::from(channels) * 2;
    out.extend_from_slice(&byte_rate.to_le_bytes());
    let block_align = channels * 2;
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    out.extend_from_slice(&data);
    std::fs::write(path, out).expect("write wav");
}

#[test]
#[ignore = "requires ffmpeg + faster-whisper model download"]
fn transcribe_import_persists_raw_artifact() {
    let ffmpeg_ok = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    assert!(ffmpeg_ok, "ffmpeg required");

    let tmp = tempfile_dir();
    let source = tmp.join("tone.wav");
    write_tone_wav(&source, 2.0);

    let imported = ffmpeg::import_media(&source, &tmp).expect("import");
    let worker = PythonWorker::new(worker_script(), 30_000);
    worker.ensure_running().expect("worker start");

    let request = TranscribeRequest {
        import_id: imported.id.clone(),
        language: None,
        model_size: Some("tiny".into()),
        engine: Some("faster-whisper".into()),
        word_timestamps: Some(false),
        device: Some("cpu".into()),
        compute_type: Some("int8".into()),
    };

    let result = transcription::transcribe_import(
        &worker,
        &tmp,
        &imported.id,
        &request,
        Duration::from_secs(600),
    )
    .expect("transcribe");

    assert_eq!(result.engine, "faster-whisper");
    assert_eq!(result.model, "tiny");

    let raw_path = tmp
        .join("imports")
        .join(&imported.id)
        .join("raw_transcription.json");
    assert!(raw_path.exists(), "raw transcription must be persisted");

    let loaded = transcription::load_raw_transcription(&tmp, &imported.id)
        .expect("load")
        .expect("some");
    assert_eq!(loaded.engine, result.engine);
}

fn tempfile_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("vocalis-transcribe-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}
