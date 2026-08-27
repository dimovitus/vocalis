//! Audio processing engine (Phase 2).
//!
//! Responsibilities:
//! - decode canonical WAV (streaming PCM)
//! - waveform peak generation from real samples
//! - peak / loudness normalization
//! - compact preview encode for WebView playback
//! - resampling & channel helpers (via FFmpeg)
//! - waveform cache + temp cleanup

mod cache;
mod cleanup;
mod normalize;
mod player;
mod process;
mod types;
mod waveform;
mod wav;

pub use cache::{load_waveform_cache, save_waveform_cache};
pub use cleanup::{cleanup_import_temps, cleanup_temp_dir, ensure_temp_dir};
pub use normalize::{
    encode_playback_wav, encode_preview_mp3, peak_normalize_to_file, playback_sample_rate,
    PeakNormalizeResult,
};
pub use player::{NativePlayer, PlayerStatus};
pub use process::{normalize_channels, resample_audio};
pub use types::{AudioPrepareResult, WaveformData, DEFAULT_WAVEFORM_PEAKS};
pub use wav::{WavFormat, WavInfo};
pub use waveform::{analyze_waveform_and_peak, generate_waveform};

use crate::error::AppError;
use crate::ffmpeg::AudioAssetInfo;
use normalize::gain_db_for_peak;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Prepare playback + waveform assets for an imported canonical WAV.
///
/// Heavy work is intentionally:
/// 1) one PCM pass for peaks + source peak
/// 2) one FFmpeg encode to a small OGG preview (not a 70MB WAV in the WebView)
pub fn prepare_from_canonical(
    import_dir: &Path,
    canonical_path: &Path,
    duration_hint: f64,
) -> Result<AudioPrepareResult, AppError> {
    if !canonical_path.exists() {
        return Err(AppError::Media(format!(
            "Canonical audio missing: {}",
            canonical_path.display()
        )));
    }

    let (mut waveform, source_peak) =
        analyze_waveform_and_peak(canonical_path, DEFAULT_WAVEFORM_PEAKS)?;
    if waveform.duration <= 0.0 && duration_hint > 0.0 {
        waveform.duration = duration_hint;
    }

    let peak = gain_db_for_peak(source_peak, 0.95);
    let preview_path = import_dir.join("preview.mp3");
    encode_preview_mp3(canonical_path, &preview_path, peak.gain_db)?;

    let playback_path = import_dir.join("playback.wav");
    encode_playback_wav(canonical_path, &playback_path)?;

    let cache_path = import_dir.join("waveform.json");
    save_waveform_cache(&cache_path, &waveform)?;

    let playable_size = std::fs::metadata(&preview_path).ok().map(|m| m.len());
    let playback_size = std::fs::metadata(&playback_path).ok().map(|m| m.len());

    Ok(AudioPrepareResult {
        playable: AudioAssetInfo {
            id: Uuid::new_v4().to_string(),
            path: preview_path,
            duration: waveform.duration,
            sample_rate: waveform.sample_rate,
            channels: waveform.channels,
            codec: Some("mp3".into()),
            format: Some("mp3".into()),
            bit_rate: Some(160_000),
            file_size: playable_size,
        },
        native_playback: AudioAssetInfo {
            id: Uuid::new_v4().to_string(),
            path: playback_path,
            duration: waveform.duration,
            sample_rate: playback_sample_rate(),
            channels: 2,
            codec: Some("pcm_s16le".into()),
            format: Some("wav".into()),
            bit_rate: None,
            file_size: playback_size,
        },
        waveform,
        peak_normalize: peak,
        waveform_cache_path: cache_path,
    })
}

pub fn temp_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("tmp")
}

pub fn ensure_processing_dirs(data_dir: &Path) -> Result<(), AppError> {
    ensure_temp_dir(&temp_dir(data_dir))?;
    std::fs::create_dir_all(data_dir.join("cache")).map_err(|err| {
        AppError::Internal(format!("Failed to create cache directory: {err}"))
    })?;
    Ok(())
}

/// Resample + channel-normalize into a temp WAV (utility for future pipeline stages).
#[allow(dead_code)]
pub fn decode_to_pcm_wav(
    input: &Path,
    output: &Path,
    sample_rate: u32,
    channels: u32,
) -> Result<(), AppError> {
    use crate::ffmpeg::CANONICAL_CHANNELS;

    resample_audio(input, output, sample_rate)?;
    if channels != CANONICAL_CHANNELS {
        let remapped = output.with_extension("ch.wav");
        normalize_channels(output, &remapped, channels)?;
        std::fs::rename(&remapped, output).map_err(|err| {
            AppError::Internal(format!("Failed to replace channel-normalized file: {err}"))
        })?;
    }
    Ok(())
}
