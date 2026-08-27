/** Phase 25 — FFmpeg video karaoke export (ASS burn-in + audio mux). */

import type { KaraokeTheme, KaraokeThemeId } from "./karaoke-themes";
import { getKaraokeTheme } from "./karaoke-themes";
import type { LyricsDocument, LyricsLine } from "../../shared/types";
import type {
  ExportKaraokeVideoRequest,
  ExportKaraokeVideoResult,
} from "../../shared/types";
import {
  formatAssTimestamp,
  type LyricsExportOptions,
} from "./lyrics-export";

export type VideoExportStatus =
  | "queued"
  | "rendering"
  | "completed"
  | "failed";

export interface VideoExportPreset {
  id: "720p" | "1080p" | "4k";
  label: string;
  width: number;
  height: number;
}

export const VIDEO_EXPORT_PRESETS: VideoExportPreset[] = [
  { id: "720p", label: "720p (1280×720)", width: 1280, height: 720 },
  { id: "1080p", label: "1080p (1920×1080)", width: 1920, height: 1080 },
  { id: "4k", label: "4K (3840×2160)", width: 3840, height: 2160 },
];

export const VIDEO_FPS_OPTIONS = [24, 30, 60] as const;

export type VideoFps = (typeof VIDEO_FPS_OPTIONS)[number];

export interface VideoExportCapabilities {
  available: true;
  phase: 25;
  supportedContainers: string[];
  supportedCodecs: string[];
  presets: VideoExportPreset[];
  fpsOptions: number[];
  note: string;
}

export interface VideoExportAssOptions extends LyricsExportOptions {
  width: number;
  height: number;
  themeId?: KaraokeThemeId;
  theme?: KaraokeTheme;
}

export type { ExportKaraokeVideoRequest, ExportKaraokeVideoResult };

export function describeVideoExportCapabilities(): VideoExportCapabilities {
  return {
    available: true,
    phase: 25,
    supportedContainers: ["mp4"],
    supportedCodecs: ["h264", "aac"],
    presets: VIDEO_EXPORT_PRESETS,
    fpsOptions: [...VIDEO_FPS_OPTIONS],
    note: "Renders timed karaoke ASS subtitles over a theme background via FFmpeg.",
  };
}

export function getVideoPreset(id: VideoExportPreset["id"]): VideoExportPreset {
  return VIDEO_EXPORT_PRESETS.find((p) => p.id === id) ?? VIDEO_EXPORT_PRESETS[1];
}

/** Extract #RRGGBB for FFmpeg lavfi color (falls back to Vocalis dark). */
export function themeBackgroundForVideo(theme: KaraokeTheme): string {
  const bg = theme.stageBackground.trim();
  if (bg.startsWith("#")) {
    return bg.slice(0, 7);
  }
  const rgba = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgba) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
    return `#${hex(rgba[1])}${hex(rgba[2])}${hex(rgba[3])}`;
  }
  return "#0b0d12";
}

function hexToAssColor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "&H00FFFFFF";
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function assEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

function themeFontName(theme: KaraokeTheme): string {
  const match = theme.fontFamily.match(/"([^"]+)"/);
  if (match) return match[1];
  const first = theme.fontFamily.split(",")[0]?.trim();
  return first?.replace(/['"]/g, "") || "Arial";
}

function scaledFontSize(theme: KaraokeTheme, height: number): number {
  const base = Number.parseFloat(theme.fontSize.replace(/[^\d.]/g, "")) || 48;
  return Math.max(28, Math.round((base * height) / 720));
}

function buildKaraokeAssHeader(
  theme: KaraokeTheme,
  width: number,
  height: number,
  title?: string,
): string {
  const font = themeFontName(theme);
  const size = scaledFontSize(theme, height);
  const primary = hexToAssColor(theme.textColor);
  const secondary = hexToAssColor(theme.activeWordColor);
  const outline = hexToAssColor("#000000");
  const back = "&H64000000";

  const header = `[Script Info]
Title: ${title ? assEscape(title) : "Vocalis Karaoke"}
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${font},${size},${primary},${secondary},${outline},${back},${theme.fontWeight >= 600 ? 1 : 0},0,0,0,100,100,0,0,1,2,1,2,40,40,${Math.round(height * 0.12)},1
Style: Translation,${font},${Math.max(22, Math.round(size * 0.55))},${hexToAssColor(theme.subtitleColor)},${hexToAssColor(theme.subtitleColor)},${outline},${back},0,0,0,0,100,100,0,0,1,1,0,2,40,40,${Math.round(height * 0.06)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  return header;
}

function buildKaraokeLineText(line: LyricsLine): string {
  const words = line.words.filter((w) => w.text.trim());
  if (words.length === 0) {
    return assEscape(line.text.trim());
  }

  return words
    .map((word) => {
      const durationCs = Math.max(
        1,
        Math.round(Math.max(0.01, word.end - word.start) * 100),
      );
      return `{\\k${durationCs}}${assEscape(word.text.trim())}`;
    })
    .join(" ");
}

/** ASS with \\k karaoke tags for word-level fill animation. */
export function exportKaraokeAss(
  document: LyricsDocument,
  options: VideoExportAssOptions,
): string {
  const theme =
    options.theme ??
    getKaraokeTheme(options.themeId ?? "minimal");
  const includeTranslation = options.includeTranslation ?? true;

  const events: string[] = [
    buildKaraokeAssHeader(theme, options.width, options.height, options.title),
  ];

  for (const line of document.lines) {
    const primary = line.text.trim();
    if (!primary) continue;
    const end = Math.max(line.end, line.start + 0.05);
    events.push(
      `Dialogue: 0,${formatAssTimestamp(line.start)},${formatAssTimestamp(end)},Karaoke,,0,0,0,,${buildKaraokeLineText(line)}`,
    );

    if (includeTranslation && line.translation?.trim()) {
      events.push(
        `Dialogue: 0,${formatAssTimestamp(line.start)},${formatAssTimestamp(end)},Translation,,0,0,0,,${assEscape(line.translation.trim())}`,
      );
    }
  }

  return `${events.join("\n")}\n`;
}

export function buildVideoExportRequest(input: {
  importId: string;
  outputPath: string;
  document: LyricsDocument;
  width: number;
  height: number;
  fps: number;
  duration: number;
  themeId: KaraokeThemeId;
  title?: string;
  includeTranslation?: boolean;
  backgroundPath?: string;
}): ExportKaraokeVideoRequest {
  const theme = getKaraokeTheme(input.themeId);
  const assContents = exportKaraokeAss(input.document, {
    width: input.width,
    height: input.height,
    theme,
    title: input.title,
    includeTranslation: input.includeTranslation,
  });

  return {
    importId: input.importId,
    outputPath: input.outputPath,
    assContents,
    width: input.width,
    height: input.height,
    fps: input.fps,
    duration: input.duration,
    backgroundPath: input.backgroundPath,
    backgroundColor: themeBackgroundForVideo(theme),
  };
}
