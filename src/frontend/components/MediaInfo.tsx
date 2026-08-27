import type { MediaImportResult } from "../../shared/types";
import { formatBytes, formatDuration } from "../../core/domain/media";

function formatHz(rate?: number): string {
  if (rate == null) return "—";
  return `${rate.toLocaleString()} Hz`;
}

interface MediaInfoProps {
  result: MediaImportResult;
}

export function MediaInfo({ result }: MediaInfoProps) {
  const { source, canonical, format } = result;

  return (
    <div className="media-info">
      <div className="media-info-header">
        <div>
          <p className="eyebrow">Imported</p>
          <h3>{source.fileName}</h3>
        </div>
        <span className="pill ok">Ready</span>
      </div>

      <div className="media-grid">
        <InfoCard label="Duration" value={formatDuration(source.duration)} />
        <InfoCard label="Sample rate" value={formatHz(source.sampleRate)} />
        <InfoCard
          label="Channels"
          value={source.channels != null ? String(source.channels) : "—"}
        />
        <InfoCard label="Codec" value={source.codec ?? "—"} />
        <InfoCard label="Container" value={source.formatName ?? "—"} />
        <InfoCard label="Bitrate" value={source.bitRate ? `${Math.round(source.bitRate / 1000)} kbps` : "—"} />
        <InfoCard label="Size" value={formatBytes(source.fileSize)} />
        <InfoCard
          label="Streams"
          value={[
            source.hasAudio ? "audio" : null,
            source.hasVideo ? "video" : null,
          ]
            .filter(Boolean)
            .join(" + ") || "—"}
        />
      </div>

      <div className="canonical-block">
        <h4>Canonical processing asset</h4>
        <p className="muted">{format.description}</p>
        <ul className="meta-list">
          <li>
            <span>Path</span>
            <code>{canonical.path}</code>
          </li>
          <li>
            <span>Duration</span>
            <strong>{formatDuration(canonical.duration)}</strong>
          </li>
          <li>
            <span>Sample rate</span>
            <strong>{formatHz(canonical.sampleRate)}</strong>
          </li>
          <li>
            <span>Channels</span>
            <strong>{canonical.channels}</strong>
          </li>
          <li>
            <span>Codec</span>
            <strong>{canonical.codec ?? format.codec}</strong>
          </li>
          <li>
            <span>Size</span>
            <strong>{formatBytes(canonical.fileSize)}</strong>
          </li>
        </ul>
      </div>

      <div className="canonical-block">
        <h4>Playable preview</h4>
        <p className="muted">
          Compact MP3 for native Rust playback (WebView audio disabled — WebKitGTK freeze workaround)
        </p>
        <ul className="meta-list">
          <li>
            <span>URL</span>
            <code>{result.playableUrl || "—"}</code>
          </li>
          <li>
            <span>Path</span>
            <code>{result.playable.path}</code>
          </li>
          <li>
            <span>Duration</span>
            <strong>{formatDuration(result.playable.duration)}</strong>
          </li>
          <li>
            <span>Format</span>
            <strong>
              {result.playable.format ?? "mp3"} / {result.playable.codec ?? "mp3"}
            </strong>
          </li>
          <li>
            <span>Size</span>
            <strong>{formatBytes(result.playable.fileSize)}</strong>
          </li>
          <li>
            <span>Waveform peaks</span>
            <strong>{result.waveform.peakCount}</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-card">
      <span className="info-label">{label}</span>
      <strong className="info-value">{value}</strong>
    </div>
  );
}

