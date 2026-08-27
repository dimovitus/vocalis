export type KaraokeThemeId =
  | "minimal"
  | "neon"
  | "cinema"
  | "retro"
  | "anime"
  | "k-pop"
  | "classic";

export type KaraokeTextAlign = "left" | "center" | "right";

export type KaraokeProgressStyle = "fill" | "color" | "glow";

export type KaraokeAnimation = "none" | "pulse" | "fade" | "bounce";

/** Data-driven karaoke visual theme — applied via CSS variables on the stage root. */
export interface KaraokeTheme {
  id: KaraokeThemeId;
  name: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  textShadow: string;
  glow: string;
  textAlign: KaraokeTextAlign;
  lineGap: string;
  /** 1 = current line only; 3 = prev / current / next */
  visibleLines: 1 | 3;
  stageBackground: string;
  stageBorder: string;
  textColor: string;
  mutedColor: string;
  activeWordColor: string;
  sungWordColor: string;
  upcomingWordOpacity: number;
  subtitleColor: string;
  meterColor: string;
  progressFillColor: string;
  progressStyle: KaraokeProgressStyle;
  animation: KaraokeAnimation;
  animationDuration: string;
  prevNextOpacity: number;
}

export type KaraokeThemeCssVars = Record<string, string>;

export const KARAOKE_THEMES: KaraokeTheme[] = [
  {
    id: "minimal",
    name: "Minimal",
    fontFamily: '"Segoe UI", Inter, system-ui, sans-serif',
    fontSize: "clamp(1.6rem, 2.8vw, 2.2rem)",
    fontWeight: 600,
    textShadow: "none",
    glow: "none",
    textAlign: "center",
    lineGap: "24px",
    visibleLines: 3,
    stageBackground: "rgba(18, 23, 34, 0.94)",
    stageBorder: "1px solid var(--border)",
    textColor: "#edf2ff",
    mutedColor: "#9aa7c0",
    activeWordColor: "#6ea8ff",
    sungWordColor: "#edf2ff",
    upcomingWordOpacity: 0.35,
    subtitleColor: "#9aa7c0",
    meterColor: "#6ea8ff",
    progressFillColor: "#6ea8ff",
    progressStyle: "fill",
    animation: "none",
    animationDuration: "0ms",
    prevNextOpacity: 0.42,
  },
  {
    id: "neon",
    name: "Neon",
    fontFamily: '"Orbitron", "Segoe UI", sans-serif',
    fontSize: "clamp(1.7rem, 3vw, 2.45rem)",
    fontWeight: 700,
    textShadow: "0 0 12px rgba(0, 255, 255, 0.35)",
    glow: "0 0 18px rgba(255, 0, 200, 0.55), 0 0 36px rgba(0, 255, 255, 0.25)",
    textAlign: "center",
    lineGap: "32px",
    visibleLines: 3,
    stageBackground:
      "radial-gradient(ellipse at 50% 0%, rgba(255, 0, 200, 0.12), transparent 55%), #07040f",
    stageBorder: "1px solid rgba(0, 255, 255, 0.35)",
    textColor: "#f5fbff",
    mutedColor: "#7fdcff",
    activeWordColor: "#00ffff",
    sungWordColor: "#ff3dff",
    upcomingWordOpacity: 0.28,
    subtitleColor: "#7fdcff",
    meterColor: "#00ffff",
    progressFillColor: "#ff3dff",
    progressStyle: "glow",
    animation: "pulse",
    animationDuration: "1.4s",
    prevNextOpacity: 0.35,
  },
  {
    id: "cinema",
    name: "Cinema",
    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
    fontSize: "clamp(1.85rem, 3.2vw, 2.6rem)",
    fontWeight: 650,
    textShadow: "0 2px 18px rgba(0, 0, 0, 0.65)",
    glow: "0 0 24px rgba(212, 175, 55, 0.18)",
    textAlign: "center",
    lineGap: "36px",
    visibleLines: 3,
    stageBackground:
      "linear-gradient(180deg, rgba(8, 8, 10, 0.98) 0%, rgba(18, 14, 10, 0.96) 100%)",
    stageBorder: "1px solid rgba(212, 175, 55, 0.25)",
    textColor: "#f7f0df",
    mutedColor: "#a89878",
    activeWordColor: "#d4af37",
    sungWordColor: "#f7f0df",
    upcomingWordOpacity: 0.38,
    subtitleColor: "#c9b896",
    meterColor: "#d4af37",
    progressFillColor: "#d4af37",
    progressStyle: "color",
    animation: "fade",
    animationDuration: "2s",
    prevNextOpacity: 0.45,
  },
  {
    id: "retro",
    name: "Retro",
    fontFamily: '"Courier New", "Lucida Console", monospace',
    fontSize: "clamp(1.55rem, 2.6vw, 2.1rem)",
    fontWeight: 700,
    textShadow: "0 0 8px rgba(57, 255, 20, 0.45)",
    glow: "0 0 14px rgba(57, 255, 20, 0.35)",
    textAlign: "center",
    lineGap: "28px",
    visibleLines: 3,
    stageBackground:
      "repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px), #0a1208",
    stageBorder: "1px solid rgba(57, 255, 20, 0.35)",
    textColor: "#b8ffb0",
    mutedColor: "#4caf50",
    activeWordColor: "#39ff14",
    sungWordColor: "#d4ffc8",
    upcomingWordOpacity: 0.3,
    subtitleColor: "#6bdc63",
    meterColor: "#39ff14",
    progressFillColor: "#39ff14",
    progressStyle: "fill",
    animation: "none",
    animationDuration: "0ms",
    prevNextOpacity: 0.4,
  },
  {
    id: "anime",
    name: "Anime",
    fontFamily: '"Trebuchet MS", "Arial Rounded MT Bold", "Segoe UI", sans-serif',
    fontSize: "clamp(1.75rem, 3.1vw, 2.5rem)",
    fontWeight: 800,
    textShadow: "0 2px 0 rgba(255, 255, 255, 0.15)",
    glow: "0 0 20px rgba(255, 105, 180, 0.55), 0 0 32px rgba(64, 196, 255, 0.35)",
    textAlign: "center",
    lineGap: "30px",
    visibleLines: 3,
    stageBackground:
      "radial-gradient(circle at 20% 20%, rgba(255, 105, 180, 0.14), transparent 45%), radial-gradient(circle at 80% 30%, rgba(64, 196, 255, 0.12), transparent 40%), #12101f",
    stageBorder: "1px solid rgba(255, 105, 180, 0.35)",
    textColor: "#fff5fb",
    mutedColor: "#c9b8ff",
    activeWordColor: "#ff69b4",
    sungWordColor: "#ffffff",
    upcomingWordOpacity: 0.32,
    subtitleColor: "#40c4ff",
    meterColor: "#ff69b4",
    progressFillColor: "#40c4ff",
    progressStyle: "glow",
    animation: "bounce",
    animationDuration: "1.1s",
    prevNextOpacity: 0.38,
  },
  {
    id: "k-pop",
    name: "K-Pop",
    fontFamily: '"Montserrat", "Segoe UI", sans-serif',
    fontSize: "clamp(1.8rem, 3.3vw, 2.55rem)",
    fontWeight: 800,
    textShadow: "0 3px 16px rgba(0, 0, 0, 0.35)",
    glow: "0 0 22px rgba(255, 46, 151, 0.45)",
    textAlign: "center",
    lineGap: "34px",
    visibleLines: 3,
    stageBackground:
      "linear-gradient(135deg, rgba(255, 46, 151, 0.18), rgba(106, 90, 255, 0.18)), #0d0a18",
    stageBorder: "1px solid rgba(255, 46, 151, 0.4)",
    textColor: "#ffffff",
    mutedColor: "#c4b8ff",
    activeWordColor: "#ff2e97",
    sungWordColor: "#f5f0ff",
    upcomingWordOpacity: 0.34,
    subtitleColor: "#9d8cff",
    meterColor: "#ff2e97",
    progressFillColor: "#6a5aff",
    progressStyle: "glow",
    animation: "pulse",
    animationDuration: "1.2s",
    prevNextOpacity: 0.4,
  },
  {
    id: "classic",
    name: "Classic",
    fontFamily: '"Georgia", "Times New Roman", serif',
    fontSize: "clamp(1.65rem, 2.9vw, 2.35rem)",
    fontWeight: 700,
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
    glow: "none",
    textAlign: "center",
    lineGap: "26px",
    visibleLines: 1,
    stageBackground: "linear-gradient(180deg, #0a1630 0%, #061022 100%)",
    stageBorder: "1px solid #2a4a7a",
    textColor: "#ffffff",
    mutedColor: "#8eb4e8",
    activeWordColor: "#ffe066",
    sungWordColor: "#ffffff",
    upcomingWordOpacity: 0.4,
    subtitleColor: "#8eb4e8",
    meterColor: "#ffe066",
    progressFillColor: "#ffe066",
    progressStyle: "color",
    animation: "none",
    animationDuration: "0ms",
    prevNextOpacity: 0.5,
  },
];

