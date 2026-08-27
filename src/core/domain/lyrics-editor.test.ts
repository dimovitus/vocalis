import { describe, expect, it } from "vitest";
import {
  buildEditableDocument,
  mergeWithNext,
  shiftLineTiming,
  splitLine,
  updateLineText,
} from "./lyrics-editor";
import { createLine, createWord } from "./lyrics";

const sample = {
  language: "en",
  lines: [
    createLine("hello world today", [
      createWord("hello", 1.0, 1.4),
      createWord("world", 1.4, 1.8),
      createWord("today", 1.8, 2.2),
    ]),
    createLine("second line", [
      createWord("second", 3.0, 3.4),
      createWord("line", 3.4, 3.8),
    ]),
  ],
};

describe("lyrics editor", () => {
  it("prefers edited over correction", () => {
    const edited = { language: "en", lines: [sample.lines[0]!] };
    const result = buildEditableDocument({
      edited,
      correction: { lines: sample.lines },
    });
    expect(result?.source).toBe("edited");
    expect(result?.document.lines).toHaveLength(1);
  });

  it("splits line after word index", () => {
    const next = splitLine({ ...sample }, 0, 0);
    expect(next.lines).toHaveLength(3);
    expect(next.lines[0]?.text).toBe("hello");
    expect(next.lines[1]?.text).toBe("world today");
  });

  it("merges with next line", () => {
    const next = mergeWithNext({ ...sample }, 0);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]?.words).toHaveLength(5);
  });

  it("shifts line timing", () => {
    const next = shiftLineTiming({ ...sample }, 0, 0.5);
    expect(next.lines[0]?.start).toBeCloseTo(1.5);
    expect(next.lines[0]?.end).toBeCloseTo(2.7);
  });

  it("updates line text", () => {
    const next = updateLineText({ ...sample }, 0, "hi there");
    expect(next.lines[0]?.text).toBe("hi there");
  });
});
