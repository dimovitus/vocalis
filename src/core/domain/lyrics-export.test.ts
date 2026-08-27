import { describe, expect, it } from "vitest";
import { createLine, createWord } from "./lyrics";
import {
  exportLyrics,
  exportProjectJson,
  exportToLrc,
  exportToSrt,
  formatLrcTimestamp,
  formatSrtTimestamp,
} from "./lyrics-export";

const sampleDoc = {
  language: "en",
  lines: [
    createLine("Hello world", [
      createWord("Hello", 1.234, 1.8),
      createWord("world", 1.8, 2.567),
    ]),
    { ...createLine("Second line", []), start: 3, end: 4.5 },
  ],
};

describe("lyrics export", () => {
  it("formats LRC timestamps with centisecond precision", () => {
    expect(formatLrcTimestamp(0)).toBe("00:00.00");
    expect(formatLrcTimestamp(61.234)).toBe("01:01.23");
    expect(formatLrcTimestamp(1.234)).toBe("00:01.23");
  });

  it("exports enhanced LRC with word tags", () => {
    const lrc = exportToLrc(sampleDoc, {
      title: "Test",
      wordLevelLrc: true,
    });
    expect(lrc).toContain("[ti:Test]");
    expect(lrc).toContain("<00:01.23>Hello");
    expect(lrc).toContain("<00:01.80>world");
  });

  it("exports SRT cues with comma milliseconds", () => {
    const srt = exportToSrt(sampleDoc);
    expect(formatSrtTimestamp(1.234)).toBe("00:00:01,234");
    expect(srt).toContain("1\n");
    expect(srt).toContain("Hello world");
    expect(srt).toContain("-->");
  });

  it("exports JSON project state", () => {
    const json = exportProjectJson({
      importId: "00000000-0000-4000-8000-000000000001",
      fileName: "track.mp3",
      duration: 180,
      lyricsSource: "edited",
      document: sampleDoc,
      themeId: "neon",
      layers: { hasTranslation: true },
    });
    const parsed = JSON.parse(json) as {
      lyrics: { source: string };
      videoExport: { available: boolean; phase: number };
      theme: { id: string };
    };
    expect(parsed.lyrics.source).toBe("edited");
    expect(parsed.theme.id).toBe("neon");
    expect(parsed.videoExport.available).toBe(true);
    expect(parsed.videoExport.phase).toBe(25);
  });

  it("exports plain text without timestamps", () => {
    expect(exportLyrics("txt", sampleDoc)).toBe("Hello world\nSecond line");
  });
});
