import { describe, expect, it } from "vitest";
import {
  DEFAULT_KARAOKE_THEME_ID,
  getKaraokeTheme,
  KARAOKE_THEMES,
  themeToCssVars,
} from "./karaoke-themes";

describe("karaoke themes", () => {
  it("includes all seven preset themes", () => {
    const ids = KARAOKE_THEMES.map((t) => t.id);
    expect(ids).toEqual([
      "minimal",
      "neon",
      "cinema",
      "retro",
      "anime",
      "k-pop",
      "classic",
    ]);
  });

  it("falls back to minimal for unknown id", () => {
    expect(getKaraokeTheme("unknown" as "minimal").id).toBe(DEFAULT_KARAOKE_THEME_ID);
  });

  it("maps theme to CSS variables", () => {
    const theme = getKaraokeTheme("neon");
    const vars = themeToCssVars(theme);
    expect(vars["--karaoke-active-color"]).toBe(theme.activeWordColor);
    expect(vars["--karaoke-font-family"]).toContain("Orbitron");
    expect(vars["--karaoke-text-align"]).toBe("center");
  });
});
