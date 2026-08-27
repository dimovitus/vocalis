//! Native audio preview player (rodio).
//!
//! WebKitGTK freezes on HTML5 / asset:// / even localhost media in this environment.
//! Playback is therefore handled entirely in Rust; the UI only sends IPC commands.
//!
//! `OutputStream` is `!Send`, so the device lives on a dedicated player thread.
//! `NativePlayer` is a thin `Send + Sync` handle over a command channel.
//!
//! Seeking uses byte-accurate PCM WAV offsets. Never use rodio `skip_duration` on MP3 —
//! it decodes every sample up to the seek point and freezes the audio/IPC thread.

use crate::error::AppError;
use rodio::{OutputStream, OutputStreamHandle, Sink, Source};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use super::wav::inspect_wav;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStatus {
    pub loaded: bool,
    pub playing: bool,
    pub position: f64,
    pub duration: f64,
    pub path: Option<String>,
    pub volume: f32,
}

enum PlayerCommand {
    Open {
        path: PathBuf,
        duration: f64,
        reply: SyncSender<Result<(), String>>,
    },
    Play {
        reply: SyncSender<Result<(), String>>,
    },
    Pause {
        reply: SyncSender<Result<(), String>>,
    },
    Seek {
        position: f64,
        reply: SyncSender<Result<(), String>>,
    },
    Stop {
        reply: SyncSender<Result<(), String>>,
    },
    SetVolume {
        volume: f32,
        reply: SyncSender<Result<(), String>>,
    },
}

#[derive(Debug, Clone)]
struct SharedClock {
    loaded: bool,
    playing: bool,
    duration: f64,
    path: Option<String>,
    anchor_position: f64,
    playing_since: Option<Instant>,
    volume: f32,
}

impl SharedClock {
    fn idle() -> Self {
        Self {
            loaded: false,
            playing: false,
            duration: 0.0,
            path: None,
            anchor_position: 0.0,
            playing_since: None,
            volume: 1.0,
        }
    }

    fn to_status(&self) -> PlayerStatus {
        let mut position = self.anchor_position;
        if let Some(since) = self.playing_since {
            position += since.elapsed().as_secs_f64();
        }
        if self.duration > 0.0 {
            position = position.clamp(0.0, self.duration);
        }
        PlayerStatus {
            loaded: self.loaded,
            playing: self.playing,
            position,
            duration: self.duration,
            path: self.path.clone(),
            volume: self.volume,
        }
    }
}

/// Send + Sync handle to the native player thread.
pub struct NativePlayer {
    tx: Mutex<Sender<PlayerCommand>>,
    clock: Arc<Mutex<SharedClock>>,
}

struct PlayerInner {
    sink: Option<Sink>,
    path: Option<PathBuf>,
    duration: f64,
    /// Absolute timeline position at the last play/pause/seek boundary.
    anchor_position: f64,
    /// When set, player is actively advancing from `anchor_position`.
    playing_since: Option<Instant>,
    /// True when sink exists but is paused (resume without re-decode).
    sink_paused: bool,
    volume: f32,
}

impl NativePlayer {
    pub fn try_new() -> Result<Self, AppError> {
        let (tx, rx) = mpsc::channel::<PlayerCommand>();
        let clock = Arc::new(Mutex::new(SharedClock::idle()));
        let clock_thread = Arc::clone(&clock);
        let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        thread::Builder::new()
            .name("vocalis-audio".into())
            .spawn(move || {
                let result = OutputStream::try_default()
                    .map_err(|err| format!("Audio output device unavailable: {err}"));
                match result {
                    Ok((stream, handle)) => {
                        let _ = ready_tx.send(Ok(()));
                        run_player_loop(stream, handle, rx, clock_thread);
                    }
                    Err(err) => {
                        let _ = ready_tx.send(Err(err));
                    }
                }
            })
            .map_err(|err| AppError::Internal(format!("Failed to start audio thread: {err}")))?;

        ready_rx
            .recv()
            .map_err(|_| AppError::Internal("Audio thread died during startup".into()))?
            .map_err(AppError::Environment)?;

        Ok(Self {
            tx: Mutex::new(tx),
            clock,
        })
    }

