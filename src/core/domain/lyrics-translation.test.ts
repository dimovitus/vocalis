import { describe, expect, it } from "vitest";
import { createLine } from "./lyrics";
import { applyTranslationToDocument, subtitleForLine } from "./lyrics-translation";

describe("lyrics translation domain", () => {
  it("applies translation by line index", () => {
    const doc = {
      language: "ja",
      lines: [createLine("こんにちは", []), createLine("世界", [])],
    };

    const next = applyTranslationToDocument(doc, {
      engine: "argos-translate",
      sourceLanguage: "ja",
      targetLanguage: "en",
      mode: "natural",
      lines: [
        {
          lineIndex: 0,
          original: "こんにちは",
          translation: "Hello",
          transliteration: "konnichiwa",
          confidence: 0.9,
        },
        {
          lineIndex: 1,
          original: "世界",
          translation: "World",
          transliteration: "sekai",
          confidence: 0.9,
        },
      ],
      raw: {},
    });

    expect(next.lines[0]?.translation).toBe("Hello");
    expect(next.lines[0]?.transliteration).toBe("konnichiwa");
    expect(next.lines[0]?.text).toBe("こんにちは");
  });

  it("builds karaoke subtitle text", () => {
    const line = {
      ...createLine("original", []),
      translation: "Перевод",
      transliteration: "translit",
    };
    expect(subtitleForLine(line, "translation")).toBe("Перевод");
    expect(subtitleForLine(line, "both")).toBe("Перевод · translit");
    expect(subtitleForLine(line, "off")).toBeNull();
  });
});
