import { describe, expect, it } from "vitest";
import { createLine, createWord } from "./lyrics";

describe("domain helpers", () => {
  it("builds a line from word timestamps", () => {
    const line = createLine("hello world", [
      createWord("hello", 1.0, 1.4),
      createWord("world", 1.5, 1.9),
    ]);

    expect(line.start).toBe(1.0);
    expect(line.end).toBe(1.9);
    expect(line.words).toHaveLength(2);
  });
});
