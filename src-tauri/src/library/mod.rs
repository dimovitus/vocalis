//! Phase 16 — local music library (tracks, artists, albums, search, favorites, status).

mod types;

pub use types::{
    LibraryIndex, LibraryListResult, LibraryQuery, LibraryTrack, LibraryTrackLayers,
    LibraryTrackStatus, SyncLibraryTrackRequest, UpdateLibraryTrackRequest,
    UpsertLibraryTrackRequest,
};

use crate::alignment::ALIGNMENT_FILE;
use crate::correction::CORRECTED_LYRICS_FILE;
use crate::editor::EDITED_LYRICS_FILE;
use crate::error::AppError;
use crate::ffmpeg::MediaMetadata;
use crate::resync::RESYNC_FILE;
use crate::separation::SEPARATION_FILE;
use crate::services::{import_dir, validate_import_id};
use crate::structure::STRUCTURE_FILE;
use crate::transcription::RAW_TRANSCRIPTION_FILE;
use crate::translation::TRANSLATION_FILE;
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};

pub const LIBRARY_FILE: &str = "library.json";

pub fn upsert_track(
    data_dir: &Path,
    request: &UpsertLibraryTrackRequest,
) -> Result<LibraryTrack, AppError> {
    let import_id = validate_import_id(&request.import_id)?;
    let import_path = import_dir(data_dir, &import_id)?;
    let layers = detect_layers(&import_path);
    let parsed = parse_track_names(&request.file_name);

    let mut index = load_index(data_dir)?;
    let now = Utc::now().to_rfc3339();

    if let Some(track) = index.tracks.iter_mut().find(|t| t.import_id == import_id) {
        track.file_name = request.file_name.clone();
        track.source_path = request.source_path.clone();
        track.duration = request.duration;
        track.title = request
            .title
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| parsed.title.clone());
        track.artist = request
            .artist
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| parsed.artist.clone());
        track.album = request
            .album
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| parsed.album.clone());
        track.layers = layers.clone();
        track.status = compute_status(&layers, false, track.status_message.as_deref());
        track.updated_at = now.clone();
        let updated = track.clone();
        index.updated_at = now;
        save_index(data_dir, &index)?;
        return Ok(updated);
    }

    let track = LibraryTrack {
        import_id: import_id.clone(),
        title: request
            .title
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(parsed.title),
        artist: request
            .artist
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(parsed.artist),
        album: request
            .album
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(parsed.album),
        duration: request.duration,
        file_name: request.file_name.clone(),
        source_path: request.source_path.clone(),
        favorite: false,
        status: compute_status(&layers, false, None),
        status_message: None,
        project_path: None,
        added_at: now.clone(),
        updated_at: now.clone(),
        layers,
    };

    index.tracks.push(track.clone());
    index.updated_at = now;
    save_index(data_dir, &index)?;
    Ok(track)
}

pub fn sync_track(
    data_dir: &Path,
    request: &SyncLibraryTrackRequest,
) -> Result<LibraryTrack, AppError> {
    let import_id = validate_import_id(&request.import_id)?;
    let import_path = import_dir(data_dir, &import_id)?;
    let layers = detect_layers(&import_path);
    let processing = request.processing.unwrap_or(false);

    let mut index = load_index(data_dir)?;
    let now = Utc::now().to_rfc3339();

    let track = index
        .tracks
        .iter_mut()
        .find(|t| t.import_id == import_id)
        .ok_or_else(|| AppError::Media(format!("Library track not found: {import_id}")))?;

    if let Some(title) = request.title.as_ref().filter(|s| !s.trim().is_empty()) {
        track.title = title.clone();
    }
    if let Some(path) = request.project_path.clone() {
        track.project_path = Some(path);
    }
    if request.status_message.is_some() {
        track.status_message = request.status_message.clone();
    }

    track.layers = layers.clone();
    track.status = compute_status(&layers, processing, track.status_message.as_deref());
    track.updated_at = now.clone();
    let updated = track.clone();

    index.updated_at = now;
    save_index(data_dir, &index)?;
    Ok(updated)
}

pub fn update_track(
    data_dir: &Path,
    request: &UpdateLibraryTrackRequest,
) -> Result<LibraryTrack, AppError> {
    let import_id = validate_import_id(&request.import_id)?;
    let mut index = load_index(data_dir)?;
    let now = Utc::now().to_rfc3339();

    let track = index
        .tracks
        .iter_mut()
        .find(|t| t.import_id == import_id)
        .ok_or_else(|| AppError::Media(format!("Library track not found: {import_id}")))?;

    if let Some(title) = request.title.as_ref().filter(|s| !s.trim().is_empty()) {
        track.title = title.clone();
    }
    if let Some(artist) = request.artist.as_ref().filter(|s| !s.trim().is_empty()) {
        track.artist = artist.clone();
    }
    if let Some(album) = request.album.as_ref().filter(|s| !s.trim().is_empty()) {
        track.album = album.clone();
    }
    if let Some(favorite) = request.favorite {
        track.favorite = favorite;
    }

    track.updated_at = now.clone();
    let updated = track.clone();
    index.updated_at = now;
    save_index(data_dir, &index)?;
    Ok(updated)
}

