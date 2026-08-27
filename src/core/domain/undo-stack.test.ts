import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createUndoStack,
  pushUndoStack,
  redoStack,
  undoStack,
} from "./undo-stack";

describe("undo-stack", () => {
  it("pushes and undoes state", () => {
    let stack = createUndoStack("a");
    stack = pushUndoStack(stack, "b");
    stack = pushUndoStack(stack, "c");
    expect(stack.present).toBe("c");

    const undone = undoStack(stack);
    expect(undone?.present).toBe("b");
    expect(canUndo(undone!)).toBe(true);
    expect(canRedo(undone!)).toBe(true);

    const redone = redoStack(undone!);
    expect(redone?.present).toBe("c");
  });

  it("clears future on new push after undo", () => {
    let stack = createUndoStack(1);
    stack = pushUndoStack(stack, 2);
    stack = undoStack(stack)!;
    stack = pushUndoStack(stack, 3);
    expect(canRedo(stack)).toBe(false);
    expect(stack.present).toBe(3);
  });

  it("respects max depth", () => {
    let stack = createUndoStack(0);
    for (let i = 1; i <= 60; i++) {
      stack = pushUndoStack(stack, i, 10);
    }
    expect(stack.past).toHaveLength(10);
    expect(stack.present).toBe(60);
  });
});
