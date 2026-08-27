import { useEffect, useMemo, useState } from "react";
import {
  formatLibraryDuration,
  LIBRARY_SORT_OPTIONS,
  LIBRARY_STATUS_LABELS,
  libraryStatusClass,
  type LibrarySortId,
} from "../../core/domain/music-library";
import type { LibraryTrack, LibraryTrackStatus } from "../../shared/types";
import { ErrorBanner } from "../components/ErrorBanner";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ContextMenu } from "../components/ContextMenu";
import { useAppStore } from "../stores/app-store";
import { useLibraryStore } from "../stores/library-store";

const STATUS_FILTERS: Array<{ id: LibraryTrackStatus | "all"; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "imported", label: LIBRARY_STATUS_LABELS.imported },
  { id: "processing", label: LIBRARY_STATUS_LABELS.processing },
  { id: "ready", label: LIBRARY_STATUS_LABELS.ready },
  { id: "karaokeReady", label: LIBRARY_STATUS_LABELS.karaokeReady },
  { id: "failed", label: LIBRARY_STATUS_LABELS.failed },
];

interface LibraryPageProps {
  onOpenTrack?: () => void;
}

export function LibraryPage({ onOpenTrack }: LibraryPageProps) {
  const { loadImportSession, importing } = useAppStore();
  const {
    inTauri,
    tracks,
    artists,
    albums,
    total,
    loading,
    error,
    query,
    groupBy,
    fetchTracks,
    setGroupBy,
    toggleFavorite,
    removeTrack,
    clearError,
  } = useLibraryStore();

  const [search, setSearch] = useState(query.search ?? "");
  const [favoritesOnly, setFavoritesOnly] = useState(Boolean(query.favoritesOnly));
  const [statusFilter, setStatusFilter] = useState<LibraryTrackStatus | "all">("all");
  const [sortBy, setSortBy] = useState<LibrarySortId>(
    (query.sortBy as LibrarySortId) ?? "updatedAt",
  );
  const [sortDesc, setSortDesc] = useState(query.sortDesc ?? true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    track: LibraryTrack;
  } | null>(null);

  useEffect(() => {
    if (inTauri) {
      void fetchTracks();
    }
  }, [inTauri, fetchTracks]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchTracks({
        search: search.trim() || undefined,
        favoritesOnly: favoritesOnly || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        sortBy,
        sortDesc,
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, favoritesOnly, statusFilter, sortBy, sortDesc, fetchTracks]);

  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "All tracks", items: tracks }];
    }

    const map = new Map<string, LibraryTrack[]>();
    for (const track of tracks) {
      const key = groupBy === "artist" ? track.artist : track.album;
      const bucket = map.get(key) ?? [];
      bucket.push(track);
      map.set(key, bucket);
    }

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
  }, [tracks, groupBy]);

  async function handleOpen(track: LibraryTrack) {
    clearError();
    await loadImportSession(track.importId);
    onOpenTrack?.();
  }

  return (
    <div className="library-page">
      <section className="panel">
        <div className="panel-header-row">
          <div>
            <h2>Library</h2>
            <p className="muted">
              {total} track{total === 1 ? "" : "s"} · {artists.length} artists ·{" "}
              {albums.length} albums
            </p>
          </div>
          <button type="button" disabled={loading} onClick={() => void fetchTracks()}>
            Refresh
          </button>
        </div>

        <div className="library-controls">
          <label className="editor-field library-search">
            <span>Search</span>
            <input
              type="search"
              placeholder="Title, artist, album…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="editor-field">
            <span>Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as LibrarySortId)}
            >
              {LIBRARY_SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="editor-field">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as LibraryTrackStatus | "all")
              }
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="editor-field">
            <span>Group by</span>
            <select
              value={groupBy}
              onChange={(e) =>
                setGroupBy(e.target.value as "none" | "artist" | "album")
              }
            >
              <option value="none">Flat list</option>
              <option value="artist">Artist</option>
              <option value="album">Album</option>
            </select>
          </label>

          <label className="export-checkbox">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
            />
            Favorites only
          </label>

          <label className="export-checkbox">
            <input
              type="checkbox"
              checked={sortDesc}
              onChange={(e) => setSortDesc(e.target.checked)}
            />
            Descending
          </label>
        </div>

        <ErrorBanner error={error} onDismiss={clearError} />

        {loading && tracks.length === 0 ? (
          <LoadingSpinner label="Loading library…" />
        ) : null}

        {!loading && tracks.length === 0 ? (
          <EmptyState
            title="Library is empty"
            description="Import a song from Pipeline — tracks appear here automatically with processing status."
          />
        ) : null}

        <div className="library-groups">
          {grouped.map((group) => (
            <div key={group.key} className="library-group">
              {groupBy !== "none" ? <h3 className="library-group-title">{group.key}</h3> : null}
              <div className="library-track-list">
                {group.items.map((track) => (
                  <article
                    key={track.importId}
                    className="library-track-card"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, track });
                    }}
                  >
                    <div className="library-track-main">
                      <button
                        type="button"
                        className="library-track-open"
                        disabled={importing}
                        onClick={() => void handleOpen(track)}
                      >
                        <strong>{track.title}</strong>
                        <span className="muted">
                          {track.artist} · {track.album}
                        </span>
                      </button>
                      <span className={libraryStatusClass(track.status)}>
                        {LIBRARY_STATUS_LABELS[track.status]}
                      </span>
                    </div>

                    <div className="library-track-meta muted">
                      <span>{formatLibraryDuration(track.duration)}</span>
                      <span>{track.fileName}</span>
                      {track.projectPath ? <span>Saved project</span> : null}
                    </div>

                    <div className="library-track-actions">
                      <button
                        type="button"
                        className={track.favorite ? "primary" : undefined}
                        onClick={() => void toggleFavorite(track.importId, !track.favorite)}
                        aria-label={track.favorite ? "Unfavorite" : "Favorite"}
                      >
                        {track.favorite ? "★" : "☆"}
                      </button>
                      <button
                        type="button"
                        disabled={importing}
                        onClick={() => void handleOpen(track)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeTrack(track.importId)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              id: "open",
              label: "Open track",
              disabled: importing,
              onSelect: () => void handleOpen(contextMenu.track),
            },
            {
              id: "favorite",
              label: contextMenu.track.favorite ? "Remove favorite" : "Add favorite",
              onSelect: () =>
                void toggleFavorite(
                  contextMenu.track.importId,
                  !contextMenu.track.favorite,
                ),
            },
            {
              id: "remove",
              label: "Remove from library",
              danger: true,
              onSelect: () => void removeTrack(contextMenu.track.importId),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
