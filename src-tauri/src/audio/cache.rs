use crate::audio::types::WaveformData;
use crate::error::AppError;
use std::path::Path;

pub fn save_waveform_cache(path: &Path, waveform: &WaveformData) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::Internal(format!("Failed to create waveform cache dir: {err}"))
        })?;
    }

    let json = serde_json::to_vec_pretty(waveform).map_err(|err| {
        AppError::Internal(format!("Failed to serialize waveform cache: {err}"))
    })?;

    std::fs::write(path, json).map_err(|err| {
        AppError::Internal(format!("Failed to write waveform cache: {err}"))
    })?;

    Ok(())
}

pub fn load_waveform_cache(path: &Path) -> Result<Option<WaveformData>, AppError> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = std::fs::read(path).map_err(|err| {
        AppError::Internal(format!("Failed to read waveform cache: {err}"))
    })?;

    let waveform = serde_json::from_slice(&bytes).map_err(|err| {
        AppError::Internal(format!("Corrupt waveform cache: {err}"))
    })?;

    Ok(Some(waveform))
}
