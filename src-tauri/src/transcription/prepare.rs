use crate::audio::{normalize_channels, resample_audio};
use crate::error::AppError;
use std::path::Path;

const WHISPER_SAMPLE_RATE: u32 = 16_000;

/// Prepare a 16 kHz mono PCM WAV suitable for Whisper-family engines.
pub fn prepare_whisper_wav(canonical: &Path, output: &Path) -> Result<(), AppError> {
    if output.exists() {
        let canonical_meta = std::fs::metadata(canonical).ok();
        let output_meta = std::fs::metadata(output).ok();
        if let (Some(c), Some(o)) = (canonical_meta, output_meta) {
            if o.len() > 44 && o.modified().ok() >= c.modified().ok() {
                return Ok(());
            }
        }
    }

    let parent = output.parent().ok_or_else(|| {
        AppError::Internal("Whisper WAV output has no parent directory".into())
    })?;
    let tmp_resampled = parent.join("whisper_resampled.tmp.wav");
    let tmp_mono = parent.join("whisper_mono.tmp.wav");

    resample_audio(canonical, &tmp_resampled, WHISPER_SAMPLE_RATE)?;
    normalize_channels(&tmp_resampled, &tmp_mono, 1)?;

    std::fs::rename(&tmp_mono, output).map_err(|err| {
        AppError::Internal(format!("Failed to finalize whisper WAV: {err}"))
    })?;
    let _ = std::fs::remove_file(&tmp_resampled);

    Ok(())
}
