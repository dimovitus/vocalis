import type { LyricsDocument, LyricsLine, LyricsWord } from "../../shared/types";
import { createWord } from "./lyrics";

export type EditableSource =
  | "edited"
  | "correction"
  | "alignment"
  | "transcription";

export interface BuildEditableInput {
  edited?: LyricsDocument | null;
  correction?: { language?: string; lines: Array<{ text: string; start: number; end: number; words: LyricsWord[] }> } | null;
  alignment?: { language?: string; lines: Array<{ text: string; start: number; end: number; words: LyricsWord[] }> } | null;
  transcription?: { language?: string; segments: Array<{ text: string; start: number; end: number; words: LyricsWord[] }> } | null;
  structureLineLabels?: Array<{ lineIndex: number; label?: string | null }>;
}

/** Build editable document — prefer saved edits, else AI layers. */
export function buildEditableDocument(
  input: BuildEditableInput,
): { document: LyricsDocument; source: EditableSource } | null {
  if (input.edited && input.edited.lines.length > 0) {
    return { document: cloneDocument(input.edited), source: "edited" };
  }

  let base: { document: LyricsDocument; source: EditableSource } | null = null;

  if (input.correction && input.correction.lines.length > 0) {
    base = {
      source: "correction",
      document: {
        language: input.correction.language,
        lines: input.correction.lines.map(mapLine),
      },
    };
  } else if (input.alignment && input.alignment.lines.length > 0) {
    base = {
      source: "alignment",
      document: {
        language: input.alignment.language,
        lines: input.alignment.lines.map(mapLine),
      },
    };
  } else if (input.transcription && input.transcription.segments.length > 0) {
    base = {
      source: "transcription",
      document: {
        language: input.transcription.language,
        lines: input.transcription.segments.map((seg) => mapLine(seg)),
      },
    };
  }

  if (!base) return null;

  if (input.structureLineLabels?.length) {
    const labels = new Map(
      input.structureLineLabels
        .filter((l) => l.label)
        .map((l) => [l.lineIndex, l.label as string]),
    );
    base.document.lines = base.document.lines.map((line, idx) => ({
      ...line,
      section: labels.get(idx) ?? line.section ?? null,
    }));
  }

  return { document: cloneDocument(base.document), source: base.source };
}

function mapLine(line: {
  text: string;
  start: number;
  end: number;
  words: LyricsWord[];
}): LyricsLine {
  return {
    text: line.text,
    start: line.start,
    end: line.end,
    words: line.words.map((w) => ({ ...w })),
    section: null,
    translation: null,
    transliteration: null,
  };
}

export function cloneDocument(doc: LyricsDocument): LyricsDocument {
  return {
    language: doc.language,
    lines: doc.lines.map((line) => ({
      ...line,
      words: line.words.map((w) => ({ ...w })),
    })),
  };
}

export function updateLineText(
  doc: LyricsDocument,
  lineIndex: number,
  text: string,
): LyricsDocument {
  const lines = [...doc.lines];
  const line = { ...lines[lineIndex]! };
  line.text = text;
  if (line.words.length > 0) {
    line.words = redistributeWordsFromText(line.words, text, line.start, line.end);
  }
  lines[lineIndex] = syncLineBounds(line);
  return { ...doc, lines };
}

export function updateLineTiming(
  doc: LyricsDocument,
  lineIndex: number,
  start: number,
  end: number,
): LyricsDocument {
  const lines = [...doc.lines];
  const line = { ...lines[lineIndex]! };
  const oldStart = line.start;
  const oldEnd = Math.max(line.end, oldStart + 0.01);
  const newStart = Math.max(0, start);
  const newEnd = Math.max(newStart + 0.01, end);
  line.start = newStart;
  line.end = newEnd;
  if (line.words.length > 0) {
    line.words = line.words.map((w) => {
      const rel0 = (w.start - oldStart) / (oldEnd - oldStart);
      const rel1 = (w.end - oldStart) / (oldEnd - oldStart);
      return {
        ...w,
        start: newStart + rel0 * (newEnd - newStart),
        end: newStart + rel1 * (newEnd - newStart),
      };
    });
  }
  lines[lineIndex] = line;
  return { ...doc, lines };
}

export function updateWordTiming(
  doc: LyricsDocument,
  lineIndex: number,
  wordIndex: number,
  start: number,
  end: number,
): LyricsDocument {
  const lines = [...doc.lines];
  const line = { ...lines[lineIndex]! };
  const words = [...line.words];
  words[wordIndex] = {
    ...words[wordIndex]!,
    start: Math.max(0, start),
    end: Math.max(start + 0.01, end),
  };
  line.words = words;
  lines[lineIndex] = syncLineBounds(line);
  return { ...doc, lines };
}

