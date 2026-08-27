use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const MIN_WORKER_TIMEOUT_MS: u64 = 1_000;
const MAX_WORKER_TIMEOUT_MS: u64 = 300_000;
const MIN_ML_TIMEOUT_MS: u64 = 10_000;
const MAX_ML_TIMEOUT_MS: u64 = 7_200_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub app_name: String,
    pub app_version: String,
    pub log_level: String,
    pub python_worker_timeout_ms: u64,
    /// Long-running ML calls (transcription, …).
    pub python_ml_timeout_ms: u64,
    pub data_dir: PathBuf,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            app_name: "Vocalis AI".into(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            log_level: std::env::var("VOCALIS_LOG_LEVEL").unwrap_or_else(|_| "info".into()),
            python_worker_timeout_ms: 30_000,
            python_ml_timeout_ms: 1_800_000,
            data_dir: default_data_dir(),
        }
    }
}

fn default_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("vocalis")
}

fn clamp_timeout(value: u64, min: u64, max: u64, label: &str) -> u64 {
    if value < min {
        tracing::warn!("{label} below minimum ({value}ms) — using {min}ms");
        min
    } else if value > max {
        tracing::warn!("{label} above maximum ({value}ms) — using {max}ms");
        max
    } else {
        value
    }
}

impl AppConfig {
    pub fn load() -> Self {
        let mut config = Self::default();
        if let Err(err) = config.validate() {
            tracing::warn!("Config validation adjusted settings: {err}");
        }
        config
    }

    /// Clamp unsafe timeout values and ensure the data directory exists.
    pub fn validate(&mut self) -> Result<(), AppError> {
        self.python_worker_timeout_ms = clamp_timeout(
            self.python_worker_timeout_ms,
            MIN_WORKER_TIMEOUT_MS,
            MAX_WORKER_TIMEOUT_MS,
            "python_worker_timeout_ms",
        );
        self.python_ml_timeout_ms = clamp_timeout(
            self.python_ml_timeout_ms,
            MIN_ML_TIMEOUT_MS,
            MAX_ML_TIMEOUT_MS,
            "python_ml_timeout_ms",
        );

        if self.data_dir.as_os_str().is_empty() {
            self.data_dir = default_data_dir();
        }

        std::fs::create_dir_all(&self.data_dir).map_err(|err| {
            AppError::Config(format!(
                "Failed to create data directory {}: {err}",
                self.data_dir.display()
            ))
        })?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_clamps_worker_timeouts() {
        let mut config = AppConfig {
            python_worker_timeout_ms: 1,
            python_ml_timeout_ms: 999_999_999,
            ..AppConfig::default()
        };
        config.validate().expect("validate");
        assert_eq!(config.python_worker_timeout_ms, MIN_WORKER_TIMEOUT_MS);
        assert_eq!(config.python_ml_timeout_ms, MAX_ML_TIMEOUT_MS);
    }
}