pub fn remove_track(data_dir: &Path, import_id: &str) -> Result<(), AppError> {
    let id = validate_import_id(import_id)?;
    let mut index = load_index(data_dir)?;
    let before = index.tracks.len();
    index.tracks.retain(|t| t.import_id != id);
    if index.tracks.len() == before {
        return Err(AppError::Media(format!("Library track not found: {id}")));
    }
    index.updated_at = Utc::now().to_rfc3339();
    save_index(data_dir, &index)
}

pub fn list_tracks(data_dir: &Path, query: &LibraryQuery) -> Result<LibraryListResult, AppError> {
    let index = load_index(data_dir)?;
    let search = query
        .search
        .as_ref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    let mut tracks: Vec<LibraryTrack> = index
        .tracks
        .into_iter()
        .filter(|track| {
            if query.favorites_only == Some(true) && !track.favorite {
                return false;
            }
            if let Some(status) = query.status {
                if track.status != status {
                    return false;
                }
            }
            if let Some(ref needle) = search {
                let hay = format!(
                    "{} {} {} {}",
                    track.title, track.artist, track.album, track.file_name
                )
                .to_lowercase();
                if !hay.contains(needle) {
                    return false;
                }
            }
            true
        })
        .collect();

    sort_tracks(&mut tracks, query.sort_by.as_deref(), query.sort_desc.unwrap_or(false));

    let artists = unique_sorted(tracks.iter().map(|t| t.artist.as_str()));
    let albums = unique_sorted(tracks.iter().map(|t| t.album.as_str()));
    let total = tracks.len();

    Ok(LibraryListResult {
        tracks,
        artists,
        albums,
        total,
    })
}

pub fn load_source_metadata(data_dir: &Path, import_id: &str) -> Result<MediaMetadata, AppError> {
    let import_path = import_dir(data_dir, import_id)?;
    let source_path = import_path.join("source.json");
    if source_path.is_file() {
        let bytes = fs::read(&source_path)
            .map_err(|err| AppError::Internal(format!("Failed to read source.json: {err}")))?;
        if let Ok(source) = serde_json::from_slice::<MediaMetadata>(&bytes) {
            return Ok(source);
        }
    }

    let canonical = import_path.join("canonical.wav");
    crate::ffmpeg::probe_media(&canonical)
}

pub struct ParsedTrackNames {
    pub title: String,
    pub artist: String,
    pub album: String,
}

pub fn parse_track_names(file_name: &str) -> ParsedTrackNames {
    let stem = file_name
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(file_name)
        .trim()
        .to_string();

    if let Some((artist, title)) = stem.split_once(" - ") {
        let artist = artist.trim().to_string();
        let title = title.trim().to_string();
        return ParsedTrackNames {
            album: artist.clone(),
            artist,
            title: if title.is_empty() { stem.clone() } else { title },
        };
    }

    ParsedTrackNames {
        title: if stem.is_empty() {
            "Untitled".into()
        } else {
            stem.clone()
        },
        artist: "Unknown Artist".into(),
        album: "Unknown Album".into(),
    }
}

pub fn compute_status(
    layers: &LibraryTrackLayers,
    processing: bool,
    status_message: Option<&str>,
) -> LibraryTrackStatus {
    if status_message.is_some() {
        return LibraryTrackStatus::Failed;
    }
    if processing {
        return LibraryTrackStatus::Processing;
    }
    if layers.has_edited_lyrics || layers.has_alignment || layers.has_correction {
        return LibraryTrackStatus::KaraokeReady;
    }
    if layers.has_transcription {
        return LibraryTrackStatus::Ready;
    }
    LibraryTrackStatus::Imported
}

fn detect_layers(import_path: &Path) -> LibraryTrackLayers {
    LibraryTrackLayers {
        has_transcription: import_path.join(RAW_TRANSCRIPTION_FILE).is_file(),
        has_alignment: import_path.join(ALIGNMENT_FILE).is_file(),
        has_correction: import_path.join(CORRECTED_LYRICS_FILE).is_file(),
        has_structure: import_path.join(STRUCTURE_FILE).is_file(),
        has_edited_lyrics: import_path.join(EDITED_LYRICS_FILE).is_file(),
        has_resync: import_path.join(RESYNC_FILE).is_file(),
        has_translation: import_path.join(TRANSLATION_FILE).is_file(),
        has_separation: import_path.join(SEPARATION_FILE).is_file(),
    }
}

