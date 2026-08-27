import { describe, expect, it } from "vitest";
import {
  formatLibraryDuration,
  LIBRARY_STATUS_LABELS,
  parseTrackNamesFromFileName,
} from "./music-library";

describe("music-library", () => {
  it("parses artist-title filenames", () => {
    const parsed = parseTrackNamesFromFileName("ABBA - Dancing Queen.flac");
    expect(parsed.artist).toBe("ABBA");
    expect(parsed.title).toBe("Dancing Queen");
  });

  it("formats duration", () => {
    expect(formatLibraryDuration(125)).toBe("2:05");
    expect(formatLibraryDuration(0)).toBe("—");
  });

  it("maps status labels", () => {
    expect(LIBRARY_STATUS_LABELS.karaokeReady).toBe("Karaoke Ready");
  });
});
