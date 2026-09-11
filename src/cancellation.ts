import type { CodexTimerScheduler } from "./types.ts";

export type CancelEscalationStage = "SIGINT" | "SIGTERM" | "SIGKILL";

export function nextEscalationSignal(stage: CancelEscalationStage): NodeJS.Signals | undefined {
  switch (stage) {
    case "SIGINT":
      return "SIGTERM";
    case "SIGTERM":
      return "SIGKILL";
    case "SIGKILL":
      return undefined;
  }
}

export function scheduleTimer(
  timer: CodexTimerScheduler,
  callback: () => void,
  delayMs: number,
): unknown {
  return timer.setTimeout(callback, delayMs);
}
