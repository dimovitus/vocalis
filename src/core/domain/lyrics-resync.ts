import type { LyricsDocument, LyricsLine, LyricsWord } from "../../shared/types";

export interface ResyncAlignmentLine {
  text: string;
  start: number;
  end: number;
  words: LyricsWord[];
}

export interface ResyncStats {
  linesTotal: number;
  linesUpdated: number;
  wordsUpdated: number;
  wordsKept: number;
  minConfidence: number;
}

const DEFAULT_MIN_CONFIDENCE = 0.35;

function lineAverageConfidence(words: LyricsWord[]): number {
  if (words.length === 0) return 0;
  return words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
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

function mergeWords(
  editedWords: LyricsWord[],
  alignedWords: LyricsWord[],
  minConfidence: number,
): { words: LyricsWord[]; updated: number; kept: number } {
  if (alignedWords.length === 0) {
    return { words: editedWords.map((w) => ({ ...w })), updated: 0, kept: editedWords.length };
  }

  if (editedWords.length === 0) {
    if (lineAverageConfidence(alignedWords) < minConfidence) {
      return { words: [], updated: 0, kept: 0 };
    }
    return {
      words: alignedWords.map((w) => ({ ...w })),
      updated: alignedWords.length,
      kept: 0,
    };
  }

  const merged: LyricsWord[] = [];
  let updated = 0;
  let kept = 0;
  const maxLen = Math.max(editedWords.length, alignedWords.length);

  for (let i = 0; i < maxLen; i += 1) {
    const edited = editedWords[i];
    const aligned = alignedWords[i];

    if (edited && aligned) {
      if (aligned.confidence >= minConfidence) {
        merged.push({
          ...edited,
          start: aligned.start,
          end: aligned.end,
          confidence: aligned.confidence,
        });
        updated += 1;
      } else {
        merged.push({ ...edited });
        kept += 1;
      }
      continue;
    }

    if (edited) {
      merged.push({ ...edited });
      kept += 1;
      continue;
    }

    if (aligned && aligned.confidence >= minConfidence) {
      merged.push({ ...aligned });
      updated += 1;
    }
  }

  return { words: merged, updated, kept };
}

/**
 * Merge audio-aware resync timings into the user-edited document.
 * User text, section, and translation always win; only confirmed word
 * timestamps are replaced.
 */
export function mergeResyncIntoDocument(
  edited: LyricsDocument,
  alignment: { lines: ResyncAlignmentLine[] },
  minConfidence = DEFAULT_MIN_CONFIDENCE,
): { document: LyricsDocument; stats: ResyncStats } {
  let linesUpdated = 0;
  let wordsUpdated = 0;
  let wordsKept = 0;

  const lines = edited.lines.map((line, index) => {
    const aligned = alignment.lines[index];
    if (!aligned) {
      wordsKept += line.words.length;
      return { ...line, words: line.words.map((w) => ({ ...w })) };
    }

    const { words, updated, kept } = mergeWords(line.words, aligned.words, minConfidence);
    wordsUpdated += updated;
    wordsKept += kept;

    if (updated === 0) {
      return { ...line, words: line.words.map((w) => ({ ...w })) };
    }

    linesUpdated += 1;
    const merged = syncLineBounds({
      ...line,
      words,
    });

    if (words.length === 0 && lineAverageConfidence(aligned.words) >= minConfidence) {
      merged.start = aligned.start;
      merged.end = aligned.end;
    }

    return merged;
  });

  return {
    document: { language: edited.language, lines },
    stats: {
      linesTotal: edited.lines.length,
      linesUpdated,
      wordsUpdated,
      wordsKept,
      minConfidence,
    },
  };
}

export { DEFAULT_MIN_CONFIDENCE };
