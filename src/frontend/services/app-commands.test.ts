import { describe, expect, it, vi } from "vitest";
import { buildAppCommands, isTypingTarget } from "./app-commands";

describe("app-commands", () => {
  it("builds navigation commands with shortcuts", () => {
    const cmds = buildAppCommands({
      inTauri: true,
      hasSession: true,
      view: "karaoke",
      setView: vi.fn(),
      saveProject: vi.fn(),
      togglePlayback: vi.fn(),
      openCommandPalette: vi.fn(),
      runOneClickKaraoke: vi.fn(),
      oneClickRunning: false,
    });

    expect(cmds.find((c) => c.id === "nav-pipeline")?.shortcut).toBe("Ctrl+4");
    expect(cmds.find((c) => c.id === "save")?.disabled).toBe(false);
  });

  it("disables save without session", () => {
    const cmds = buildAppCommands({
      inTauri: true,
      hasSession: false,
      view: "pipeline",
      setView: vi.fn(),
      saveProject: vi.fn(),
      togglePlayback: vi.fn(),
      openCommandPalette: vi.fn(),
      runOneClickKaraoke: vi.fn(),
      oneClickRunning: false,
    });

    expect(cmds.find((c) => c.id === "save")?.disabled).toBe(true);
  });

  it("detects typing targets", () => {
    const input = document.createElement("input");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });
});
