import type { LyricsDocument, TranslationResult } from "../../shared/types";

/** Apply AI translation lines onto a lyrics document (by lineIndex). */
export function applyTranslationToDocument(
  document: LyricsDocument,
  result: TranslationResult,
): LyricsDocument {
  const lines = document.lines.map((line) => ({ ...line, words: line.words.map((w) => ({ ...w })) }));

  for (const item of result.lines) {
    const line = lines[item.lineIndex];
    if (!line) continue;
    line.translation = item.translation;
    line.transliteration = item.transliteration ?? null;
  }

  return { language: document.language, lines };
}

export function subtitleForLine(
  line: LyricsDocument["lines"][number] | null | undefined,
  mode: "off" | "translation" | "transliteration" | "both",
): string | null {
  if (!line || mode === "off") return null;

  const translation = line.translation?.trim();
  const transliteration = line.transliteration?.trim();

  if (mode === "translation") return translation || null;
  if (mode === "transliteration") return transliteration || null;
  if (mode === "both") {
    if (translation && transliteration) return `${translation} · ${transliteration}`;
    return translation || transliteration || null;
  }
  return null;
}
