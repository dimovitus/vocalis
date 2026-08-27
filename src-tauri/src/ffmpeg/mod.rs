//! FFmpeg / ffprobe integration for media inspection and canonical conversion.
//!
//! Canonical processing format (Phase 1):
//! - Container: WAV
//! - Codec: pcm_s16le
//! - Sample rate: 44100 Hz
//! - Channels: 2 (stereo; mono duplicated, >2 downmixed)

mod convert;
mod probe;
mod types;

pub use convert::convert_to_canonical;
pub use probe::probe_media;
pub use types::{
    AudioAssetInfo, CanonicalAudioFormat, MediaImportResult, MediaMetadata, WaveformDataDto,
    CANONICAL_CHANNELS, CANONICAL_CODEC, CANONICAL_CONTAINER, CANONICAL_SAMPLE_RATE,
};

use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

pub fn ensure_ffmpeg_tools() -> Result<(), AppError> {
    for tool in ["ffprobe", "ffmpeg"] {
        let output = Command::new(tool)
            .arg("-version")
            .output()
            .map_err(|err| {
                AppError::Environment(format!("{tool} is not available: {err}"))
            })?;

        if !output.status.success() {
            return Err(AppError::Environment(format!(
                "{tool} exited with status {}",
                output.status
            )));
        }
    }
    Ok(())
}

pub fn import_media(source_path: &Path, data_dir: &Path) -> Result<MediaImportResult, AppError> {
    let started = std::time::Instant::now();
    let result = import_media_inner(source_path, data_dir);
    if let Ok(ref import) = result {
        if let Err(err) = crate::performance::record_pipeline_timing(
            data_dir,
            &import.id,
            "import",
            started.elapsed().as_millis() as u64,
            true,
            None,
        ) {
            tracing::warn!("Failed to record import timing: {err}");
        }
    }
    result
}

fn import_media_inner(source_path: &Path, data_dir: &Path) -> Result<MediaImportResult, AppError> {
    ensure_ffmpeg_tools()?;

    if !source_path.exists() {
        return Err(AppError::Media(format!(
            "File not found: {}",
            source_path.display()
        )));
    }

    if !source_path.is_file() {
        return Err(AppError::Media(format!(
            "Path is not a file: {}",
            source_path.display()
        )));
    }

    let source = probe_media(source_path)?;
    if !source.has_audio {
        return Err(AppError::Media(
            "No audio stream found in the selected file.".into(),
        ));
    }

    let import_id = Uuid::new_v4().to_string();
    let imports_dir = data_dir.join("imports").join(&import_id);
    std::fs::create_dir_all(&imports_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create import directory: {err}"))
    })?;

    let canonical_path = imports_dir.join("canonical.wav");
    convert_to_canonical(source_path, &canonical_path)?;

    let source_json = serde_json::to_string_pretty(&source).map_err(|err| {
        AppError::Internal(format!("Failed to serialize source metadata: {err}"))
    })?;
    std::fs::write(imports_dir.join("source.json"), format!("{source_json}\n")).map_err(
        |err| AppError::Internal(format!("Failed to write source metadata: {err}")),
    )?;

    let canonical_meta = probe_media(&canonical_path)?;
    let canonical_size = file_size(&canonical_path);

    let prepared = crate::audio::prepare_from_canonical(
        &imports_dir,
        &canonical_path,
        canonical_meta.duration,
    )?;

    let _ = crate::audio::cleanup_import_temps(&imports_dir);

    Ok(MediaImportResult {
        id: import_id,
        source,
        canonical: AudioAssetInfo {
            id: Uuid::new_v4().to_string(),
            path: canonical_path,
            duration: canonical_meta.duration,
            sample_rate: canonical_meta.sample_rate.unwrap_or(CANONICAL_SAMPLE_RATE),
            channels: canonical_meta.channels.unwrap_or(CANONICAL_CHANNELS),
            codec: canonical_meta
                .codec
                .clone()
                .or_else(|| Some(CANONICAL_CODEC.into())),
            format: Some(CANONICAL_CONTAINER.into()),
            bit_rate: canonical_meta.bit_rate,
            file_size: canonical_size,
        },
        playable: prepared.playable,
        native_playback: prepared.native_playback,
        // Filled by the Tauri command using the local media server.
        playable_url: String::new(),
        waveform: WaveformDataDto {
            peaks: prepared.waveform.peaks,
            duration: prepared.waveform.duration,
            sample_rate: prepared.waveform.sample_rate,
            channels: prepared.waveform.channels,
            peak_count: prepared.waveform.peak_count,
        },
        format: CanonicalAudioFormat::default(),
    })
}

