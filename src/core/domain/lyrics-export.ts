import type { KaraokeThemeId } from "./karaoke-themes";
import type { LyricsDocument, LyricsLine } from "../../shared/types";
import { describeVideoExportCapabilities } from "./video-export";

export type LyricsExportFormat = "txt" | "lrc" | "srt" | "vtt" | "ass" | "json";

export interface LyricsExportOptions {
  title?: string;
  artist?: string;
  /** Enhanced LRC word tags when word timestamps exist. */
  wordLevelLrc?: boolean;
  /** Include translation as secondary line in subtitle formats. */
  includeTranslation?: boolean;
}

export interface ProjectExportInput {
  importId: string;
  fileName?: string;
  duration?: number;
  lyricsSource: string;
  document: LyricsDocument;
  themeId?: KaraokeThemeId;
  layers?: Record<string, unknown>;
}

const ASS_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

/** LRC uses centiseconds (2 digits) — max precision for the format. */
export function formatLrcTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const centiseconds = Math.round(clamped * 100);
  const minutes = Math.floor(centiseconds / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const ms = Math.round(clamped * 1000);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

export function formatVttTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const ms = Math.round(clamped * 1000);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function formatAssTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const cs = Math.round(clamped * 100);
  const hours = Math.floor(cs / 360_000);
  const minutes = Math.floor((cs % 360_000) / 6000);
  const secs = Math.floor((cs % 6000) / 100);
  const centis = cs % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

function lineBlock(
  line: LyricsLine,
  includeTranslation: boolean,
): { primary: string; secondary?: string } {
  const primary = line.text.trim();
  const secondary = includeTranslation && line.translation?.trim()
    ? line.translation.trim()
    : undefined;
  return { primary, secondary };
}

export function exportToTxt(document: LyricsDocument): string {
  return document.lines.map((line) => line.text.trim()).filter(Boolean).join("\n");
}

export function exportToLrc(
  document: LyricsDocument,
  options: LyricsExportOptions = {},
): string {
  const lines: string[] = [];
  if (options.title) {
    lines.push(`[ti:${options.title}]`);
  }
  if (options.artist) {
    lines.push(`[ar:${options.artist}]`);
  }
  if (document.language) {
    lines.push(`[lang:${document.language}]`);
  }
  lines.push(`[by:Vocalis AI]`);

  for (const line of document.lines) {
    const text = line.text.trim();
    if (!text) continue;

    if (options.wordLevelLrc && line.words.length > 0) {
      const wordTags = line.words
        .map((word) => {
          const token = word.text.trim();
          if (!token) return "";
          return `<${formatLrcTimestamp(word.start)}>${token}`;
        })
        .filter(Boolean)
        .join(" ");
      lines.push(`[${formatLrcTimestamp(line.start)}]${wordTags || text}`);
    } else {
      lines.push(`[${formatLrcTimestamp(line.start)}]${text}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function exportToSrt(
  document: LyricsDocument,
  options: LyricsExportOptions = {},
): string {
  const cues: string[] = [];
  let index = 1;

  for (const line of document.lines) {
    const { primary, secondary } = lineBlock(line, options.includeTranslation ?? false);
    if (!primary) continue;
    const end = Math.max(line.end, line.start + 0.01);
    cues.push(String(index));
    cues.push(
      `${formatSrtTimestamp(line.start)} --> ${formatSrtTimestamp(end)}`,
    );
    cues.push(secondary ? `${primary}\n${secondary}` : primary);
    cues.push("");
    index += 1;
  }

  return `${cues.join("\n")}\n`;
}

export function exportToVtt(
  document: LyricsDocument,
  options: LyricsExportOptions = {},
): string {
  const cues: string[] = ["WEBVTT", ""];

  for (const line of document.lines) {
    const { primary, secondary } = lineBlock(line, options.includeTranslation ?? false);
    if (!primary) continue;
    const end = Math.max(line.end, line.start + 0.01);
    cues.push(`${formatVttTimestamp(line.start)} --> ${formatVttTimestamp(end)}`);
    cues.push(secondary ? `${primary}\n${secondary}` : primary);
    cues.push("");
  }

  return `${cues.join("\n")}\n`;
}

export function exportToAss(
  document: LyricsDocument,
  options: LyricsExportOptions = {},
): string {
  const events: string[] = [ASS_HEADER];

  for (const line of document.lines) {
    const { primary, secondary } = lineBlock(line, options.includeTranslation ?? false);
    if (!primary) continue;
    const end = Math.max(line.end, line.start + 0.01);
    const text = secondary
      ? `${escapeAss(primary)}\\N${escapeAss(secondary)}`
      : escapeAss(primary);
    events.push(
      `Dialogue: 0,${formatAssTimestamp(line.start)},${formatAssTimestamp(end)},Default,,0,0,0,,${text}`,
    );
  }

  return `${events.join("\n")}\n`;
}

export function exportProjectJson(input: ProjectExportInput): string {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "Vocalis AI",
    import: {
      id: input.importId,
      fileName: input.fileName,
      duration: input.duration,
    },
    lyrics: {
      source: input.lyricsSource,
      language: input.document.language,
      lines: input.document.lines,
    },
    theme: input.themeId ? { id: input.themeId } : null,
    layers: input.layers ?? {},
    videoExport: describeVideoExportCapabilities(),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function exportLyrics(
  format: LyricsExportFormat,
  document: LyricsDocument,
  options: LyricsExportOptions = {},
  project?: ProjectExportInput,
): string {
  switch (format) {
    case "txt":
      return exportToTxt(document);
    case "lrc":
      return exportToLrc(document, options);
    case "srt":
      return exportToSrt(document, options);
    case "vtt":
      return exportToVtt(document, options);
    case "ass":
      return exportToAss(document, options);
    case "json":
      if (!project) {
        throw new Error("JSON export requires project metadata");
      }
      return exportProjectJson(project);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported export format: ${exhaustive}`);
    }
  }
}

export const EXPORT_FORMAT_META: Record<
  LyricsExportFormat,
  { label: string; extension: string; mime: string }
> = {
  txt: { label: "Plain text", extension: "txt", mime: "text/plain" },
  lrc: { label: "LRC", extension: "lrc", mime: "application/x-lrc" },
  srt: { label: "SubRip SRT", extension: "srt", mime: "application/x-subrip" },
  vtt: { label: "WebVTT", extension: "vtt", mime: "text/vtt" },
  ass: { label: "ASS/SSA", extension: "ass", mime: "text/plain" },
  json: { label: "Project JSON", extension: "json", mime: "application/json" },
};

export function defaultExportFileName(
  baseName: string,
  format: LyricsExportFormat,
): string {
  const stem = baseName.replace(/\.[^.]+$/, "").replace(/[^\w\-+. ]+/g, "_");
  return `${stem || "lyrics"}.${EXPORT_FORMAT_META[format].extension}`;
}
