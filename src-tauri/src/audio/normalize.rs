use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeakNormalizeResult {
    pub applied: bool,
    pub source_peak: f32,
    pub gain_db: f32,
    pub target_peak: f32,
}

/// Encode a small compressed MP3 preview for WebView playback.
///
/// MP3 over localhost HTTP is far more reliable than WAV/OGG via asset:// on WebKitGTK.
pub fn encode_preview_mp3(
    input: &Path,
    output: &Path,
    gain_db: f32,
) -> Result<(), AppError> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::Internal(format!("Failed to create preview output dir: {err}"))
        })?;
    }

    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .args([
            "-vn",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "160k",
            "-ar",
            "44100",
            "-ac",
            "2",
        ]);

    if gain_db.abs() >= 0.25 {
        let filter = format!("volume={gain_db:.4}dB");
        cmd.args(["-af", &filter]);
    }

    cmd.arg(output);

    let result = cmd
        .output()
        .map_err(|err| AppError::Ffmpeg(format!("Failed to encode preview: {err}")))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(AppError::Ffmpeg(format!(
            "Preview encode failed: {}",
            stderr.trim()
        )));
    }

    if !output.exists() {
        return Err(AppError::Ffmpeg(
            "Preview encode reported success but output is missing".into(),
        ));
    }

    Ok(())
}

const PLAYBACK_SAMPLE_RATE: u32 = 22_050;

/// Compact PCM WAV for native rodio preview (byte-seekable, much smaller than canonical).
pub fn encode_playback_wav(input: &Path, output: &Path) -> Result<(), AppError> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::Internal(format!("Failed to create playback output dir: {err}"))
        })?;
    }

    let result = Command::new("ffmpeg")
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .args([
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            &PLAYBACK_SAMPLE_RATE.to_string(),
            "-ac",
            "2",
        ])
        .arg(output)
        .output()
        .map_err(|err| AppError::Ffmpeg(format!("Failed to encode playback WAV: {err}")))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(AppError::Ffmpeg(format!(
            "Playback WAV encode failed: {}",
            stderr.trim()
        )));
    }

    if !output.exists() {
        return Err(AppError::Ffmpeg(
            "Playback WAV encode reported success but output is missing".into(),
        ));
    }

    Ok(())
}

pub fn playback_sample_rate() -> u32 {
    PLAYBACK_SAMPLE_RATE
}

pub fn gain_db_for_peak(source_peak: f32, target_peak: f32) -> PeakNormalizeResult {
    if source_peak <= 0.000_1 {
        return PeakNormalizeResult {
            applied: false,
            source_peak,
            gain_db: 0.0,
            target_peak,
        };
    }

    let gain = target_peak / source_peak;
    let gain_db = 20.0 * gain.log10();
    if gain_db.abs() < 0.25 {
        PeakNormalizeResult {
            applied: false,
            source_peak,
            gain_db: 0.0,
            target_peak,
        }
    } else {
        PeakNormalizeResult {
            applied: true,
            source_peak,
            gain_db,
            target_peak,
        }
    }
}

/// Keep for tests / tooling: write a peak-normalized WAV via FFmpeg.
pub fn peak_normalize_to_file(
    input: &Path,
    output: &Path,
) -> Result<PeakNormalizeResult, AppError> {
    peak_normalize_to_file_with_target(input, output, 0.95)
}

pub fn peak_normalize_to_file_with_target(
    input: &Path,
    output: &Path,
    target_peak: f32,
) -> Result<PeakNormalizeResult, AppError> {
    use crate::audio::wav::for_each_frame;

    let mut source_peak = 0.0f32;
    for_each_frame(input, |sample| {
        let amp = sample.abs();
        if amp > source_peak {
            source_peak = amp;
        }
    })?;

    let result = gain_db_for_peak(source_peak, target_peak);
    if !result.applied {
        std::fs::copy(input, output).map_err(|err| {
            AppError::Internal(format!("Failed to copy audio: {err}"))
        })?;
        return Ok(result);
    }

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::Internal(format!("Failed to create normalize output dir: {err}"))
        })?;
    }

    let filter = format!("volume={:.4}dB", result.gain_db);
    let output_result = Command::new("ffmpeg")
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .args(["-af", &filter, "-acodec", "pcm_s16le"])
        .arg(output)
        .output()
        .map_err(|err| AppError::Ffmpeg(format!("Failed to run ffmpeg normalize: {err}")))?;

    if !output_result.status.success() {
        let stderr = String::from_utf8_lossy(&output_result.stderr);
        return Err(AppError::Ffmpeg(format!(
            "Peak normalize failed: {}",
            stderr.trim()
        )));
    }

    Ok(result)
}
