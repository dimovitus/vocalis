use crate::audio::types::WaveformData;
use crate::audio::wav::{for_each_frame, inspect_wav};
use crate::error::AppError;
use std::path::Path;

/// Single-pass analysis: waveform peaks + absolute peak amplitude.
pub fn analyze_waveform_and_peak(
    path: &Path,
    peak_count: usize,
) -> Result<(WaveformData, f32), AppError> {
    if peak_count == 0 {
        return Err(AppError::Internal(
            "peak_count must be greater than zero".into(),
        ));
    }

    let info = inspect_wav(path)?;
    let frame_count = info.frame_count().max(1);
    let frames_per_peak = (frame_count as f64 / peak_count as f64).max(1.0);

    let mut peaks = vec![0.0f32; peak_count];
    let mut source_peak = 0.0f32;
    let mut frame_index = 0u64;

    for_each_frame(path, |sample| {
        let amp = sample.abs();
        if amp > source_peak {
            source_peak = amp;
        }

        let peak_index = ((frame_index as f64) / frames_per_peak).floor() as usize;
        if peak_index < peaks.len() && amp > peaks[peak_index] {
            peaks[peak_index] = amp;
        }
        frame_index += 1;
    })?;

    let max_peak = peaks.iter().cloned().fold(0.0f32, f32::max);
    if max_peak > 0.0 {
        for peak in &mut peaks {
            *peak /= max_peak;
        }
    }

    Ok((
        WaveformData {
            peaks,
            duration: info.duration_secs(),
            sample_rate: info.format.sample_rate,
            channels: u32::from(info.format.channels),
            peak_count,
        },
        source_peak,
    ))
}

/// Build waveform peaks from real PCM samples (streaming, mono-mixed).
pub fn generate_waveform(path: &Path, peak_count: usize) -> Result<WaveformData, AppError> {
    let (waveform, _) = analyze_waveform_and_peak(path, peak_count)?;
    Ok(waveform)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_peak_count_errors() {
        let err = generate_waveform(Path::new("/tmp/nope.wav"), 0).unwrap_err();
        assert!(err.to_string().contains("peak_count"));
    }
}