const THEME_MAP = new Map(KARAOKE_THEMES.map((theme) => [theme.id, theme]));

export const DEFAULT_KARAOKE_THEME_ID: KaraokeThemeId = "minimal";

export function getKaraokeTheme(id: KaraokeThemeId): KaraokeTheme {
  return THEME_MAP.get(id) ?? THEME_MAP.get(DEFAULT_KARAOKE_THEME_ID)!;
}

/** Map theme record → CSS custom properties for the stage root. */
export function themeToCssVars(theme: KaraokeTheme): KaraokeThemeCssVars {
  return {
    "--karaoke-font-family": theme.fontFamily,
    "--karaoke-font-size": theme.fontSize,
    "--karaoke-font-weight": String(theme.fontWeight),
    "--karaoke-text-shadow": theme.textShadow,
    "--karaoke-glow": theme.glow,
    "--karaoke-text-align": theme.textAlign,
    "--karaoke-line-gap": theme.lineGap,
    "--karaoke-stage-bg": theme.stageBackground,
    "--karaoke-stage-border": theme.stageBorder,
    "--karaoke-text-color": theme.textColor,
    "--karaoke-muted-color": theme.mutedColor,
    "--karaoke-active-color": theme.activeWordColor,
    "--karaoke-sung-color": theme.sungWordColor,
    "--karaoke-upcoming-opacity": String(theme.upcomingWordOpacity),
    "--karaoke-subtitle-color": theme.subtitleColor,
    "--karaoke-meter-color": theme.meterColor,
    "--karaoke-progress-fill": theme.progressFillColor,
    "--karaoke-prev-opacity": String(theme.prevNextOpacity),
    "--karaoke-animation-duration": theme.animationDuration,
  };
}

export function listKaraokeThemes(): KaraokeTheme[] {
  return [...KARAOKE_THEMES];
}