export function updateWordText(
  doc: LyricsDocument,
  lineIndex: number,
  wordIndex: number,
  text: string,
): LyricsDocument {
  const lines = [...doc.lines];
  const line = { ...lines[lineIndex]! };
  const words = [...line.words];
  words[wordIndex] = { ...words[wordIndex]!, text };
  line.words = words;
  line.text = words.map((w) => w.text).join(" ");
  lines[lineIndex] = line;
  return { ...doc, lines };
}

export function setLineSection(
  doc: LyricsDocument,
  lineIndex: number,
  section: string | null,
): LyricsDocument {
  const lines = [...doc.lines];
  lines[lineIndex] = { ...lines[lineIndex]!, section: section || null };
  return { ...doc, lines };
}

export function setLineTranslation(
  doc: LyricsDocument,
  lineIndex: number,
  translation: string | null,
  transliteration?: string | null,
): LyricsDocument {
  const lines = [...doc.lines];
  lines[lineIndex] = {
    ...lines[lineIndex]!,
    translation: translation || null,
    transliteration: transliteration ?? lines[lineIndex]?.transliteration ?? null,
  };
  return { ...doc, lines };
}

/** Split line after wordIndex — second part becomes new line. */
export function splitLine(
  doc: LyricsDocument,
  lineIndex: number,
  afterWordIndex: number,
): LyricsDocument {
  const line = doc.lines[lineIndex];
  if (!line || line.words.length === 0 || afterWordIndex >= line.words.length - 1) {
    return doc;
  }
  const firstWords = line.words.slice(0, afterWordIndex + 1);
  const secondWords = line.words.slice(afterWordIndex + 1);
  const first = syncLineBounds({
    ...line,
    text: firstWords.map((w) => w.text).join(" "),
    words: firstWords,
  });
  const second = syncLineBounds({
    ...line,
    text: secondWords.map((w) => w.text).join(" "),
    words: secondWords,
    section: null,
    translation: null,
    transliteration: null,
  });
  const lines = [...doc.lines];
  lines.splice(lineIndex, 1, first, second);
  return { ...doc, lines };
}

/** Merge line with next. */
export function mergeWithNext(doc: LyricsDocument, lineIndex: number): LyricsDocument {
  if (lineIndex >= doc.lines.length - 1) return doc;
  const a = doc.lines[lineIndex]!;
  const b = doc.lines[lineIndex + 1]!;
  const words = [...a.words, ...b.words];
  const merged = syncLineBounds({
    ...a,
    text: `${a.text} ${b.text}`.trim(),
    words: words.length > 0 ? words : [createWord(b.text || a.text, a.start, b.end)],
    end: b.end,
    translation: a.translation ?? b.translation ?? null,
  });
  const lines = [...doc.lines];
  lines.splice(lineIndex, 2, merged);
  return { ...doc, lines };
}

/** Shift line (+ words) by delta seconds. */
export function shiftLineTiming(
  doc: LyricsDocument,
  lineIndex: number,
  delta: number,
): LyricsDocument {
  const line = doc.lines[lineIndex];
  if (!line) return doc;
  return updateLineTiming(
    doc,
    lineIndex,
    Math.max(0, line.start + delta),
    Math.max(0, line.end + delta),
  );
}

export function setWordStartFromPlayhead(
  doc: LyricsDocument,
  lineIndex: number,
  wordIndex: number,
  position: number,
): LyricsDocument {
  const word = doc.lines[lineIndex]?.words[wordIndex];
  if (!word) return doc;
  return updateWordTiming(doc, lineIndex, wordIndex, position, Math.max(position + 0.05, word.end));
}

export function setWordEndFromPlayhead(
  doc: LyricsDocument,
  lineIndex: number,
  wordIndex: number,
  position: number,
): LyricsDocument {
  const word = doc.lines[lineIndex]?.words[wordIndex];
  if (!word) return doc;
  return updateWordTiming(doc, lineIndex, wordIndex, word.start, Math.max(word.start + 0.05, position));
}

function syncLineBounds(line: LyricsLine): LyricsLine {
  if (line.words.length === 0) return line;
  return {
    ...line,
    start: line.words[0]!.start,
    end: line.words[line.words.length - 1]!.end,
    text: line.words.map((w) => w.text).join(" "),
  };
}

/** When line text edited but words exist — keep timing spans, replace word texts. */
function redistributeWordsFromText(
  words: LyricsWord[],
  text: string,
  start: number,
  end: number,
): LyricsWord[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return words;
  if (parts.length === words.length) {
    return words.map((w, i) => ({ ...w, text: parts[i]! }));
  }
  const span = Math.max(end - start, 0.01);
  const slice = span / parts.length;
  return parts.map((part, i) =>
    createWord(part, start + i * slice, start + (i + 1) * slice, 1),
  );
}

export function toLyricsDocument(
  doc: LyricsDocument,
): LyricsDocument {
  return cloneDocument(doc);
}
