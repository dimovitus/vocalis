//! Phase 18 — AI model inventory, explicit download/remove, per-stage defaults.

mod types;

pub use types::{
    DownloadModelRequest, ModelInventory, ModelInventoryItem, ModelPreferences,
    RemoveModelRequest, MODEL_PREFERENCES_FILE,
};

use crate::error::AppError;
use crate::services::PythonWorker;
use serde_json::json;
use std::fs;
use std::path::Path;
use std::time::Duration;

const MODEL_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(60 * 30);

pub fn list_model_inventory(
    worker: &PythonWorker,
    data_dir: &Path,
) -> Result<ModelInventory, AppError> {
    let params = json!({ "dataDir": data_dir.to_string_lossy() });
    worker.call_with_timeout("list_models", Some(params), Duration::from_secs(30))
}

pub fn download_model(
    worker: &PythonWorker,
    data_dir: &Path,
    request: &DownloadModelRequest,
) -> Result<ModelInventoryItem, AppError> {
    let params = json!({
        "dataDir": data_dir.to_string_lossy(),
        "stage": request.stage,
        "modelId": request.model_id,
    });
    worker.call_with_timeout("download_model", Some(params), MODEL_DOWNLOAD_TIMEOUT)
}

pub fn remove_model(
    worker: &PythonWorker,
    data_dir: &Path,
    request: &RemoveModelRequest,
) -> Result<(), AppError> {
    let params = json!({
        "dataDir": data_dir.to_string_lossy(),
        "stage": request.stage,
        "modelId": request.model_id,
    });
    let _: serde_json::Value =
        worker.call_with_timeout("remove_model", Some(params), Duration::from_secs(120))?;
    Ok(())
}

pub fn load_model_preferences(data_dir: &Path) -> Result<ModelPreferences, AppError> {
    let path = data_dir.join(MODEL_PREFERENCES_FILE);
    if !path.exists() {
        return Ok(ModelPreferences::default());
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::Internal(format!("Failed to read model preferences: {err}"))
    })?;
    serde_json::from_str(&content).map_err(|err| {
        AppError::Internal(format!("Failed to parse model preferences: {err}"))
    })
}

pub fn save_model_preferences(
    data_dir: &Path,
    preferences: &ModelPreferences,
) -> Result<ModelPreferences, AppError> {
    fs::create_dir_all(data_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create data directory: {err}"))
    })?;

    let path = data_dir.join(MODEL_PREFERENCES_FILE);
    let content = serde_json::to_string_pretty(preferences).map_err(|err| {
        AppError::Internal(format!("Failed to serialize model preferences: {err}"))
    })?;
    fs::write(&path, content).map_err(|err| {
        AppError::Internal(format!("Failed to write model preferences: {err}"))
    })?;

    Ok(preferences.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_preferences_use_tiny_whisper_and_htdemucs() {
        let prefs = ModelPreferences::default();
        assert_eq!(prefs.transcription, "tiny");
        assert_eq!(prefs.separation, "htdemucs");
    }

    #[test]
    fn round_trip_preferences_on_disk() {
        let dir = std::env::temp_dir().join(format!(
            "vocalis-model-prefs-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();

        let prefs = ModelPreferences {
            transcription: "base".into(),
            alignment: "base".into(),
            correction: "small".into(),
            separation: "htdemucs".into(),
            translation: "en-de".into(),
        };
        save_model_preferences(&dir, &prefs).unwrap();
        let loaded = load_model_preferences(&dir).unwrap();
        assert_eq!(loaded, prefs);

        let _ = fs::remove_dir_all(&dir);
    }
}
