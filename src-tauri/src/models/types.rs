use serde::{Deserialize, Serialize};

pub const MODEL_PREFERENCES_FILE: &str = "model_preferences.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelInventoryItem {
    pub stage: String,
    pub model_id: String,
    pub label: String,
    pub description: String,
    pub installed: bool,
    pub size_bytes: u64,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInventory {
    pub whisper_root: String,
    pub separation_root: String,
    pub translation_root: String,
    pub items: Vec<ModelInventoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreferences {
    pub transcription: String,
    pub alignment: String,
    pub correction: String,
    pub separation: String,
    pub translation: String,
}

impl Default for ModelPreferences {
    fn default() -> Self {
        Self {
            transcription: "tiny".into(),
            alignment: "tiny".into(),
            correction: "tiny".into(),
            separation: "htdemucs".into(),
            translation: "en-ru".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadModelRequest {
    pub stage: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveModelRequest {
    pub stage: String,
    pub model_id: String,
}
