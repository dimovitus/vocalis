use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Python worker error: {0}")]
    PythonWorker(String),

    #[error("IPC error: {0}")]
    Ipc(String),

    #[error("Environment error: {0}")]
    Environment(String),

    #[error("Media error: {0}")]
    Media(String),

    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
    pub user_message: String,
    pub details: Option<String>,
    pub recoverable: bool,
    pub suggested_action: Option<String>,
}

impl AppError {
    pub fn to_response(&self) -> ErrorResponse {
        match self {
            AppError::PythonWorker(msg) => classify_worker_error(msg),
            AppError::Media(msg) => classify_media_error(msg),
            AppError::Ffmpeg(msg) => base_ffmpeg(msg),
            AppError::Environment(msg) => base_environment(msg),
            AppError::Config(msg) => base_config(msg),
            AppError::Ipc(msg) => base_ipc(msg),
            AppError::Internal(msg) => base_internal(msg),
        }
    }
}

fn classify_worker_error(msg: &str) -> ErrorResponse {
    let lower = msg.to_lowercase();

    if lower.contains("model manager") || lower.contains("not installed") {
        return ErrorResponse {
            code: "MODEL_NOT_INSTALLED".into(),
            message: msg.into(),
            user_message: "A required AI model is not installed.".into(),
            details: Some(msg.into()),
            recoverable: true,
            suggested_action: Some(
                "Open System → Model Manager and download the model for this pipeline stage."
                    .into(),
            ),
        };
    }

    if lower.contains("timed out") {
        return ErrorResponse {
            code: "WORKER_TIMEOUT".into(),
            message: msg.into(),
            user_message: "The AI worker took too long to respond.".into(),
            details: Some(msg.into()),
            recoverable: true,
            suggested_action: Some(
                "Try a smaller model, switch to CPU, or retry with a shorter clip.".into(),
            ),
        };
    }

    if lower.contains("libcublas")
        || lower.contains("cublas")
        || lower.contains("cudnn")
        || (lower.contains("cuda") && lower.contains("cannot be loaded"))
    {
        return ErrorResponse {
            code: "CUDA_UNAVAILABLE".into(),
            message: msg.into(),
            user_message: "GPU acceleration failed — CUDA libraries are missing or mismatched."
                .into(),
            details: Some(msg.into()),
            recoverable: true,
            suggested_action: Some(
                "Open System → Hardware, set Compute backend to CPU, click Refresh probe, then retry. \
                 To use GPU, install CUDA libraries matching your faster-whisper / CTranslate2 build."
                    .into(),
            ),
        };
    }

    if lower.contains("transcribe first")
        || lower.contains("run transcribe")
        || lower.contains("no raw transcription")
        || lower.contains("before running")
        || lower.contains("save edits in the editor first")
    {
        return ErrorResponse {
            code: "PIPELINE_PREREQUISITE".into(),
            message: msg.into(),
            user_message: "Complete an earlier pipeline step first.".into(),
            details: Some(msg.into()),
            recoverable: true,
            suggested_action: Some(
                "Follow the pipeline order: import → transcribe → align → edit/export.".into(),
            ),
        };
    }

    base_python_worker(msg)
}

fn classify_media_error(msg: &str) -> ErrorResponse {
    let lower = msg.to_lowercase();

    if lower.contains("transcribe first")
        || lower.contains("run transcribe")
        || lower.contains("no raw transcription")
        || lower.contains("before running")
        || lower.contains("save edits in the editor first")
    {
        return ErrorResponse {
            code: "PIPELINE_PREREQUISITE".into(),
            message: msg.into(),
            user_message: "Complete an earlier pipeline step first.".into(),
            details: Some(msg.into()),
            recoverable: true,
            suggested_action: Some(
                "Follow the pipeline order: import → transcribe → align → edit/export.".into(),
            ),
        };
    }

    if lower.contains("not found") || lower.contains("missing") {
        return ErrorResponse {
            code: "MEDIA_ERROR".into(),
            message: msg.into(),
            user_message: "The requested media or project file was not found.".into(),
            details: Some(msg.into()),
            recoverable: true,
            suggested_action: Some(
                "Re-import the track or verify the project folder still exists.".into(),
            ),
        };
    }

    if lower.contains("invalid importid") || lower.contains("importid must be a uuid") {
        return ErrorResponse {
            code: "MEDIA_ERROR".into(),
            message: msg.into(),
            user_message: "The session reference is invalid.".into(),
            details: Some(msg.into()),
            recoverable: true,
            suggested_action: Some("Re-open the track from Library or import again.".into()),
        };
    }

    base_media(msg)
}

