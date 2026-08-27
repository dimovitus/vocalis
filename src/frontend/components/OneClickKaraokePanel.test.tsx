import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../stores/app-store", () => ({
  useAppStore: () => ({
    inTauri: true,
    importResult: { id: "test-import", source: { fileName: "song.mp3" } },
    importing: false,
    separating: false,
    transcribing: false,
    correcting: false,
    aligning: false,
    detectingStructure: false,
    separation: null,
    transcription: null,
    correction: null,
    alignment: null,
    structure: null,
    oneClickRunning: false,
    oneClickStep: null,
    oneClickFailedStep: null,
    runOneClickKaraoke: vi.fn(),
  }),
}));

describe("OneClickKaraokePanel", () => {
  afterEach(() => cleanup());

  it("renders checklist and create button", async () => {
    const { OneClickKaraokePanel } = await import("./OneClickKaraokePanel");
    render(<OneClickKaraokePanel />);

    expect(screen.getByRole("heading", { name: "Create Karaoke" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Karaoke" })).toBeInTheDocument();
    expect(screen.getByText("Audio analyzed")).toBeInTheDocument();
    expect(screen.getByText("Karaoke generated")).toBeInTheDocument();
  });
});
