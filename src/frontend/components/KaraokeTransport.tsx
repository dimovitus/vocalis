import { useEffect, useState } from "react";
import type { WaveformData } from "../../shared/types";
import { formatDuration } from "../../core/domain/media";
import { WaveformView } from "./AudioPlayer";
import { ErrorBanner } from "./ErrorBanner";
import { usePlaybackStore } from "../stores/playback-store";

interface KaraokeTransportProps {
  waveform: WaveformData;
  title?: string;
}

/** Desktop transport: waveform + play/pause + time (shared native clock). */
export function KaraokeTransport({ waveform, title }: KaraokeTransportProps) {
  const playing = usePlaybackStore((s) => s.playing);
  const position = usePlaybackStore((s) => s.position);
  const duration = usePlaybackStore((s) => s.duration);
  const busy = usePlaybackStore((s) => s.busy);
  const error = usePlaybackStore((s) => s.error);
  const clearError = usePlaybackStore((s) => s.clearError);
  const toggle = usePlaybackStore((s) => s.toggle);
  const seekRatio = usePlaybackStore((s) => s.seekRatio);

  const progress = duration > 0 ? position / duration : 0;

  return (
    <div className="karaoke-transport">
      {title ? <p className="karaoke-track-title muted">{title}</p> : null}

      <WaveformView
        peaks={waveform.peaks}
        progress={progress}
        onSeek={(ratio) => void seekRatio(ratio)}
      />

      <div className="karaoke-transport-row">
        <button
          type="button"
          className="primary karaoke-play"
          onClick={() => void toggle()}
          disabled={busy || duration <= 0}
          aria-label={playing ? "Pause" : "Play"}
        >
          {busy ? "…" : playing ? "Pause" : "Play"}
        </button>

        <div className="player-time karaoke-time">
          <span>{formatDuration(position)}</span>
          <span className="muted">/</span>
          <span>{formatDuration(duration)}</span>
        </div>

        <SeekSlider
          progress={progress}
          disabled={busy || duration <= 0}
          onSeek={(ratio) => void seekRatio(ratio)}
        />
      </div>

      <ErrorBanner error={error} onDismiss={clearError} />
    </div>
  );
}

interface SeekSliderProps {
  progress: number;
  disabled: boolean;
  onSeek: (ratio: number) => void;
}

function SeekSlider({ progress, disabled, onSeek }: SeekSliderProps) {
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState(progress);

  useEffect(() => {
    if (!dragging) setDraft(progress);
  }, [progress, dragging]);

  const value = dragging ? draft : progress;

  return (
    <input
      className="seek-slider"
      type="range"
      min={0}
      max={1000}
      disabled={disabled}
      value={Math.round(value * 1000)}
      onPointerDown={() => setDragging(true)}
      onPointerUp={(e) => {
        setDragging(false);
        onSeek(Number(e.currentTarget.value) / 1000);
      }}
      onChange={(e) => setDraft(Number(e.target.value) / 1000)}
      aria-label="Seek"
    />
  );
}
