use crate::error::AppError;
use crate::ffmpeg::types::MediaMetadata;
use serde::Deserialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    format: Option<FfprobeFormat>,
    streams: Option<Vec<FfprobeStream>>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    format_name: Option<String>,
    duration: Option<String>,
    bit_rate: Option<String>,
    size: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    sample_rate: Option<String>,
    channels: Option<u32>,
    bit_rate: Option<String>,
    duration: Option<String>,
}

pub fn probe_media(path: &Path) -> Result<MediaMetadata, AppError> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(path)
        .output()
        .map_err(|err| AppError::Ffmpeg(format!("Failed to run ffprobe: {err}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Media(format!(
            "ffprobe could not read this file: {}",
            stderr.trim()
        )));
    }

    let parsed: FfprobeOutput = serde_json::from_slice(&output.stdout).map_err(|err| {
        AppError::Ffmpeg(format!("Failed to parse ffprobe JSON: {err}"))
    })?;

    let streams = parsed.streams.unwrap_or_default();
    let audio = streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("audio"));
    let has_video = streams
        .iter()
        .any(|s| s.codec_type.as_deref() == Some("video"));
    let has_audio = audio.is_some();

    let format = parsed.format.unwrap_or(FfprobeFormat {
        format_name: None,
        duration: None,
        bit_rate: None,
        size: None,
    });

    let duration = audio
        .and_then(|s| s.duration.as_deref())
        .or(format.duration.as_deref())
        .and_then(parse_f64)
        .unwrap_or(0.0);

    let sample_rate = audio
        .and_then(|s| s.sample_rate.as_deref())
        .and_then(parse_u32);

    let channels = audio.and_then(|s| s.channels);
    let codec = audio.and_then(|s| s.codec_name.clone());

    let bit_rate = audio
        .and_then(|s| s.bit_rate.as_deref())
        .or(format.bit_rate.as_deref())
        .and_then(parse_u64);

    let file_size = format
        .size
        .as_deref()
        .and_then(parse_u64)
        .or_else(|| std::fs::metadata(path).ok().map(|m| m.len()));

    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());

    Ok(MediaMetadata {
        path: path.to_path_buf(),
        file_name,
        format_name: format.format_name,
        duration,
        sample_rate,
        channels,
        codec,
        bit_rate,
        has_audio,
        has_video,
        file_size,
    })
}

fn parse_f64(value: &str) -> Option<f64> {
    value.parse().ok()
}

fn parse_u32(value: &str) -> Option<u32> {
    value.parse().ok()
}

fn parse_u64(value: &str) -> Option<u64> {
    value.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_helpers_work() {
        assert_eq!(parse_f64("12.5"), Some(12.5));
        assert_eq!(parse_u32("44100"), Some(44100));
        assert_eq!(parse_u64("128000"), Some(128000));
        assert_eq!(parse_f64("nope"), None);
    }
}
