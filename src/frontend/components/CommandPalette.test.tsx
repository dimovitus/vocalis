import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type AppCommand } from "./CommandPalette";

const commands: AppCommand[] = [
  {
    id: "nav-pipeline",
    label: "Go to Pipeline",
    group: "Navigation",
    keywords: ["pipeline"],
    run: vi.fn(),
  },
  {
    id: "save",
    label: "Save project",
    group: "Project",
    disabled: true,
    run: vi.fn(),
  },
];

describe("CommandPalette", () => {
  afterEach(() => cleanup());

  it("filters commands by query", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette open commands={commands} onClose={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText("Type a command…");
    await user.type(input, "pipeline");

    expect(screen.getByText("Go to Pipeline")).toBeInTheDocument();
    expect(screen.queryByText("Save project")).not.toBeInTheDocument();
  });

  it("runs command on Enter", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CommandPalette open commands={commands} onClose={onClose} />,
    );

    await user.keyboard("{Enter}");
    expect(commands[0].run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