    pub fn open(&self, path: &Path, duration: f64) -> Result<(), AppError> {
        self.call(|reply| PlayerCommand::Open {
            path: path.to_path_buf(),
            duration,
            reply,
        })
    }

    pub fn play(&self) -> Result<(), AppError> {
        self.call(|reply| PlayerCommand::Play { reply })
    }

    pub fn pause(&self) -> Result<(), AppError> {
        self.call(|reply| PlayerCommand::Pause { reply })
    }

    pub fn seek(&self, position_secs: f64) -> Result<(), AppError> {
        self.call(|reply| PlayerCommand::Seek {
            position: position_secs,
            reply,
        })
    }

    pub fn stop(&self) -> Result<(), AppError> {
        self.call(|reply| PlayerCommand::Stop { reply })
    }

    pub fn set_volume(&self, volume: f32) -> Result<(), AppError> {
        self.call(|reply| PlayerCommand::SetVolume {
            volume: volume.clamp(0.0, 1.0),
            reply,
        })
    }

    /// Non-blocking status from the shared clock (UI polls this every ~100ms).
    pub fn status(&self) -> Result<PlayerStatus, AppError> {
        let clock = self
            .clock
            .lock()
            .map_err(|_| AppError::Internal("Player clock lock poisoned".into()))?;
        Ok(clock.to_status())
    }

    fn call(
        &self,
        make: impl FnOnce(SyncSender<Result<(), String>>) -> PlayerCommand,
    ) -> Result<(), AppError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.send(make(reply_tx))?;
        reply_rx
            .recv()
            .map_err(|_| AppError::Internal("Audio thread did not reply".into()))?
            .map_err(AppError::Media)
    }

    fn send(&self, cmd: PlayerCommand) -> Result<(), AppError> {
        let tx = self
            .tx
            .lock()
            .map_err(|_| AppError::Internal("Player channel lock poisoned".into()))?;
        tx.send(cmd)
            .map_err(|_| AppError::Internal("Audio thread is not running".into()))
    }
}

fn run_player_loop(
    _stream: OutputStream,
    handle: OutputStreamHandle,
    rx: Receiver<PlayerCommand>,
    clock: Arc<Mutex<SharedClock>>,
) {
    let mut inner = PlayerInner {
        sink: None,
        path: None,
        duration: 0.0,
        anchor_position: 0.0,
        playing_since: None,
        sink_paused: false,
        volume: 1.0,
    };

    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(cmd) => match cmd {
                PlayerCommand::Open {
                    path,
                    duration,
                    reply,
                } => {
                    let result = open_track(&mut inner, &path, duration);
                    publish_clock(&clock, &inner);
                    let _ = reply.send(result);
                }
                PlayerCommand::Play { reply } => {
                    let result = play_track(&handle, &mut inner);
                    publish_clock(&clock, &inner);
                    let _ = reply.send(result);
                }
                PlayerCommand::Pause { reply } => {
                    let result = pause_track(&mut inner);
                    publish_clock(&clock, &inner);
                    let _ = reply.send(result);
                }
                PlayerCommand::Seek { position, reply } => {
                    let result = seek_track(&handle, &mut inner, position);
                    publish_clock(&clock, &inner);
                    let _ = reply.send(result);
                }
                PlayerCommand::Stop { reply } => {
                    let result = stop_track(&mut inner);
                    publish_clock(&clock, &inner);
                    let _ = reply.send(result);
                }
                PlayerCommand::SetVolume { volume, reply } => {
                    inner.volume = volume.clamp(0.0, 1.0);
                    if let Some(sink) = inner.sink.as_ref() {
                        sink.set_volume(inner.volume);
                    }
                    publish_clock(&clock, &inner);
                    let _ = reply.send(Ok(()));
                }
            },
            Err(RecvTimeoutError::Timeout) => maybe_finish_playback(&mut inner, &clock),
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn maybe_finish_playback(inner: &mut PlayerInner, clock: &Arc<Mutex<SharedClock>>) {
    if inner.playing_since.is_none() {
        return;
    }
    let position = compute_position(inner);
    let at_end = inner.duration > 0.0 && position >= inner.duration - 0.05;
    let sink_done = inner.sink.as_ref().map(|s| s.empty()).unwrap_or(false);
    if at_end || (sink_done && position > 0.05) {
        if let Some(sink) = inner.sink.take() {
            sink.stop();
        }
        inner.anchor_position = inner.duration;
        inner.playing_since = None;
        inner.sink_paused = false;
        publish_clock(clock, inner);
    }
}

fn publish_clock(clock: &Arc<Mutex<SharedClock>>, inner: &PlayerInner) {
    if let Ok(mut guard) = clock.lock() {
        *guard = SharedClock {
            loaded: inner.path.is_some(),
            playing: inner.playing_since.is_some(),
            duration: inner.duration,
            path: inner
                .path
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned()),
            anchor_position: inner.anchor_position,
            playing_since: inner.playing_since,
            volume: inner.volume,
        };
    }
}

