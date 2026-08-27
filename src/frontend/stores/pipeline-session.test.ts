import { describe, expect, it } from "vitest";
import { pipelineSessionError } from "./pipeline-session";

describe("pipeline-session", () => {
  it("returns error when import is missing", () => {
    const err = pipelineSessionError(false, null, "Need import", "Import first");
    expect(err?.code).toBeDefined();
    expect(err?.userMessage).toContain("Need import");
  });

  it("returns browser preview error in web mode with import", () => {
    const err = pipelineSessionError(
      false,
      { id: "x" } as never,
      "msg",
      "action",
    );
    expect(err?.code).toBe("BROWSER_PREVIEW");
  });

  it("returns null for valid desktop session", () => {
    expect(
      pipelineSessionError(true, { id: "x" } as never, "msg", "action"),
    ).toBeNull();
  });
});
