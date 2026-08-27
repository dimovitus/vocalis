/** Immutable undo/redo stack for reversible editor state. */

export interface UndoStack<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createUndoStack<T>(initial: T): UndoStack<T> {
  return { past: [], present: initial, future: [] };
}

export function pushUndoStack<T>(
  stack: UndoStack<T>,
  next: T,
  maxDepth = 50,
): UndoStack<T> {
  const past = [...stack.past, stack.present].slice(-maxDepth);
  return { past, present: next, future: [] };
}

export function undoStack<T>(stack: UndoStack<T>): UndoStack<T> | null {
  if (stack.past.length === 0) return null;
  const past = [...stack.past];
  const previous = past.pop()!;
  return {
    past,
    present: previous,
    future: [stack.present, ...stack.future],
  };
}

export function redoStack<T>(stack: UndoStack<T>): UndoStack<T> | null {
  if (stack.future.length === 0) return null;
  const [next, ...future] = stack.future;
  return {
    past: [...stack.past, stack.present],
    present: next,
    future,
  };
}

export function canUndo<T>(stack: UndoStack<T>): boolean {
  return stack.past.length > 0;
}

export function canRedo<T>(stack: UndoStack<T>): boolean {
  return stack.future.length > 0;
}
