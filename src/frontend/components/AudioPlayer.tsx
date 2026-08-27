import { useEffect, useRef, useState } from "react";
import type { WaveformData } from "../../shared/types";
import { formatDuration } from "../../core/domain/media";
import { ErrorBanner } from "./ErrorBanner";
import { usePlaybackStore } from "../stores/playback-store";

interface AudioPlayerProps {
  /** Compact PCM WAV path — required for O(1) native seek. */
  filePath: string;
  durationHint: number;
  waveform: WaveformData;
  title?: string;
}

export function AudioPlayer({
  filePath,
  durationHint,
  waveform,
  title,
}: AudioPlayerProps) {
  const open = usePlaybackStore((s) => s.open);
  const toggle = usePlaybackStore((s) => s.toggle);
  const seekRatio = usePlaybackStore((s) => s.seekRatio);
  const subscribeClock = usePlaybackStore((s) => s.subscribeClock);
  const playing = usePlaybackStore((s) => s.playing);
  const currentTime = usePlaybackStore((s) => s.position);
  const duration = usePlaybackStore((s) => s.duration);
  const busy = usePlaybackStore((s) => s.busy);
  const error = usePlaybackStore((s) => s.error);
  const clearError = usePlaybackStore((s) => s.clearError);

  useEffect(() => {
    void open(filePath, durationHint || waveform.duration || 0);
  }, [filePath, durationHint, waveform.duration, open]);

  useEffect(() => subscribeClock(), [subscribeClock]);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="audio-player">
      <div className="panel-header-row">
        <div>
          <h3>Preview Player</h3>
          <p className="muted">
            {title
              ? `“${title}” — native Rust playback (playback.wav)`
              : "Native Rust playback (playback.wav)"}
          </p>
        </div>
      </div>

      <WaveformView
        peaks={waveform.peaks}
        progress={progress}
        onSeek={(ratio) => void seekRatio(ratio)}
      />

      <div className="player-controls">
        <button
          type="button"
          className="primary"
          onClick={() => void toggle()}
          disabled={busy}
        >
          {busy ? "…" : playing ? "Pause" : "Play"}
        </button>
        <div className="player-time">
          <span>{formatDuration(currentTime)}</span>
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

/** Seek only on release — dragging must not spam native seek. */
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

interface WaveformViewProps {
  peaks: number[];
  progress: number;
  onSeek: (ratio: number) => void;
}

export function WaveformView({ peaks, progress, onSeek }: WaveformViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef(peaks);
  peaksRef.current = peaks;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 640;
      const height = canvas.clientHeight || 96;
      if (
        canvas.width !== Math.floor(width * dpr) ||
        canvas.height !== Math.floor(height * dpr)
      ) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(0, 0, width, height);

      const mid = height / 2;
      const currentPeaks = peaksRef.current;
      const count = Math.max(currentPeaks.length, 1);
      const barWidth = width / count;
      const progressIndex = progress * count;

      for (let i = 0; i < currentPeaks.length; i++) {
        const amp = Math.max(0.02, Math.min(1, currentPeaks[i] ?? 0));
        const barHeight = amp * (height * 0.86);
        const x = i * barWidth;
        const played = i <= progressIndex;
        ctx.fillStyle = played ? "#6ea8ff" : "rgba(110, 168, 255, 0.28)";
        ctx.fillRect(
          x,
          mid - barHeight / 2,
          Math.max(1, barWidth * 0.72),
          barHeight,
        );
      }

      ctx.strokeStyle = "rgba(237, 242, 255, 0.55)";
      ctx.beginPath();
      ctx.moveTo(progress * width, 0);
      ctx.lineTo(progress * width, height);
      ctx.stroke();
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [peaks, progress]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSeek(ratio);
      }}
    />
  );
}

export function EmptyWaveform() {
  return (
    <div className="waveform-placeholder">
      <div className="waveform-bars">
        {Array.from({ length: 48 }).map((_, i) => (
          <span
            key={i}
            style={{ height: `${18 + ((i * 17) % 62)}%`, opacity: 0.2 }}
          />
        ))}
      </div>
      <p className="muted">
        Import a track to generate a real waveform and enable playback.
      </p>
    </div>
  );
}
