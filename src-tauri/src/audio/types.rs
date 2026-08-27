use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::ffmpeg::AudioAssetInfo;
use crate::audio::normalize::PeakNormalizeResult;

pub const DEFAULT_WAVEFORM_PEAKS: usize = 800;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformData {
    pub peaks: Vec<f32>,
    pub duration: f64,
    pub sample_rate: u32,
    pub channels: u32,
    pub peak_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioPrepareResult {
    pub playable: AudioAssetInfo,
    /// Compact PCM WAV for native rodio (not the 70MB canonical).
    pub native_playback: AudioAssetInfo,
    pub waveform: WaveformData,
    pub peak_normalize: PeakNormalizeResult,
    pub waveform_cache_path: PathBuf,
}
