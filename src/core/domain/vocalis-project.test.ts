import { describe, expect, it } from "vitest";
import {
  defaultProjectFileName,
  isVocalisProjectManifest,
  VOCALIS_PROJECT_FORMAT,
  VOCALIS_PROJECT_SCHEMA_VERSION,
} from "./vocalis-project";

describe("vocalis-project", () => {
  it("builds default project directory name", () => {
    expect(defaultProjectFileName("My Song.mp3")).toBe("My Song.vocalis");
    expect(defaultProjectFileName("")).toBe("Untitled.vocalis");
  });

  it("validates project manifest", () => {
    expect(
      isVocalisProjectManifest({
        schemaVersion: VOCALIS_PROJECT_SCHEMA_VERSION,
        format: VOCALIS_PROJECT_FORMAT,
        importId: "00000000-0000-4000-8000-000000000001",
        title: "Demo",
      }),
    ).toBe(true);

    expect(isVocalisProjectManifest({ format: "other" })).toBe(false);
  });
});
