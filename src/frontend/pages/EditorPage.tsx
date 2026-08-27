import { useEffect, useMemo, useState } from "react";
import {
  buildEditableDocument,
  cloneDocument,
  mergeWithNext,
  setLineSection,
  setLineTranslation,
  setWordEndFromPlayhead,
  setWordStartFromPlayhead,
  shiftLineTiming,
  splitLine,
  updateLineText,
  updateLineTiming,
  updateWordText,
  updateWordTiming,
} from "../../core/domain/lyrics-editor";
import { formatDuration, resolvePlaybackSource } from "../../core/domain/media";
import type { LyricsDocument } from "../../shared/types";
import { EmptyState } from "../components/EmptyState";
import { ContextMenu, type ContextMenuItem } from "../components/ContextMenu";
import { Tooltip } from "../components/Tooltip";
import { useUndoStack } from "../hooks/useUndoStack";
import { isTypingTarget } from "../services/app-commands";
import { useAppStore } from "../stores/app-store";
import { usePlaybackStore } from "../stores/playback-store";

const SECTION_OPTIONS = [
  "",
  "Intro",
  "Verse",
  "Pre-Chorus",
  "Chorus",
  "Post-Chorus",
  "Bridge",
  "Hook",
  "Rap",
  "Instrumental",
  "Outro",
];

