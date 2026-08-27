import { open, save } from "@tauri-apps/plugin-dialog";
import { defaultProjectFileName } from "../../core/domain/vocalis-project";
import { useAppStore } from "../stores/app-store";

export function ProjectMenu() {
  const {
    inTauri,
    importResult,
    projectPath,
    projectTitle,
    projectDirty,
    savingProject,
    saveProject,
    saveProjectAs,
    openProject,
  } = useAppStore();

  const disabled = !inTauri || savingProject;
  const hasSession = Boolean(importResult);
  const label = projectTitle || importResult?.source.fileName || "No project";

  async function handleOpen() {
    if (!inTauri) return;
    const selected = await open({
      title: "Open Vocalis project",
      directory: true,
      multiple: false,
    });
    if (!selected || Array.isArray(selected)) return;
    await openProject(selected);
  }

  async function handleSave() {
    if (!hasSession) return;
    await saveProject();
  }

  async function handleSaveAs() {
    if (!hasSession || !importResult) return;
    const defaultPath = projectPath ?? defaultProjectFileName(importResult.source.fileName);
    const selected = await save({
      title: "Save Vocalis project",
      defaultPath,
      filters: [{ name: "Vocalis Project", extensions: ["vocalis"] }],
    });
    if (!selected) return;
    await saveProjectAs(selected);
  }

  return (
    <div className="project-menu">
      <span className="project-menu-label muted" title={projectPath ?? undefined}>
        {label}
        {projectDirty ? " •" : ""}
      </span>
      <button type="button" disabled={disabled} onClick={() => void handleOpen()}>
        Open…
      </button>
      <button
        type="button"
        disabled={disabled || !hasSession}
        onClick={() => void handleSave()}
      >
        {savingProject ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        disabled={disabled || !hasSession}
        onClick={() => void handleSaveAs()}
      >
        Save As…
      </button>
    </div>
  );
}