fn base_config(msg: &str) -> ErrorResponse {
    ErrorResponse {
        code: "CONFIG_ERROR".into(),
        message: msg.into(),
        user_message: "Application configuration is invalid.".into(),
        details: Some(msg.into()),
        recoverable: false,
        suggested_action: Some("Check configuration files and restart the application.".into()),
    }
}

fn base_python_worker(msg: &str) -> ErrorResponse {
    ErrorResponse {
        code: "PYTHON_WORKER_ERROR".into(),
        message: msg.into(),
        user_message: "The AI worker could not complete the request.".into(),
        details: Some(msg.into()),
        recoverable: true,
        suggested_action: Some(
            "Verify the Python environment with scripts/setup-python.sh and retry.".into(),
        ),
    }
}

fn base_ipc(msg: &str) -> ErrorResponse {
    ErrorResponse {
        code: "IPC_ERROR".into(),
        message: msg.into(),
        user_message: "Internal communication failed.".into(),
        details: Some(msg.into()),
        recoverable: true,
        suggested_action: Some("Restart the application.".into()),
    }
}

fn base_environment(msg: &str) -> ErrorResponse {
    ErrorResponse {
        code: "ENVIRONMENT_ERROR".into(),
        message: msg.into(),
        user_message: "A required dependency is missing.".into(),
        details: Some(msg.into()),
        recoverable: true,
        suggested_action: Some(
            "Install FFmpeg and the Python worker dependencies listed in DEVELOPMENT.md.".into(),
        ),
    }
}

fn base_media(msg: &str) -> ErrorResponse {
    ErrorResponse {
        code: "MEDIA_ERROR".into(),
        message: msg.into(),
        user_message: "The media file or session could not be processed.".into(),
        details: Some(msg.into()),
        recoverable: true,
        suggested_action: Some(
            "Choose a supported audio/video file (MP3, FLAC, WAV, M4A, MP4, …).".into(),
        ),
    }
}

fn base_ffmpeg(msg: &str) -> ErrorResponse {
    ErrorResponse {
        code: "FFMPEG_ERROR".into(),
        message: msg.into(),
        user_message: "FFmpeg failed while processing the media file.".into(),
        details: Some(msg.into()),
        recoverable: true,
        suggested_action: Some(
            "Verify FFmpeg is installed and the source file is not corrupted.".into(),
        ),
    }
}

fn base_internal(msg: &str) -> ErrorResponse {
    ErrorResponse {
        code: "INTERNAL_ERROR".into(),
        message: msg.into(),
        user_message: "An unexpected error occurred.".into(),
        details: Some(msg.into()),
        recoverable: true,
        suggested_action: Some("Restart the application and check logs.".into()),
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_response().serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worker_model_missing_maps_to_model_not_installed() {
        let response = AppError::PythonWorker(
            "Whisper model 'tiny' is not installed. Download it from Model Manager.".into(),
        )
        .to_response();
        assert_eq!(response.code, "MODEL_NOT_INSTALLED");
        assert!(response.recoverable);
        assert!(response.suggested_action.unwrap().contains("Model Manager"));
    }

    #[test]
    fn worker_timeout_maps_to_timeout_code() {
        let response = AppError::PythonWorker(
            "Worker timed out after 60000ms for method 'transcribe'".into(),
        )
        .to_response();
        assert_eq!(response.code, "WORKER_TIMEOUT");
    }

    #[test]
    fn worker_cuda_library_error_maps_to_cuda_unavailable() {
        let response = AppError::PythonWorker(
            "INTERNAL_ERROR: Library libcublas.so.12 is not found or cannot be loaded".into(),
        )
        .to_response();
        assert_eq!(response.code, "CUDA_UNAVAILABLE");
        assert!(response
            .suggested_action
            .unwrap()
            .contains("Compute backend to CPU"));
    }

    #[test]
    fn media_prerequisite_maps_to_pipeline_prerequisite() {
        let response =
            AppError::Media("No raw transcription for import x. Run Transcribe first.".into())
                .to_response();
        assert_eq!(response.code, "PIPELINE_PREREQUISITE");
    }
}
