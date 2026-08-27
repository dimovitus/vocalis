import type { LayerStatus } from "../../shared/types";

interface StatusBadgeProps {
  label: string;
  ok: boolean;
  detail?: string;
}

export function StatusBadge({ label, ok, detail }: StatusBadgeProps) {
  return (
    <div className={`status-badge ${ok ? "ok" : "error"}`}>
      <span className="status-dot" />
      <div>
        <strong>{label}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
    </div>
  );
}

interface LayerListProps {
  layers: LayerStatus[];
}

export function LayerList({ layers }: LayerListProps) {
  return (
    <ul className="layer-list">
      {layers.map((layer) => (
        <li key={layer.name}>
          <span className="layer-name">{layer.name}</span>
          <span className={`layer-status ${layer.status}`}>{layer.status}</span>
          <span className="layer-latency">{layer.latencyMs} ms</span>
        </li>
      ))}
    </ul>
  );
}
