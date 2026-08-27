import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

type GlobalWithTauri = typeof globalThis & { isTauri?: boolean };

export function setupTauriMocks(
  handler: (cmd: string, payload?: Record<string, unknown>) => unknown,
): void {
  mockWindows("main");
  mockIPC((cmd, payload) => handler(cmd, payload as Record<string, unknown> | undefined));
  (globalThis as GlobalWithTauri).isTauri = true;
}

export function teardownTauriMocks(): void {
  clearMocks();
  delete (globalThis as GlobalWithTauri).isTauri;
}
