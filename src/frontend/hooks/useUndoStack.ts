import { useCallback, useState } from "react";
import type { UndoStack } from "../../core/domain/undo-stack";
import {
  canRedo,
  canUndo,
  createUndoStack,
  pushUndoStack,
  redoStack,
  undoStack,
} from "../../core/domain/undo-stack";

export function useUndoStack<T>(initial: T | null, maxDepth = 50) {
  const [stack, setStack] = useState<UndoStack<T> | null>(() =>
    initial != null ? createUndoStack(initial) : null,
  );

  const reset = useCallback((next: T | null) => {
    setStack(next != null ? createUndoStack(next) : null);
  }, []);

  const push = useCallback(
    (next: T) => {
      setStack((current) => {
        if (current == null) return createUndoStack(next);
        return pushUndoStack(current, next, maxDepth);
      });
    },
    [maxDepth],
  );

  const undo = useCallback(() => {
    setStack((current) => {
      if (current == null) return current;
      return undoStack(current) ?? current;
    });
  }, []);

  const redo = useCallback(() => {
    setStack((current) => {
      if (current == null) return current;
      return redoStack(current) ?? current;
    });
  }, []);

  return {
    present: stack?.present ?? null,
    push,
    undo,
    redo,
    reset,
    canUndo: stack != null && canUndo(stack),
    canRedo: stack != null && canRedo(stack),
  };
}
