import type { AppCommand } from "../components/CommandPalette";

export type AppView = "karaoke" | "editor" | "pipeline" | "library" | "system";

interface BuildCommandsInput {
  inTauri: boolean;
  hasSession: boolean;
  view: AppView;
  setView: (view: AppView) => void;
  saveProject: () => void;
  togglePlayback: () => void;
  openCommandPalette: () => void;
  runOneClickKaraoke: () => void;
  oneClickRunning: boolean;
}

const VIEW_SHORTCUTS: Record<AppView, string> = {
  karaoke: "Ctrl+1",
  editor: "Ctrl+2",
  library: "Ctrl+3",
  pipeline: "Ctrl+4",
  system: "Ctrl+5",
};

export function buildAppCommands(input: BuildCommandsInput): AppCommand[] {
  const {
    inTauri,
    hasSession,
    view,
    setView,
    saveProject,
    togglePlayback,
    openCommandPalette,
    runOneClickKaraoke,
    oneClickRunning,
  } = input;

  const nav = (id: AppView, label: string): AppCommand => ({
    id: `nav-${id}`,
    label: `Go to ${label}`,
    group: "Navigation",
    keywords: [label.toLowerCase(), "view", "tab"],
    shortcut: VIEW_SHORTCUTS[id],
    run: () => setView(id),
  });

  return [
    nav("karaoke", "Karaoke"),
    nav("editor", "Editor"),
    nav("library", "Library"),
    nav("pipeline", "Pipeline"),
    nav("system", "System"),
    {
      id: "palette",
      label: "Command palette",
      group: "General",
      keywords: ["search", "commands"],
      shortcut: "Ctrl+K",
      run: openCommandPalette,
    },
    {
      id: "save",
      label: "Save project",
      group: "Project",
      keywords: ["save", "disk"],
      shortcut: "Ctrl+S",
      disabled: !inTauri || !hasSession,
      run: saveProject,
    },
    {
      id: "create-karaoke",
      label: "Create Karaoke (one-click pipeline)",
      group: "Pipeline",
      keywords: ["karaoke", "automate", "pipeline", "one-click"],
      disabled: !inTauri || !hasSession || oneClickRunning,
      run: runOneClickKaraoke,
    },
    {
      id: "play-pause",
      label: "Play / Pause",
      group: "Playback",
      keywords: ["space", "transport"],
      shortcut: "Space",
      disabled: !hasSession || view !== "karaoke",
      run: togglePlayback,
    },
  ];
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(el.isContentEditable);
}

/** Register global keyboard shortcuts (desktop workflow). */
export function bindGlobalShortcuts(handlers: {
  onCommandPalette: () => void;
  onSave: () => void;
  onNavigate: (view: AppView) => void;
}): () => void {
  function onKeyDown(e: KeyboardEvent) {
    if (isTypingTarget(e.target)) return;

    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      handlers.onCommandPalette();
      return;
    }

    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handlers.onSave();
      return;
    }

    if (mod && e.key >= "1" && e.key <= "5") {
      e.preventDefault();
      const views: AppView[] = [
        "karaoke",
        "editor",
        "library",
        "pipeline",
        "system",
      ];
      handlers.onNavigate(views[Number(e.key) - 1]);
    }
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
