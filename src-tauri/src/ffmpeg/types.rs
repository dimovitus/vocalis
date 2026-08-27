use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const CANONICAL_CONTAINER: &str = "wav";
pub const CANONICAL_CODEC: &str = "pcm_s16le";
pub const CANONICAL_SAMPLE_RATE: u32 = 44_100;
pub const CANONICAL_CHANNELS: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalAudioFormat {
    pub container: String,
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u32,
    pub description: String,
}

impl Default for CanonicalAudioFormat {
    fn default() -> Self {
        Self {
            container: CANONICAL_CONTAINER.into(),
            codec: CANONICAL_CODEC.into(),
            sample_rate: CANONICAL_SAMPLE_RATE,
            channels: CANONICAL_CHANNELS,
            description: "WAV PCM signed 16-bit LE @ 44100 Hz stereo".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub path: PathBuf,
    pub file_name: String,
    pub format_name: Option<String>,
    pub duration: f64,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub codec: Option<String>,
    pub bit_rate: Option<u64>,
    pub has_audio: bool,
    pub has_video: bool,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAssetInfo {
    pub id: String,
    pub path: PathBuf,
    pub duration: f64,
    pub sample_rate: u32,
    pub channels: u32,
    pub codec: Option<String>,
    pub format: Option<String>,
    pub bit_rate: Option<u64>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformDataDto {
    pub peaks: Vec<f32>,
    pub duration: f64,
    pub sample_rate: u32,
    pub channels: u32,
    pub peak_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaImportResult {
    pub id: String,
    pub source: MediaMetadata,
    pub canonical: AudioAssetInfo,
    pub playable: AudioAssetInfo,
    /// Compact PCM for native rodio preview (~22 kHz stereo).
    pub native_playback: AudioAssetInfo,
    /// HTTP URL served by the local media server (safe for WebKitGTK playback).
    pub playable_url: String,
    pub waveform: WaveformDataDto,
    pub format: CanonicalAudioFormat,
}
