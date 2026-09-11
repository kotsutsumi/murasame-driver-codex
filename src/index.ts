/**
 * @murasame/driver-codex
 *
 * Process/control layer for headless `codex exec --json` executions.
 */

export { buildCodexArgs } from "./command.ts";
export { createCodexDriver } from "./driver.ts";
export {
  CodexDriverDisposedError,
  CodexDriverError,
  CodexRunConfigurationError,
  CodexSpawnError,
} from "./errors.ts";
export { asCodexRunId, createCodexRunId } from "./ids.ts";
export { nodeProcessSpawner } from "./spawner.ts";
export type {
  CodexAdapterFactory,
  CodexApprovalPolicy,
  CodexChildProcess,
  CodexDriver,
  CodexDriverDiagnostic,
  CodexDriverDiagnosticCode,
  CodexDriverDiagnosticListener,
  CodexDriverDiagnosticSeverity,
  CodexDriverOptions,
  CodexProcessSpawner,
  CodexReadableStream,
  CodexRunHandle,
  CodexRunId,
  CodexRunInput,
  CodexRunResult,
  CodexRunState,
  CodexRunStatus,
  CodexSandboxMode,
  CodexSpawnOptions,
  CodexTimerScheduler,
  CodexWritableStream,
  Disposable,
} from "./types.ts";