fn open_track(inner: &mut PlayerInner, path: &Path, duration: f64) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Preview file not found: {}", path.display()));
    }

    // Prefer WAV — byte seek is O(1). MP3 via skip_duration freezes for long seeks.
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "wav" {
        return Err(format!(
            "Native player expects canonical WAV (got .{ext}). Re-import the track."
        ));
    }

    // Validate WAV header early.
    let info = inspect_wav(path).map_err(|err| err.to_string())?;
    let wav_duration = info.duration_secs();

    if let Some(sink) = inner.sink.take() {
        sink.stop();
    }

    inner.path = Some(path.to_path_buf());
    inner.duration = if duration > 0.0 {
        duration
    } else {
        wav_duration
    };
    inner.anchor_position = 0.0;
    inner.playing_since = None;
    inner.sink = None;
    inner.sink_paused = false;
    Ok(())
}

fn play_track(handle: &OutputStreamHandle, inner: &mut PlayerInner) -> Result<(), String> {
    let path = inner
        .path
        .clone()
        .ok_or_else(|| "No preview loaded".to_string())?;

    // Fast path: resume paused sink without re-opening the file.
    if inner.sink_paused {
        if let Some(sink) = inner.sink.as_ref() {
            sink.play();
            inner.sink_paused = false;
            inner.playing_since = Some(Instant::now());
            return Ok(());
        }
    }

    let mut position = compute_position(inner);
    if position >= inner.duration && inner.duration > 0.0 {
        position = 0.0;
        inner.anchor_position = 0.0;
    }

    start_sink(handle, inner, &path, position, true)?;
    inner.anchor_position = position;
    inner.playing_since = Some(Instant::now());
    inner.sink_paused = false;
    Ok(())
}

fn pause_track(inner: &mut PlayerInner) -> Result<(), String> {
    let position = compute_position(inner);
    if let Some(sink) = inner.sink.as_ref() {
        sink.pause();
        inner.sink_paused = true;
    }
    inner.anchor_position = position;
    inner.playing_since = None;
    Ok(())
}

fn seek_track(
    handle: &OutputStreamHandle,
    inner: &mut PlayerInner,
    position_secs: f64,
) -> Result<(), String> {
    let path = inner
        .path
        .clone()
        .ok_or_else(|| "No preview loaded".to_string())?;

    let should_play = inner.playing_since.is_some();
    let duration = inner.duration;
    let position = position_secs.clamp(0.0, duration.max(0.0));

    start_sink(handle, inner, &path, position, should_play)?;
    inner.anchor_position = position;
    if should_play {
        inner.playing_since = Some(Instant::now());
        inner.sink_paused = false;
    } else {
        inner.playing_since = None;
        inner.sink_paused = inner.sink.is_some();
    }
    Ok(())
}