fn file_size(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok().map(|m| m.len())
}

pub fn imports_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("imports")
}

/// Rehydrate a session from an existing import directory (project open / recovery).
pub fn load_import_session(
    data_dir: &Path,
    import_id: &str,
    source: &MediaMetadata,
) -> Result<MediaImportResult, AppError> {
    crate::services::validate_import_id(import_id)?;

    let imports_dir = data_dir.join("imports").join(import_id);
    if !imports_dir.is_dir() {
        return Err(AppError::Media(format!("Import not found: {import_id}")));
    }

    let canonical_path = imports_dir.join("canonical.wav");
    if !canonical_path.is_file() {
        return Err(AppError::Media(format!(
            "Canonical audio missing for import {import_id}"
        )));
    }

    let canonical_meta = probe_media(&canonical_path)?;
    let canonical_size = file_size(&canonical_path);

    let playback_path = imports_dir.join("playback.wav");
    let preview_path = imports_dir.join("preview.mp3");
    let cache_path = imports_dir.join("waveform.json");

    let prepared = if playback_path.is_file() && preview_path.is_file() {
        let waveform = crate::audio::load_waveform_cache(&cache_path)?
            .unwrap_or_else(|| {
                crate::audio::analyze_waveform_and_peak(
                    &canonical_path,
                    crate::audio::DEFAULT_WAVEFORM_PEAKS,
                )
                .map(|(wf, _)| wf)
                .unwrap_or(crate::audio::WaveformData {
                    peaks: Vec::new(),
                    duration: canonical_meta.duration,
                    sample_rate: CANONICAL_SAMPLE_RATE,
                    channels: CANONICAL_CHANNELS,
                    peak_count: 0,
                })
            });

        let playable_size = std::fs::metadata(&preview_path).ok().map(|m| m.len());
        let playback_size = std::fs::metadata(&playback_path).ok().map(|m| m.len());

        crate::audio::AudioPrepareResult {
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
                sample_rate: crate::audio::playback_sample_rate(),
                channels: 2,
                codec: Some("pcm_s16le".into()),
                format: Some("wav".into()),
                bit_rate: None,
                file_size: playback_size,
            },
            waveform,
            peak_normalize: crate::audio::PeakNormalizeResult {
                source_peak: 0.0,
                gain_db: 0.0,
                target_peak: 0.95,
                applied: false,
            },
            waveform_cache_path: cache_path,
        }
    } else {
        crate::audio::prepare_from_canonical(
            &imports_dir,
            &canonical_path,
            canonical_meta.duration,
        )?
    };

    let _ = crate::audio::cleanup_import_temps(&imports_dir);

    Ok(MediaImportResult {
        id: import_id.to_string(),
        source: source.clone(),
        canonical: AudioAssetInfo {
            id: Uuid::new_v4().to_string(),
            path: canonical_path,
            duration: canonical_meta.duration,
            sample_rate: canonical_meta.sample_rate.unwrap_or(CANONICAL_SAMPLE_RATE),
            channels: canonical_meta.channels.unwrap_or(CANONICAL_CHANNELS),
            codec: canonical_meta
                .codec
                .clone()
                .or_else(|| Some(CANONICAL_CODEC.into())),
            format: Some(CANONICAL_CONTAINER.into()),
            bit_rate: canonical_meta.bit_rate,
            file_size: canonical_size,
        },
        playable: prepared.playable,
        native_playback: prepared.native_playback,
        playable_url: String::new(),
        waveform: WaveformDataDto {
            peaks: prepared.waveform.peaks,
            duration: prepared.waveform.duration,
            sample_rate: prepared.waveform.sample_rate,
            channels: prepared.waveform.channels,
            peak_count: prepared.waveform.peak_count,
        },
        format: CanonicalAudioFormat::default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_defaults_are_stable() {
        let format = CanonicalAudioFormat::default();
        assert_eq!(format.container, "wav");
        assert_eq!(format.codec, "pcm_s16le");
        assert_eq!(format.sample_rate, 44_100);
        assert_eq!(format.channels, 2);
    }
}
