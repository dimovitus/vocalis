import { useState } from "react";
import type { TranslationMode, TranslationResult } from "../../shared/types";

const TARGET_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
];

const MODES: { id: TranslationMode; label: string; hint: string }[] = [
  { id: "literal", label: "Literal", hint: "Closest to source wording" },
  { id: "natural", label: "Natural", hint: "Readable phrasing" },
  { id: "singable", label: "Singable", hint: "Shorter, karaoke-friendly" },
];

interface TranslationPanelProps {
  importId: string;
  result: TranslationResult | null;
  loading: boolean;
  canTranslate: boolean;
  sourceLanguage?: string | null;
  onTranslate: (targetLanguage: string, mode: TranslationMode) => void;
}

export function TranslationPanel({
  importId,
  result,
  loading,
  canTranslate,
  sourceLanguage,
  onTranslate,
}: TranslationPanelProps) {
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [mode, setMode] = useState<TranslationMode>("natural");

  return (
    <div className="translation-panel">
      <div className="panel-header-row">
        <div>
          <h3>Lyrics Translation</h3>
          <p className="muted">
            argos-translate layer — saved as <code>translation.json</code> (import{" "}
            {importId.slice(0, 8)}…). Separate from transcription / alignment.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={loading || !canTranslate}
          onClick={() => onTranslate(targetLanguage, mode)}
        >
          {loading ? "Translating…" : "Translate lyrics"}
        </button>
      </div>

      <div className="translation-controls">
        <label className="editor-field">
          <span>Source</span>
          <input type="text" value={sourceLanguage ?? "auto"} readOnly />
        </label>
        <label className="editor-field">
          <span>Target</span>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
          >
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label} ({lang.code})
              </option>
            ))}
          </select>
        </label>
        <div className="translation-modes" role="radiogroup" aria-label="Translation mode">
          {MODES.map((m) => (
            <label key={m.id} className="translation-mode-option">
              <input
                type="radio"
                name="translation-mode"
                value={m.id}
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
              />
              <span>{m.label}</span>
              <span className="muted">{m.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="alert info">
          Running offline translation (Argos). First run may download language packs.
          Transliteration is generated for CJK source lyrics when available.
        </div>
      ) : null}

      {result ? (
        <div className="translation-result">
          <div className="transcription-meta">
            <span>
              <strong>Engine</strong> {result.engine}
            </span>
            <span>
              <strong>Route</strong> {result.sourceLanguage} → {result.targetLanguage}
            </span>
            <span>
              <strong>Mode</strong> {result.mode}
            </span>
            <span>
              <strong>Lines</strong> {result.lines.length}
            </span>
          </div>
          <ul className="segment-list">
            {result.lines.map((line) => (
              <li key={line.lineIndex} className="segment-item">
                <div className="segment-time">line {line.lineIndex + 1}</div>
                <div className="segment-text">{line.original}</div>
                <div className="translation-line-target">{line.translation}</div>
                {line.transliteration ? (
                  <div className="muted">{line.transliteration}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : !loading ? (
        <p className="muted">
          {canTranslate
            ? "Translate after lyrics exist. Results merge into edited_lyrics when saved."
            : "Transcribe or align first, then translate."}
        </p>
      ) : null}
    </div>
  );
}