fn stop_track(inner: &mut PlayerInner) -> Result<(), String> {
    if let Some(sink) = inner.sink.take() {
        sink.stop();
    }
    inner.anchor_position = 0.0;
    inner.playing_since = None;
    inner.sink_paused = false;
    Ok(())
}

fn compute_position(inner: &PlayerInner) -> f64 {
    let mut position = inner.anchor_position;
    if let Some(since) = inner.playing_since {
        position += since.elapsed().as_secs_f64();
    }
    if inner.duration > 0.0 {
        position = position.clamp(0.0, inner.duration);
    }
    position
}

fn start_sink(
    handle: &OutputStreamHandle,
    inner: &mut PlayerInner,
    path: &Path,
    position: f64,
    play: bool,
) -> Result<(), String> {
    if let Some(old) = inner.sink.take() {
        old.stop();
    }
    inner.sink_paused = false;

    let source = open_wav_source(path, position)?;
    let sink = Sink::try_new(handle)
        .map_err(|err| format!("Failed to create audio sink: {err}"))?;
    sink.append(source);
    sink.set_volume(inner.volume);
    if play {
        sink.play();
    } else {
        sink.pause();
        inner.sink_paused = true;
    }
    inner.sink = Some(sink);
    Ok(())
}

/// Stream PCM s16le WAV from an absolute timeline offset (byte seek, no decode skip).
fn open_wav_source(path: &Path, position_secs: f64) -> Result<Pcm16WavSource, String> {
    let info = inspect_wav(path).map_err(|err| err.to_string())?;
    let fmt = info.format;
    let frames_to_skip = (position_secs.max(0.0) * f64::from(fmt.sample_rate)).floor() as u64;
    let total_frames = info.frame_count();
    let start_frame = frames_to_skip.min(total_frames);
    let remaining_frames = total_frames.saturating_sub(start_frame);
    let byte_offset = info.data_offset + start_frame * u64::from(fmt.block_align);
    let remaining_bytes = remaining_frames * u64::from(fmt.block_align);

    let mut file = File::open(path).map_err(|err| format!("Failed to open WAV: {err}"))?;
    file.seek(SeekFrom::Start(byte_offset))
        .map_err(|err| format!("WAV seek failed: {err}"))?;

    Ok(Pcm16WavSource {
        reader: BufReader::with_capacity(64 * 1024, file),
        channels: fmt.channels,
        sample_rate: fmt.sample_rate,
        remaining_bytes,
        buffer: Vec::new(),
        buffer_pos: 0,
    })
}

/// Streaming i16 LE PCM source for rodio (chunked reads, no huge size_hint).
struct Pcm16WavSource {
    reader: BufReader<File>,
    channels: u16,
    sample_rate: u32,
    remaining_bytes: u64,
    buffer: Vec<u8>,
    buffer_pos: usize,
}

impl Iterator for Pcm16WavSource {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        if self.remaining_bytes < 2 {
            return None;
        }

        if self.buffer_pos + 2 > self.buffer.len() {
            let to_read = std::cmp::min(self.remaining_bytes, 16 * 1024) as usize;
            // Align to 2 bytes.
            let to_read = to_read & !1;
            if to_read < 2 {
                return None;
            }
            self.buffer.resize(to_read, 0);
            if self.reader.read_exact(&mut self.buffer).is_err() {
                self.remaining_bytes = 0;
                return None;
            }
            self.buffer_pos = 0;
        }

        let sample = i16::from_le_bytes([
            self.buffer[self.buffer_pos],
            self.buffer[self.buffer_pos + 1],
        ]);
        self.buffer_pos += 2;
        self.remaining_bytes -= 2;
        Some(f32::from(sample) / 32768.0)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        // Never advertise tens of millions of samples — some rodio paths
        // treat an exact upper bound as a cue to buffer aggressively.
        (0, None)
    }
}

impl Source for Pcm16WavSource {
    fn current_frame_len(&self) -> Option<usize> {
        Some(1024)
    }

    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}
