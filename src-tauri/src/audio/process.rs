use std::path::Path;
use std::process::Command;

use crate::error::AppError;

/// Resample audio to `sample_rate` using FFmpeg (PCM WAV out).
pub fn resample_audio(input: &Path, output: &Path, sample_rate: u32) -> Result<(), AppError> {
    run_ffmpeg_audio(
        input,
        output,
        &[
            "-ar",
            &sample_rate.to_string(),
            "-acodec",
            "pcm_s16le",
        ],
    )
}

/// Force channel count (downmix/upmix) via FFmpeg.
pub fn normalize_channels(input: &Path, output: &Path, channels: u32) -> Result<(), AppError> {
    run_ffmpeg_audio(
        input,
        output,
        &["-ac", &channels.to_string(), "-acodec", "pcm_s16le"],
    )
}

fn run_ffmpeg_audio(input: &Path, output: &Path, extra: &[&str]) -> Result<(), AppError> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::Internal(format!("Failed to create process output dir: {err}"))
        })?;
    }

    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .arg("-vn");
    for arg in extra {
        cmd.arg(arg);
    }
    cmd.arg(output);

    let result = cmd
        .output()
        .map_err(|err| AppError::Ffmpeg(format!("Failed to run ffmpeg process: {err}")))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(AppError::Ffmpeg(format!(
            "Audio process failed: {}",
            stderr.trim()
        )));
    }

    Ok(())
}