fn sort_tracks(tracks: &mut [LibraryTrack], sort_by: Option<&str>, desc: bool) {
    let key = sort_by.unwrap_or("updatedAt");
    tracks.sort_by(|a, b| {
        let ord = match key {
            "title" => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
            "artist" => a
                .artist
                .to_lowercase()
                .cmp(&b.artist.to_lowercase())
                .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
            "album" => a
                .album
                .to_lowercase()
                .cmp(&b.album.to_lowercase())
                .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
            "duration" => a
                .duration
                .partial_cmp(&b.duration)
                .unwrap_or(std::cmp::Ordering::Equal),
            "status" => format!("{:?}", a.status).cmp(&format!("{:?}", b.status)),
            "addedAt" => a.added_at.cmp(&b.added_at),
            _ => a.updated_at.cmp(&b.updated_at),
        };
        if desc {
            ord.reverse()
        } else {
            ord
        }
    });
}

fn unique_sorted<'a>(values: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = values
        .filter(|v| !v.trim().is_empty())
        .map(str::to_owned)
        .collect();
    out.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    out.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    out
}

fn library_path(data_dir: &Path) -> PathBuf {
    data_dir.join(LIBRARY_FILE)
}

fn load_index(data_dir: &Path) -> Result<LibraryIndex, AppError> {
    let path = library_path(data_dir);
    if !path.exists() {
        return Ok(LibraryIndex {
            schema_version: 1,
            updated_at: Utc::now().to_rfc3339(),
            tracks: Vec::new(),
        });
    }

    let bytes = fs::read(&path)
        .map_err(|err| AppError::Internal(format!("Failed to read library index: {err}")))?;
    let index: LibraryIndex = serde_json::from_slice(&bytes)
        .map_err(|err| AppError::Internal(format!("Invalid library index: {err}")))?;
    if index.schema_version != 1 {
        return Err(AppError::Internal(
            "Unsupported library schema version".into(),
        ));
    }
    Ok(index)
}

fn save_index(data_dir: &Path, index: &LibraryIndex) -> Result<(), AppError> {
    fs::create_dir_all(data_dir).map_err(|err| {
        AppError::Internal(format!("Failed to create data directory: {err}"))
    })?;
    let json = serde_json::to_string_pretty(index)
        .map_err(|err| AppError::Internal(format!("Failed to serialize library: {err}")))?;
    fs::write(library_path(data_dir), format!("{json}\n")).map_err(|err| {
        AppError::Internal(format!("Failed to write library index: {err}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn parse_artist_title_from_filename() {
        let parsed = parse_track_names("Daft Punk - Get Lucky.mp3");
        assert_eq!(parsed.artist, "Daft Punk");
        assert_eq!(parsed.title, "Get Lucky");
        assert_eq!(parsed.album, "Daft Punk");
    }

    #[test]
    fn status_progression() {
        let mut layers = LibraryTrackLayers::default();
        assert_eq!(
            compute_status(&layers, false, None),
            LibraryTrackStatus::Imported
        );

        layers.has_transcription = true;
        assert_eq!(
            compute_status(&layers, false, None),
            LibraryTrackStatus::Ready
        );

        layers.has_alignment = true;
        assert_eq!(
            compute_status(&layers, false, None),
            LibraryTrackStatus::KaraokeReady
        );

        assert_eq!(
            compute_status(&layers, true, None),
            LibraryTrackStatus::Processing
        );
        assert_eq!(
            compute_status(&layers, false, Some("boom")),
            LibraryTrackStatus::Failed
        );
    }

    #[test]
    fn upsert_and_list_tracks() {
        let root = std::env::temp_dir().join(format!("vocalis-library-{}", Uuid::new_v4()));
        let data_dir = root.join("data");
        let import_id = Uuid::new_v4().to_string();
        let import_path = data_dir.join("imports").join(&import_id);
        fs::create_dir_all(&import_path).unwrap();

        upsert_track(
            &data_dir,
            &UpsertLibraryTrackRequest {
                import_id: import_id.clone(),
                file_name: "Artist - Song.mp3".into(),
                source_path: Some("/tmp/song.mp3".into()),
                duration: 200.0,
                title: None,
                artist: None,
                album: None,
            },
        )
        .expect("upsert");

        let listed = list_tracks(
            &data_dir,
            &LibraryQuery {
                search: Some("song".into()),
                ..Default::default()
            },
        )
        .expect("list");
        assert_eq!(listed.total, 1);
        assert_eq!(listed.tracks[0].artist, "Artist");

        let _ = fs::remove_dir_all(root);
    }
}
