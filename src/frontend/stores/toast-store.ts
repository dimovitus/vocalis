import { create } from "zustand";

export type ToastTone = "info" | "success" | "warning";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: string) => void;
}

let toastSeq = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push(message, tone = "info") {
    const id = `toast-${++toastSeq}`;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    window.setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Non-React helper for stores and services. */
export function pushToast(message: string, tone: ToastTone = "info") {
  useToastStore.getState().push(message, tone);
}
