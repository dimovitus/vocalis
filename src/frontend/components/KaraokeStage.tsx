import { useMemo, type CSSProperties } from "react";
import type { KaraokeFrame, KaraokeMode } from "../../core/domain/karaoke";
import type { KaraokeTheme } from "../../core/domain/karaoke-themes";
import { themeToCssVars } from "../../core/domain/karaoke-themes";
import type { LyricsDocument } from "../../shared/types";

interface KaraokeStageProps {
  document: LyricsDocument | null;
  frame: KaraokeFrame | null;
  mode: KaraokeMode;
  theme: KaraokeTheme;
  subtitle?: string | null;
  emptyHint?: string;
}

export function KaraokeStage({
  document,
  frame,
  mode,
  theme,
  subtitle = null,
  emptyHint = "Import a track and run transcription to start karaoke.",
}: KaraokeStageProps) {
  const stageStyle = useMemo(
    () => themeToCssVars(theme) as CSSProperties,
    [theme],
  );

  const showContextLines = theme.visibleLines === 3;

  const prevText = useMemo(() => {
    if (!showContextLines || !document || frame?.previousLineIndex == null) {
      return null;
    }
    return document.lines[frame.previousLineIndex]?.text ?? null;
  }, [document, frame?.previousLineIndex, showContextLines]);

  const nextText = useMemo(() => {
    if (!showContextLines || !document || frame?.nextLineIndex == null) {
      return null;
    }
    return document.lines[frame.nextLineIndex]?.text ?? null;
  }, [document, frame?.nextLineIndex, showContextLines]);

  if (!document) {
    return (
      <div className="karaoke-stage karaoke-stage-empty" style={stageStyle}>
        <p className="muted">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div
      className={`karaoke-stage karaoke-stage-desktop${showContextLines ? "" : " karaoke-stage-single-line"}`}
      data-mode={mode}
      data-theme={theme.id}
      data-animation={theme.animation}
      data-progress-style={theme.progressStyle}
      data-text-align={theme.textAlign}
      style={stageStyle}
    >
      {showContextLines ? (
        <div className="karaoke-prev" aria-hidden>
          {prevText ?? "\u00a0"}
        </div>
      ) : null}

      <div
        className={`karaoke-current${frame?.lineActive ? " is-active" : ""}`}
        aria-live="polite"
      >
        {mode === "line" ? (
          <p className="karaoke-line-text">
            {frame?.lineActive ? frame.line?.text : "·"}
          </p>
        ) : null}

        {mode === "word" ? (
          <p className="karaoke-line-text karaoke-words">
            {frame?.lineActive && frame.words.length > 0
              ? frame.words.map((w) => (
                  <span
                    key={`${w.index}-${w.start}`}
                    className={`karaoke-word is-${w.state}`}
                  >
                    {w.text}
                  </span>
                ))
              : frame?.lineActive
                ? frame.line?.text
                : "·"}
          </p>
        ) : null}

        {mode === "progressive" ? (
          <div className="karaoke-progressive">
            <p className="karaoke-line-text">
              {frame?.lineActive && frame.words.length > 0
                ? frame.words.map((w) => (
                    <span
                      key={`${w.index}-${w.start}`}
                      className="karaoke-word-progressive"
                      style={
                        {
                          "--word-progress": String(w.progress),
                        } as CSSProperties
                      }
                    >
                      <span className="karaoke-word-base">{w.text}</span>
                      <span
                        className="karaoke-word-fill"
                        style={{ width: `${w.progress * 100}%` }}
                      >
                        {w.text}
                      </span>
                    </span>
                  ))
                : frame?.lineActive
                  ? frame.line?.text
                  : "·"}
            </p>
            <pre className="karaoke-meter" aria-hidden>
              {frame?.lineActive ? frame.progressiveMeter : "░".repeat(17)}
            </pre>
          </div>
        ) : null}
        {subtitle ? <p className="karaoke-subtitle">{subtitle}</p> : null}
      </div>

      {showContextLines ? (
        <div className="karaoke-next" aria-hidden>
          {nextText ?? "\u00a0"}
        </div>
      ) : null}
    </div>
  );
}
