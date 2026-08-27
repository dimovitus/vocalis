use crate::error::AppError;
use crate::ffmpeg::types::{CANONICAL_CHANNELS, CANONICAL_SAMPLE_RATE};
use std::path::Path;
use std::process::Command;

/// Convert any supported media file to the Vocalis canonical WAV format.
///
/// Uses `-vn` so video containers contribute only their audio stream.
pub fn convert_to_canonical(input: &Path, output: &Path) -> Result<(), AppError> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::Internal(format!("Failed to create output directory: {err}"))
        })?;
    }

    let output_result = Command::new("ffmpeg")
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
        ])
        .arg(input)
        .args([
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            &CANONICAL_SAMPLE_RATE.to_string(),
            "-ac",
            &CANONICAL_CHANNELS.to_string(),
        ])
        .arg(output)
        .output()
        .map_err(|err| AppError::Ffmpeg(format!("Failed to run ffmpeg: {err}")))?;

    if !output_result.status.success() {
        let stderr = String::from_utf8_lossy(&output_result.stderr);
        return Err(AppError::Ffmpeg(format!(
            "ffmpeg conversion failed: {}",
            stderr.trim()
        )));
    }

    if !output.exists() {
        return Err(AppError::Ffmpeg(
            "ffmpeg reported success but output file is missing".into(),
        ));
    }

    let size = std::fs::metadata(output)
        .map(|m| m.len())
        .unwrap_or(0);
    if size == 0 {
        return Err(AppError::Ffmpeg(
            "ffmpeg produced an empty output file".into(),
        ));
    }

    Ok(())
}
