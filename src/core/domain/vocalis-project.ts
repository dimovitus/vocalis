import type { ProjectManifest } from "../../shared/types";

export const VOCALIS_PROJECT_FORMAT = "vocalis-project";
export const VOCALIS_PROJECT_SCHEMA_VERSION = 1;

/** Default `.vocalis` bundle layout (directory-based). */
export const VOCALIS_PROJECT_LAYOUT = {
  manifest: "project.json",
  artifactsDir: "artifacts",
  mediaDir: "media",
  canonicalAudio: "media/canonical.wav",
  stemsDir: "stems",
} as const;

export function defaultProjectFileName(sourceFileName: string): string {
  const stem = sourceFileName.replace(/\.[^.]+$/, "").replace(/[^\w\-+. ]+/g, "_");
  return `${stem || "Untitled"}.vocalis`;
}

export function isVocalisProjectManifest(value: unknown): value is ProjectManifest {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.schemaVersion === VOCALIS_PROJECT_SCHEMA_VERSION &&
    obj.format === VOCALIS_PROJECT_FORMAT &&
    typeof obj.importId === "string" &&
    typeof obj.title === "string"
  );
}

export function projectDisplayTitle(manifest: ProjectManifest): string {
  return manifest.title.trim() || manifest.source.fileName || "Untitled project";
}
