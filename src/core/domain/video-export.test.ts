import { describe, expect, it } from "vitest";
import { getKaraokeTheme } from "./karaoke-themes";
import type { LyricsDocument } from "../../shared/types";
import {
  buildVideoExportRequest,
  describeVideoExportCapabilities,
  exportKaraokeAss,
  getVideoPreset,
  themeBackgroundForVideo,
  VIDEO_EXPORT_PRESETS,
} from "./video-export";

const sampleDoc: LyricsDocument = {
  language: "en",
  lines: [
    {
      text: "Hello world",
      start: 1,
      end: 3,
      words: [
        { text: "Hello", start: 1, end: 1.5, confidence: 0.9 },
        { text: "world", start: 1.5, end: 2.8, confidence: 0.9 },
      ],
      translation: "Hola mundo",
    },
  ],
};

describe("video-export", () => {
  it("describes available capabilities", () => {
    const caps = describeVideoExportCapabilities();
    expect(caps.available).toBe(true);
    expect(caps.presets).toEqual(VIDEO_EXPORT_PRESETS);
  });

  it("builds karaoke ASS with PlayRes and \\k tags", () => {
    const ass = exportKaraokeAss(sampleDoc, {
      width: 1920,
      height: 1080,
      theme: getKaraokeTheme("neon"),
      title: "Test Song",
    });

    expect(ass).toContain("PlayResX: 1920");
    expect(ass).toContain("PlayResY: 1080");
    expect(ass).toContain("{\\k50}Hello");
    expect(ass).toContain("Style: Karaoke");
    expect(ass).toContain("Hola mundo");
  });

  it("extracts background color from theme", () => {
    const theme = getKaraokeTheme("minimal");
    expect(themeBackgroundForVideo(theme)).toMatch(/^#/);
  });

  it("builds IPC request payload", () => {
    const req = buildVideoExportRequest({
      importId: "00000000-0000-4000-8000-000000000001",
      outputPath: "/tmp/out.mp4",
      document: sampleDoc,
      width: getVideoPreset("1080p").width,
      height: getVideoPreset("1080p").height,
      fps: 30,
      duration: 180,
      themeId: "minimal",
      title: "Track",
    });

    expect(req.assContents).toContain("Dialogue:");
    expect(req.backgroundColor).toMatch(/^#/);
    expect(req.fps).toBe(30);
  });
});
