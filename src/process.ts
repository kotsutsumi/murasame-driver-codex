import type { CodexTimerScheduler } from "./types.ts";

export const defaultTimer: CodexTimerScheduler = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export function chunkToText(chunk: string | Uint8Array): string {
  return typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
}

export function chunkByteLength(chunk: string | Uint8Array): number {
  return typeof chunk === "string" ? new TextEncoder().encode(chunk).byteLength : chunk.byteLength;
}