export function EditorPage() {
  const importResult = useAppStore((s) => s.importResult);
  const transcription = useAppStore((s) => s.transcription);
  const alignment = useAppStore((s) => s.alignment);
  const correction = useAppStore((s) => s.correction);
  const structure = useAppStore((s) => s.structure);
  const editedLyrics = useAppStore((s) => s.editedLyrics);
  const saving = useAppStore((s) => s.savingLyrics);
  const resyncing = useAppStore((s) => s.resyncing);
  const lastResyncStats = useAppStore((s) => s.lastResyncStats);
  const saveEdited = useAppStore((s) => s.saveEditedDocument);
  const runAiResync = useAppStore((s) => s.runAiResync);
  const runTranslation = useAppStore((s) => s.runTranslation);
  const translating = useAppStore((s) => s.translating);

  const position = usePlaybackStore((s) => s.position);
  const open = usePlaybackStore((s) => s.open);
  const subscribeClock = usePlaybackStore((s) => s.subscribeClock);

  const baseline = useMemo(
    () =>
      buildEditableDocument({
        edited: editedLyrics,
        correction,
        alignment,
        transcription,
        structureLineLabels: structure?.lineLabels,
      }),
    [editedLyrics, correction, alignment, transcription, structure],
  );

  const {
    present: document,
    push,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  } = useUndoStack<LyricsDocument | null>(null);

  const [selectedLine, setSelectedLine] = useState(0);
  const [translateTarget, setTranslateTarget] = useState("en");
  const [translateMode, setTranslateMode] = useState<"literal" | "natural" | "singable">("natural");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    lineIndex: number;
  } | null>(null);

  useEffect(() => {
    if (baseline?.document) {
      reset(cloneDocument(baseline.document));
      setSelectedLine(0);
    } else {
      reset(null);
    }
  }, [importResult?.id, baseline, reset]);

  useEffect(() => {
    return subscribeClock();
  }, [subscribeClock]);

  useEffect(() => {
    if (!importResult) return;
    const { path, duration } = resolvePlaybackSource(importResult);
    void open(path, duration);
  }, [importResult, open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (!importResult) {
    return (
      <section className="editor-page panel">
        <EmptyState
          title="No track loaded"
          description="Import a song in Pipeline to edit lyrics, timings, and translations."
        />
      </section>
    );
  }

  if (!document || document.lines.length === 0) {
    return (
      <section className="editor-page panel">
        <EmptyState
          title="No lyrics yet"
          description="Run Transcribe (and Align) in Pipeline before editing word timings here."
        />
      </section>
    );
  }

  const line = document.lines[selectedLine];
  const busy = saving || resyncing || translating;

  function patch(next: LyricsDocument) {
    push(cloneDocument(next));
  }

  function lineContextItems(lineIndex: number): ContextMenuItem[] {
    const target = document!.lines[lineIndex];
    return [
      {
        id: "split",
        label: "Split line (first word)",
        disabled: target.words.length < 2,
        onSelect: () => patch(splitLine(document!, lineIndex, 0)),
      },
      {
        id: "merge",
        label: "Merge with next line",
        disabled: lineIndex >= document!.lines.length - 1,
        onSelect: () => patch(mergeWithNext(document!, lineIndex)),
      },
      {
        id: "shift-back",
        label: "Shift timing −0.25s",
        onSelect: () => patch(shiftLineTiming(document!, lineIndex, -0.25)),
      },
      {
        id: "shift-forward",
        label: "Shift timing +0.25s",
        onSelect: () => patch(shiftLineTiming(document!, lineIndex, 0.25)),
      },
    ];
  }

  return (
    <section className="editor-page">
      <div className="editor-toolbar panel">
        <div>
          <h2>Lyrics Editor</h2>
          <p className="muted">
            {baseline?.source ?? "—"} · {document.lines.length} lines · playhead{" "}
            {formatDuration(position)}
            {lastResyncStats ? (
              <>
                {" · "}
                resync: {lastResyncStats.wordsUpdated} words updated,{" "}
                {lastResyncStats.wordsKept} kept (≥
                {(lastResyncStats.minConfidence * 100).toFixed(0)}% conf.)
              </>
            ) : null}
          </p>
        </div>
        <div className="editor-toolbar-actions">
          <Tooltip label="Undo edit" shortcut="Ctrl+Z">
            <button type="button" disabled={!canUndo || busy} onClick={undo}>
              Undo
            </button>
          </Tooltip>
          <Tooltip label="Redo edit" shortcut="Ctrl+Y">
            <button type="button" disabled={!canRedo || busy} onClick={redo}>
              Redo
            </button>
          </Tooltip>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void saveEdited(document)}
          >
            {saving ? "Saving…" : "Save edits"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAiResync(document)}
            title="Re-align edited lyrics against audio (stable-ts forced alignment)"
          >
            {resyncing ? "AI RESYNC…" : "AI RESYNC"}
          </button>
          <label className="editor-inline-select">
            <span className="sr-only">Translation target</span>
            <select
              value={translateTarget}
              disabled={busy}
              onChange={(e) => setTranslateTarget(e.target.value)}
            >
              <option value="en">→ EN</option>
              <option value="ru">→ RU</option>
              <option value="ja">→ JA</option>
              <option value="ko">→ KO</option>
              <option value="zh">→ ZH</option>
            </select>
          </label>
          <select
            className="editor-inline-select"
            value={translateMode}
            disabled={busy}
            onChange={(e) =>
              setTranslateMode(e.target.value as "literal" | "natural" | "singable")
            }
          >
            <option value="literal">Literal</option>
            <option value="natural">Natural</option>
            <option value="singable">Singable</option>
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void saveEdited(document).then(() =>
                runTranslation(translateTarget, translateMode),
              )
            }
          >
            {translating ? "Translating…" : "Translate"}
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <aside className="editor-line-list panel">
          <h3>Lines</h3>
          <p className="muted editor-hint">Right-click a line for actions</p>
          <ul className="editor-lines">
            {document.lines.map((l, idx) => (
              <li key={`${l.start}-${idx}`}>
                <button
                  type="button"
                  className={idx === selectedLine ? "primary" : undefined}
                  onClick={() => setSelectedLine(idx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedLine(idx);
                    setContextMenu({ x: e.clientX, y: e.clientY, lineIndex: idx });
                  }}
                >
                  <span className="editor-line-time">
                    {formatDuration(l.start)}
                  </span>
                  <span className="editor-line-preview">
                    {l.section ? `[${l.section}] ` : ""}
                    {l.text.slice(0, 48)}
                    {l.text.length > 48 ? "…" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {line ? (
          <div className="editor-detail panel">
            <div className="editor-detail-header">
              <h3>Line {selectedLine + 1}</h3>
              <div className="editor-line-actions">
                <button
                  type="button"
                  disabled={selectedLine >= document.lines.length - 1}
                  onClick={() => patch(mergeWithNext(document, selectedLine))}
                >
                  Merge next
                </button>
                <button
                  type="button"
                  onClick={() => patch(shiftLineTiming(document, selectedLine, -0.25))}
                >
                  −0.25s
                </button>
                <button
                  type="button"
                  onClick={() => patch(shiftLineTiming(document, selectedLine, 0.25))}
                >
                  +0.25s
                </button>
              </div>
            </div>

            <label className="editor-field">
              <span>Section</span>
              <select
                value={line.section ?? ""}
                onChange={(e) =>
                  patch(
                    setLineSection(
                      document,
                      selectedLine,
                      e.target.value || null,
                    ),
                  )
                }
              >
                {SECTION_OPTIONS.map((opt) => (
                  <option key={opt || "none"} value={opt}>
                    {opt || "—"}
                  </option>
                ))}
              </select>
            </label>

            <label className="editor-field">
              <span>Line text</span>
              <textarea
                rows={2}
                value={line.text}
                onChange={(e) =>
                  patch(updateLineText(document, selectedLine, e.target.value))
                }
              />
            </label>

            <div className="editor-timing-row">
              <label className="editor-field">
                <span>Start</span>
                <input
                  type="number"
                  step={0.01}
                  value={line.start}
                  onChange={(e) =>
                    patch(
                      updateLineTiming(
                        document,
                        selectedLine,
                        Number(e.target.value),
                        line.end,
                      ),
                    )
                  }
                />
              </label>
              <label className="editor-field">
                <span>End</span>
                <input
                  type="number"
                  step={0.01}
                  value={line.end}
                  onChange={(e) =>
                    patch(
                      updateLineTiming(
                        document,
                        selectedLine,
                        line.start,
                        Number(e.target.value),
                      ),
                    )
                  }
                />
              </label>
            </div>

            <label className="editor-field">
              <span>Translation</span>
              <input
                type="text"
                value={line.translation ?? ""}
                placeholder="Optional translation"
                onChange={(e) =>
                  patch(
                    setLineTranslation(
                      document,
                      selectedLine,
                      e.target.value || null,
                    ),
                  )
                }
              />
            </label>

            <label className="editor-field">
              <span>Transliteration</span>
              <input
                type="text"
                value={line.transliteration ?? ""}
                placeholder="Optional transliteration"
                onChange={(e) =>
                  patch(
                    setLineTranslation(
                      document,
                      selectedLine,
                      line.translation ?? null,
                      e.target.value || null,
                    ),
                  )
                }
              />
            </label>

            <h4>Words</h4>
            {line.words.length === 0 ? (
              <p className="muted">
                No word timestamps — run Align in Pipeline for word-level editing.
              </p>
            ) : (
              <ul className="editor-words">
                {line.words.map((word, wIdx) => (
                  <li key={`${word.start}-${wIdx}`} className="editor-word-row">
                    <input
                      className="editor-word-text"
                      value={word.text}
                      onChange={(e) =>
                        patch(
                          updateWordText(
                            document,
                            selectedLine,
                            wIdx,
                            e.target.value,
                          ),
                        )
                      }
                    />
                    <input
                      type="number"
                      step={0.01}
                      className="editor-word-time"
                      value={word.start}
                      onChange={(e) =>
                        patch(
                          updateWordTiming(
                            document,
                            selectedLine,
                            wIdx,
                            Number(e.target.value),
                            word.end,
                          ),
                        )
                      }
                    />
                    <input
                      type="number"
                      step={0.01}
                      className="editor-word-time"
                      value={word.end}
                      onChange={(e) =>
                        patch(
                          updateWordTiming(
                            document,
                            selectedLine,
                            wIdx,
                            word.start,
                            Number(e.target.value),
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      title="Set start from playhead"
                      onClick={() =>
                        patch(
                          setWordStartFromPlayhead(
                            document,
                            selectedLine,
                            wIdx,
                            position,
                          ),
                        )
                      }
                    >
                      ⊏
                    </button>
                    <button
                      type="button"
                      title="Set end from playhead"
                      onClick={() =>
                        patch(
                          setWordEndFromPlayhead(
                            document,
                            selectedLine,
                            wIdx,
                            position,
                          ),
                        )
                      }
                    >
                      ⊐
                    </button>
                    <button
                      type="button"
                      title="Split line after this word"
                      disabled={wIdx >= line.words.length - 1}
                      onClick={() => {
                        patch(splitLine(document, selectedLine, wIdx));
                        setSelectedLine(selectedLine + 1);
                      }}
                    >
                      Split
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={lineContextItems(contextMenu.lineIndex)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </section>
  );
}
