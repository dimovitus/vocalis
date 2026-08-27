import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, isLikelyMediaExtension, resolvePlaybackSource } from "./media";

describe("media helpers", () => {
  it("formats duration as m:ss", () => {
    expect(formatDuration(125.7)).toBe("2:05");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("—");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2_500_000)).toBe("2.38 MB");
  });

  it("detects common media extensions", () => {
    expect(isLikelyMediaExtension("song.mp3")).toBe(true);
    expect(isLikelyMediaExtension("clip.MP4")).toBe(true);
    expect(isLikelyMediaExtension("notes.txt")).toBe(false);
  });

  it("resolves playback path and duration from import result", () => {
    const source = resolvePlaybackSource({
      nativePlayback: { path: "/play.wav", duration: 200 },
      canonical: { path: "/canonical.wav", duration: 199 },
      playable: { duration: 198 },
    });
    expect(source.path).toBe("/play.wav");
    expect(source.duration).toBe(200);
  });
});
