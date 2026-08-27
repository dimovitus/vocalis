//! Phase 25 — FFmpeg karaoke video renderer (ASS burn-in + audio mux).

mod types;

pub use types::{ExportKaraokeVideoRequest, ExportKaraokeVideoResult};

use crate::error::AppError;
use crate::ffmpeg;
use crate::services::{
    import_dir, validate_export_contents, validate_export_path, validate_import_id,
    validate_imports_file, validate_user_media_path,
};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

const MIN_DIMENSION: u32 = 640;
const MAX_DIMENSION: u32 = 3840;
const MIN_FPS: u32 = 1;
const MAX_FPS: u32 = 60;

pub fn export_karaoke_video(
    data_dir: &Path,
    request: &ExportKaraokeVideoRequest,
) -> Result<ExportKaraokeVideoResult, AppError> {
    ffmpeg::ensure_ffmpeg_tools()?;

    let import_id = validate_import_id(&request.import_id)?;
    let import_path = import_dir(data_dir, &import_id)?;

    let output = PathBuf::from(&request.output_path);
    validate_export_path(&output)?;
    validate_export_contents(&request.ass_contents)?;
    validate_render_params(request.width, request.height, request.fps)?;

    let audio_path = import_path.join("canonical.wav");
    validate_imports_file(data_dir, &audio_path)?;

    let duration = if request.duration > 0.0 {
        request.duration
    } else {
        ffmpeg::probe_media(&audio_path)?.duration
    };

    if duration <= 0.0 {
        return Err(AppError::Media(
            "Cannot render video — audio duration is unknown.".into(),
        ));
    }

    let export_dir = import_path.join("export");
    fs::create_dir_all(&export_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create export directory: {err}"))
    })?;

    let ass_name = format!("karaoke-{}.ass", Uuid::new_v4());
    let ass_path = export_dir.join(&ass_name);
    fs::write(&ass_path, &request.ass_contents).map_err(|err| {
        AppError::Internal(format!("Failed to write ASS subtitles: {err}"))
    })?;

    let background = request
        .background_path
        .as_ref()
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty());

    if let Some(ref bg) = background {
        validate_user_media_path(bg)?;
    }

    let started = std::time::Instant::now();

    render_with_ffmpeg(
        &export_dir,
        &ass_name,
        &audio_path,
        background.as_deref(),
        &output,
        request.width,
        request.height,
        request.fps,
        duration,
        request.background_color.as_deref(),
    )?;

    let _ = fs::remove_file(&ass_path);

    let _ = crate::performance::record_pipeline_timing(
        data_dir,
        &import_id,
        "video_export",
        started.elapsed().as_millis() as u64,
        true,
        None,
    );

    tracing::info!(
        "Rendered karaoke video {} ({}x{} @ {}fps)",
        output.display(),
        request.width,
        request.height,
        request.fps
    );

    Ok(ExportKaraokeVideoResult {
        output_path: output.to_string_lossy().into_owned(),
        width: request.width,
        height: request.height,
        fps: request.fps,
        duration_seconds: duration,
        codec: "h264".into(),
    })
}

fn validate_render_params(width: u32, height: u32, fps: u32) -> Result<(), AppError> {
    if width < MIN_DIMENSION
        || height < MIN_DIMENSION
        || width > MAX_DIMENSION
        || height > MAX_DIMENSION
    {
        return Err(AppError::Media(format!(
            "Video dimensions must be between {MIN_DIMENSION} and {MAX_DIMENSION} pixels"
        )));
    }
    if fps < MIN_FPS || fps > MAX_FPS {
        return Err(AppError::Media(format!(
            "FPS must be between {MIN_FPS} and {MAX_FPS}"
        )));
    }
    Ok(())
}

fn lavfi_color_hex(input: Option<&str>) -> String {
    let raw = input.unwrap_or("#0b0d12").trim();
    let hex = raw.strip_prefix('#').unwrap_or(raw);
    if hex.len() >= 6 {
        format!("0x{}", &hex[..6])
    } else {
        "0x0b0d12".into()
    }
}

fn is_image_background(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif"
            )
        })
        .unwrap_or(false)
}

fn render_with_ffmpeg(
    work_dir: &Path,
    ass_name: &str,
    audio: &Path,
    background: Option<&Path>,
    output: &Path,
    width: u32,
    height: u32,
    fps: u32,
    duration: f64,
    background_color: Option<&str>,
) -> Result<(), AppError> {
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| {
                AppError::Internal(format!("Failed to create output directory: {err}"))
            })?;
        }
    }

    let ass_filter = format!("ass={ass_name}");
    let scale_filter = format!(
        "scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},{ass_filter}"
    );
    let color = lavfi_color_hex(background_color);
    let duration_arg = format!("{:.3}", duration + 0.25);

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-hide_banner").arg("-loglevel").arg("error").arg("-y");

    match background {
        Some(bg) if is_image_background(bg) => {
            cmd.args([
                "-loop",
                "1",
                "-i",
                &bg.to_string_lossy(),
                "-i",
                &audio.to_string_lossy(),
                "-vf",
                &scale_filter,
            ]);
        }
        Some(bg) => {
            cmd.args([
                "-stream_loop",
                "-1",
                "-i",
                &bg.to_string_lossy(),
                "-i",
                &audio.to_string_lossy(),
                "-vf",
                &scale_filter,
            ]);
        }
        None => {
            let lavfi = format!(
                "color=c={color}:s={width}x{height}:d={duration_arg}:r={fps}"
            );
            cmd.args([
                "-f",
                "lavfi",
                "-i",
                &lavfi,
                "-i",
                &audio.to_string_lossy(),
                "-vf",
                &ass_filter,
            ]);
        }
    }

    cmd.args([
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        "23",
        "-r",
        &fps.to_string(),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        &output.to_string_lossy(),
    ]);

    cmd.current_dir(work_dir);

    let output_result = cmd
        .output()
        .map_err(|err| AppError::Ffmpeg(format!("Failed to run ffmpeg video export: {err}")))?;

    if !output_result.status.success() {
        let stderr = String::from_utf8_lossy(&output_result.stderr);
        return Err(AppError::Ffmpeg(format!(
            "ffmpeg video export failed: {}",
            stderr.trim()
        )));
    }

    if !output.is_file() {
        return Err(AppError::Ffmpeg(
            "ffmpeg reported success but output file is missing".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_render_params_accepts_1080p30() {
        validate_render_params(1920, 1080, 30).expect("valid");
    }

    #[test]
    fn validate_render_params_rejects_tiny_frame() {
        let err = validate_render_params(320, 240, 30).unwrap_err();
        assert!(err.to_string().contains("dimensions"));
    }

    #[test]
    fn lavfi_color_strips_hash() {
        assert_eq!(lavfi_color_hex(Some("#112233")), "0x112233");
    }
}
