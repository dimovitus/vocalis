import type {
  AlignmentResult,
  CorrectionResult,
  LyricsDocument,
  LyricsLine,
  LyricsWord,
  TranscriptionResult,
} from "../../shared/types";

export type KaraokeMode = "line" | "word" | "progressive";

export type WordSingState = "upcoming" | "active" | "sung";

export interface KaraokeWordState {
  index: number;
  text: string;
  start: number;
  end: number;
  state: WordSingState;
  /** 0..1 within the word window (progressive / active fill). */
  progress: number;
}

export interface KaraokeFrame {
  mode: KaraokeMode;
  currentTime: number;
  lineIndex: number | null;
  previousLineIndex: number | null;
  nextLineIndex: number | null;
  line: LyricsLine | null;
  /** Whole-line visibility for line mode (true while inside line window). */
  lineActive: boolean;
  words: KaraokeWordState[];
  /** 0..1 progress across the active line (word-timed). */
  lineProgress: number;
  /** ASCII-style progressive meter matching sung portion of the line. */
  progressiveMeter: string;
  source: string;
  hasWordTimestamps: boolean;
}

export interface KaraokeSourceInput {
  edited?: LyricsDocument | null;
  correction?: CorrectionResult | null;
  alignment?: AlignmentResult | null;
  transcription?: TranscriptionResult | null;
}

/** Prefer user edits, then corrected, aligned, transcribed lines. */
export function resolveKaraokeDocument(
  input: KaraokeSourceInput,
): { document: LyricsDocument; source: string } | null {
  if (input.edited && input.edited.lines.length > 0) {
    return {
      source: "edited",
      document: {
        language: input.edited.language,
        lines: input.edited.lines.map((line) => ({
          text: line.text,
          start: line.start,
          end: line.end,
          words: line.words.map(toWord),
          section: line.section,
          translation: line.translation,
          transliteration: line.transliteration,
        })),
      },
    };
  }

  if (input.correction && input.correction.lines.length > 0) {
    return {
      source: "correction",
      document: {
        language: input.correction.language,
        lines: input.correction.lines.map((line) => ({
          text: line.text,
          start: line.start,
          end: line.end,
          words: line.words.map(toWord),
        })),
      },
    };
  }

  if (input.alignment && input.alignment.lines.length > 0) {
    return {
      source: "alignment",
      document: {
        language: input.alignment.language,
        lines: input.alignment.lines.map((line) => ({
          text: line.text,
          start: line.start,
          end: line.end,
          words: line.words.map(toWord),
        })),
      },
    };
  }

  if (input.transcription && input.transcription.segments.length > 0) {
    return {
      source: "transcription",
      document: {
        language: input.transcription.language,
        lines: input.transcription.segments.map((seg) => ({
          text: seg.text,
          start: seg.start,
          end: seg.end,
          words: (seg.words ?? []).map(toWord),
        })),
      },
    };
  }

  return null;
}

function toWord(w: {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}): LyricsWord {
  return {
    text: w.text,
    start: w.start,
    end: w.end,
    confidence: w.confidence ?? 1,
  };
}

export function documentHasWordTimestamps(doc: LyricsDocument): boolean {
  return doc.lines.some((line) => line.words.length > 0);
}

/**
 * Find the active line for `currentTime` using real line timestamps.
 * Prefers the latest line whose window contains t; if between lines, null.
 */
export function findActiveLineIndex(
  lines: LyricsLine[],
  currentTime: number,
): number | null {
  if (!lines.length || !Number.isFinite(currentTime)) return null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (currentTime >= line.start && currentTime < line.end) {
      return i;
    }
  }

  // At exact end of last line, treat as still active briefly
  const last = lines[lines.length - 1]!;
  if (currentTime >= last.start && currentTime <= last.end) {
    return lines.length - 1;
  }

  return null;
}

export function wordProgress(word: LyricsWord, currentTime: number): number {
  const span = Math.max(word.end - word.start, 1e-6);
  if (currentTime < word.start) return 0;
  if (currentTime >= word.end) return 1;
  return Math.min(1, Math.max(0, (currentTime - word.start) / span));
}

export function buildWordStates(
  line: LyricsLine,
  currentTime: number,
): KaraokeWordState[] {
  return line.words.map((word, index) => {
    const progress = wordProgress(word, currentTime);
    let state: WordSingState = "upcoming";
    if (currentTime >= word.end) state = "sung";
    else if (currentTime >= word.start) state = "active";
    return {
      index,
      text: word.text,
      start: word.start,
      end: word.end,
      state,
      progress,
    };
  });
}

/** Line progress 0..1 from word timestamps (or whole line if no words). */
export function computeLineProgress(
  line: LyricsLine,
  currentTime: number,
): number {
  if (line.words.length === 0) {
    const span = Math.max(line.end - line.start, 1e-6);
    if (currentTime < line.start) return 0;
    if (currentTime >= line.end) return 1;
    return Math.min(1, Math.max(0, (currentTime - line.start) / span));
  }

  const sung = line.words.reduce((acc, word) => acc + wordProgress(word, currentTime), 0);
  return Math.min(1, Math.max(0, sung / line.words.length));
}

/** Progressive meter like ████████░░░░░░░░░ from real timing. */
export function buildProgressiveMeter(
  progress: number,
  width = 17,
): string {
  const clamped = Math.min(1, Math.max(0, progress));
  const filled = Math.round(clamped * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

/**
 * Pure karaoke engine frame from real playback time + lyrics timestamps.
 */
export function resolveKaraokeFrame(
  document: LyricsDocument,
  currentTime: number,
  mode: KaraokeMode,
  source = "lyrics",
): KaraokeFrame {
  const lines = document.lines;
  const lineIndex = findActiveLineIndex(lines, currentTime);
  const line = lineIndex != null ? lines[lineIndex]! : null;
  const previousLineIndex =
    lineIndex != null && lineIndex > 0 ? lineIndex - 1 : null;
  const nextLineIndex =
    lineIndex != null && lineIndex < lines.length - 1 ? lineIndex + 1 : null;

  const words = line ? buildWordStates(line, currentTime) : [];
  const lineProgress = line ? computeLineProgress(line, currentTime) : 0;
  const hasWordTimestamps = documentHasWordTimestamps(document);

  return {
    mode,
    currentTime,
    lineIndex,
    previousLineIndex,
    nextLineIndex,
    line,
    lineActive: lineIndex != null,
    words,
    lineProgress,
    progressiveMeter: buildProgressiveMeter(lineProgress),
    source,
    hasWordTimestamps,
  };
}
