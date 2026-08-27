import { describe, expect, it } from "vitest";
import { createLine, createWord } from "./lyrics";
import { mergeResyncIntoDocument } from "./lyrics-resync";

describe("mergeResyncIntoDocument", () => {
  it("updates word timings only when confidence meets threshold", () => {
    const edited = {
      language: "en",
      lines: [
        createLine("hello world", [
          createWord("hello", 0, 0.5, 1),
          createWord("world", 0.5, 1, 1),
        ]),
      ],
    };

    const { document, stats } = mergeResyncIntoDocument(edited, {
      lines: [
        {
          text: "hello world",
          start: 1.0,
          end: 2.0,
          words: [
            createWord("hello", 1.0, 1.4, 0.9),
            createWord("world", 1.4, 2.0, 0.2),
          ],
        },
      ],
    });

    expect(document.lines[0]?.words[0]?.start).toBe(1.0);
    expect(document.lines[0]?.words[1]?.start).toBe(0.5);
    expect(stats.wordsUpdated).toBe(1);
    expect(stats.wordsKept).toBe(1);
  });

  it("preserves user text and section metadata", () => {
    const edited = {
      language: "en",
      lines: [
        {
          ...createLine("custom text", [createWord("custom", 0, 0.4, 1), createWord("text", 0.4, 0.8, 1)]),
          section: "Chorus",
          translation: "перевод",
        },
      ],
    };

    const { document } = mergeResyncIntoDocument(edited, {
      lines: [
        {
          text: "ignored aligned text",
          start: 2,
          end: 3,
          words: [
            createWord("custom", 2.0, 2.3, 0.95),
            createWord("text", 2.3, 2.9, 0.95),
          ],
        },
      ],
    });

    expect(document.lines[0]?.text).toBe("custom text");
    expect(document.lines[0]?.section).toBe("Chorus");
    expect(document.lines[0]?.translation).toBe("перевод");
    expect(document.lines[0]?.words[0]?.start).toBe(2.0);
  });

  it("adopts aligned words when edited line had none", () => {
    const edited = {
      language: "en",
      lines: [{ text: "one two", start: 0, end: 1, words: [] }],
    };

    const { document, stats } = mergeResyncIntoDocument(edited, {
      lines: [
        {
          text: "one two",
          start: 5,
          end: 6,
          words: [
            createWord("one", 5.0, 5.4, 0.8),
            createWord("two", 5.4, 6.0, 0.85),
          ],
        },
      ],
    });

    expect(document.lines[0]?.words).toHaveLength(2);
    expect(stats.wordsUpdated).toBe(2);
  });
});
