mod config;
mod logging;
mod commands;

pub mod audio;
pub mod alignment;
pub mod correction;
pub mod editor;
pub mod error;
pub mod export;
pub mod ffmpeg;
pub mod hardware;
pub mod library;
pub mod models;
pub mod performance;
pub mod project;
pub mod resync;
pub mod services;
pub mod separation;
pub mod structure;
pub mod transcription;
pub mod translation;
pub mod video_export;

use commands::AppState;
use config::AppConfig;
use crate::audio::NativePlayer;
use services::MediaServer;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

fn resolve_worker_script() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .join("..")
        .join("apps")
        .join("ai-worker")
        .join("worker.py")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = AppConfig::load();
    logging::init_logging(&config.log_level);

    tracing::info!(
        "Starting {} v{}",
        config.app_name,
        config.app_version
    );

    let _ = std::fs::create_dir_all(&config.data_dir);
    let _ = crate::audio::ensure_processing_dirs(&config.data_dir);

    let media_server = tauri::async_runtime::block_on(MediaServer::start(config.data_dir.clone()))
        .unwrap_or_else(|err| {
            panic!("Failed to start local media server: {err}");
        });
    let media_server = Arc::new(media_server);

    let player = match NativePlayer::try_new() {
        Ok(player) => Arc::new(player),
        Err(err) => {
            tracing::error!("Native audio player unavailable: {err}");
            panic!("Failed to initialize native audio player: {err}");
        }
    };

    let worker_script = resolve_worker_script();
    let app_state = AppState::new(config.clone(), worker_script, media_server, player);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .setup(|app| {
            let state = app.state::<AppState>();
            if let Err(err) = state.ensure_data_dirs() {
                tracing::error!("Failed to create data directories: {err}");
            }
            let removed = crate::audio::cleanup_temp_dir(
                &crate::audio::temp_dir(&state.config.data_dir),
                Duration::from_secs(60 * 60 * 24),
            )
            .unwrap_or(0);
            if removed > 0 {
                tracing::info!("Cleaned {removed} stale temp files");
            }
            if let Err(err) = state.python_worker.ensure_running() {
                tracing::error!("Failed to start Python worker on setup: {err}");
            } else if let Err(err) = state.python_worker.ping() {
                tracing::warn!("Python worker started but ping failed on setup: {err}");
            }

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let window_handle = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    window_handle.open_devtools();
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_environment_info,
            commands::health_check,
            commands::pipeline_ping,
            commands::probe_media_file,
            commands::import_media_file,
            commands::generate_waveform_for_path,
            commands::transcribe_import,
            commands::get_raw_transcription,
            commands::align_import,
            commands::get_alignment,
            commands::separate_import,
            commands::get_separation,
            commands::mix_stems_preview,
            commands::correct_lyrics,
            commands::get_corrected_lyrics,
            commands::detect_structure,
            commands::get_structure,
            commands::save_edited_lyrics,
            commands::get_edited_lyrics,
            commands::resync_import,
            commands::get_resync,
            commands::translate_import,
            commands::get_translation,
            commands::write_export_file,
            commands::export_karaoke_video,
            commands::save_project,
            commands::autosave_project,
            commands::open_project,
            commands::list_recovery_sessions,
            commands::recover_session,
            commands::open_import_session,
            commands::list_library_tracks,
            commands::update_library_track,
            commands::sync_library_track,
            commands::remove_library_track,
            commands::get_hardware_capabilities,
            commands::resolve_compute_backend,
            commands::list_model_inventory,
            commands::download_model,
            commands::remove_model,
            commands::get_model_preferences,
            commands::set_model_preferences,
            commands::get_import_performance,
            commands::get_performance_summary,
            commands::player_open,
            commands::player_play,
            commands::player_pause,
            commands::player_seek,
            commands::player_status,
            commands::player_stop,
            commands::player_set_volume,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
