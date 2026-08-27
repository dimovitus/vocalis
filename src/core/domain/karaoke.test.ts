import { describe, expect, it } from "vitest";
import {
  buildProgressiveMeter,
  computeLineProgress,
  findActiveLineIndex,
  resolveKaraokeDocument,
  resolveKaraokeFrame,
  wordProgress,
} from "./karaoke";
import { createLine, createWord } from "./lyrics";

const sampleDoc = {
  language: "en",
  lines: [
    createLine("I see trees of green", [
      createWord("I", 1.0, 1.2),
      createWord("see", 1.2, 1.5),
      createWord("trees", 1.5, 2.0),
      createWord("of", 2.0, 2.2),
      createWord("green", 2.2, 2.8),
    ]),
    createLine("Red roses too", [
      createWord("Red", 3.0, 3.4),
      createWord("roses", 3.4, 3.9),
      createWord("too", 3.9, 4.3),
    ]),
  ],
};

describe("karaoke engine", () => {
  it("finds active line from real timestamps", () => {
    expect(findActiveLineIndex(sampleDoc.lines, 0.5)).toBeNull();
    expect(findActiveLineIndex(sampleDoc.lines, 1.6)).toBe(0);
    expect(findActiveLineIndex(sampleDoc.lines, 3.5)).toBe(1);
  });

  it("computes word progress from timestamps", () => {
    const word = createWord("trees", 1.5, 2.0);
    expect(wordProgress(word, 1.4)).toBe(0);
    expect(wordProgress(word, 1.75)).toBeCloseTo(0.5);
    expect(wordProgress(word, 2.1)).toBe(1);
  });

  it("line mode activates whole line window", () => {
    const frame = resolveKaraokeFrame(sampleDoc, 1.7, "line", "alignment");
    expect(frame.lineActive).toBe(true);
    expect(frame.line?.text).toBe("I see trees of green");
    expect(frame.previousLineIndex).toBeNull();
    expect(frame.nextLineIndex).toBe(1);
  });

  it("word mode marks sung / active / upcoming from clock", () => {
    const frame = resolveKaraokeFrame(sampleDoc, 1.7, "word");
    expect(frame.words.map((w) => w.state)).toEqual([
      "sung",
      "sung",
      "active",
      "upcoming",
      "upcoming",
    ]);
    expect(frame.words[2]?.progress).toBeCloseTo(0.4);
  });

  it("progressive mode builds meter from word timing", () => {
    const mid = resolveKaraokeFrame(sampleDoc, 1.7, "progressive");
    expect(mid.lineProgress).toBeGreaterThan(0.3);
    expect(mid.lineProgress).toBeLessThan(0.7);
    expect(mid.progressiveMeter).toMatch(/^[█░]+$/);
    expect(mid.progressiveMeter.length).toBe(17);

    expect(computeLineProgress(sampleDoc.lines[0]!, 2.8)).toBe(1);
    expect(buildProgressiveMeter(1, 10)).toBe("██████████");
  });

  it("resolves lyrics priority edited > correction > alignment > transcription", () => {
    const resolved = resolveKaraokeDocument({
      edited: {
        language: "en",
        lines: [
          {
            text: "edited",
            start: 0,
            end: 1,
            words: [{ text: "edited", start: 0, end: 1, confidence: 1 }],
          },
        ],
      },
      correction: {
        engine: "whisper-context",
        lines: [
          {
            text: "corrected",
            start: 0,
            end: 1,
            words: [{ text: "corrected", start: 0, end: 1, confidence: 1 }],
          },
        ],
        changes: [],
        raw: {},
      },
      alignment: {
        engine: "stable-ts",
        model: "tiny",
        duration: 10,
        lines: [
          {
            text: "aligned",
            start: 0,
            end: 1,
            words: [{ text: "aligned", start: 0, end: 1, confidence: 1 }],
          },
        ],
        raw: {},
      },
    });
    expect(resolved?.source).toBe("edited");
    expect(resolved?.document.lines[0]?.text).toBe("edited");
  });

  it("resolves lyrics priority correction > alignment when no edits", () => {
    const resolved = resolveKaraokeDocument({
      correction: {
        engine: "whisper-context",
        lines: [
          {
            text: "corrected",
            start: 0,
            end: 1,
            words: [{ text: "corrected", start: 0, end: 1, confidence: 1 }],
          },
        ],
        changes: [],
        raw: {},
      },
      alignment: {
        engine: "stable-ts",
        model: "tiny",
        duration: 10,
        lines: [
          {
            text: "aligned",
            start: 0,
            end: 1,
            words: [{ text: "aligned", start: 0, end: 1, confidence: 1 }],
          },
        ],
        raw: {},
      },
    });
    expect(resolved?.source).toBe("correction");
    expect(resolved?.document.lines[0]?.text).toBe("corrected");
  });

  it("returns null when no lyrics sources", () => {
    expect(resolveKaraokeDocument({})).toBeNull();
  });
});
