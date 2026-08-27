import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorBanner } from "./ErrorBanner";

describe("ErrorBanner", () => {
  it("renders structured error with code badge and suggested action", () => {
    render(
      <ErrorBanner
        error={{
          code: "MODEL_NOT_INSTALLED",
          message: "Whisper tiny missing",
          userMessage: "A required AI model is not installed.",
          recoverable: true,
          suggestedAction: "Open System → Model Manager.",
          details: "Model tiny not found in cache",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("A required AI model is not installed.")).toBeInTheDocument();
    expect(screen.getByText("Model missing")).toBeInTheDocument();
    expect(screen.getByText("Recoverable")).toBeInTheDocument();
    expect(screen.getByText("Open System → Model Manager.")).toBeInTheDocument();
    expect(screen.getByText("Technical details")).toBeInTheDocument();
  });

  it("shows fatal badge for non-recoverable errors", () => {
    render(
      <ErrorBanner
        error={{
          code: "INTERNAL_ERROR",
          message: "boom",
          userMessage: "Something went wrong.",
          recoverable: false,
        }}
      />,
    );

    expect(screen.getByText("Fatal")).toBeInTheDocument();
  });

  it("normalizes plain string errors", () => {
    render(<ErrorBanner error="Simple failure" />);
    expect(screen.getByText("Simple failure")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("calls onDismiss when Dismiss is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <ErrorBanner
        error={{
          code: "IPC_ERROR",
          message: "fail",
          userMessage: "Communication failed.",
          recoverable: true,
        }}
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("returns null when error is absent", () => {
    const { container } = render(<ErrorBanner error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
