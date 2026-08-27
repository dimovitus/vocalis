import { describe, expect, it } from "vitest";
import { formatBytes, isBackendAvailable } from "./hardware";

describe("hardware domain", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("checks backend availability", () => {
    expect(isBackendAvailable("cuda", ["cpu", "cuda"])).toBe(true);
    expect(isBackendAvailable("dml", ["cpu"])).toBe(false);
    expect(isBackendAvailable("auto", ["cpu"])).toBe(true);
  });
});
