import type { LyricsLine, LyricsWord } from "../../shared/types";

export function createWord(
  text: string,
  start: number,
  end: number,
  confidence = 1,
): LyricsWord {
  return { text, start, end, confidence };
}

export function createLine(text: string, words: LyricsWord[]): LyricsLine {
  const start = words[0]?.start ?? 0;
  const lastWord = words[words.length - 1];
  const end = lastWord?.end ?? start;
  return { text, start, end, words };
}
