import type { CodexAdapter, CodexAdapterOptions } from "@murasame/adapter-codex";
import type { MurasameRuntime } from "@murasame/runtime";

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export type CodexApprovalPolicy =
  | "untrusted"
  | "on-failure"
  | "on-request"
  | "never"
  | (string & {});

export type CodexRunId = string & { readonly __brand: "CodexRunId" };

export type CodexRunState =
  | "starting"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface CodexRunInput {
  readonly prompt: string;
  readonly cwd?: string;
  readonly model?: string;
  readonly sandbox?: CodexSandboxMode | string;
  readonly approvalPolicy?: CodexApprovalPolicy;
  readonly profile?: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly images?: readonly string[];
  readonly resumeThreadId?: string;
  readonly timeoutMs?: number;
  readonly skipGitRepoCheck?: boolean;
  readonly extraArgs?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type CodexRunStatus = "completed" | "failed" | "cancelled";

export interface CodexRunResult {
  readonly runId: CodexRunId;
  readonly status: CodexRunStatus;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly cancelReason?: string;
  readonly threadId?: string;
  readonly stderr: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly semanticEventCount: number;
}

export interface Disposable {
  dispose(): void;
}

export type CodexDriverDiagnosticSeverity = "info" | "warning" | "error";

export type CodexDriverDiagnosticCode =
  | "SPAWN_FAILED"
  | "STDIN_WRITE_FAILED"
  | "STDERR_TRUNCATED"
  | "ADAPTER_DIAGNOSTIC"
  | "ADAPTER_FAILURE"
  | "RUNTIME_EVENT_REJECTED"
  | "RUN_TIMEOUT"
  | "CANCEL_ESCALATED"
  | "PROCESS_EXITED_BY_SIGNAL"
  | "PROCESS_EXIT_NON_ZERO"
  | "EMPTY_SUCCESSFUL_RUN"
  | "STDOUT_CLOSED_EARLY"
  | "UNEXPECTED_PROCESS_STATE"
  | "DRIVER_DISPOSED";

export interface CodexDriverDiagnostic {
  readonly severity: CodexDriverDiagnosticSeverity;
  readonly code: CodexDriverDiagnosticCode;
  readonly message: string;
  readonly runId?: CodexRunId;
  readonly cause?: unknown;
}

export type CodexDriverDiagnosticListener = (diagnostic: CodexDriverDiagnostic) => void;

export interface CodexRunHandle {
  readonly id: CodexRunId;
  readonly state: CodexRunState;
  readonly pid: number | undefined;
  readonly result: Promise<CodexRunResult>;

  cancel(reason?: string): void;
  kill(signal?: NodeJS.Signals): void;
  onDiagnostic(listener: CodexDriverDiagnosticListener): Disposable;
}

export interface CodexDriver {
  run(input: CodexRunInput): CodexRunHandle;
  dispose(): Promise<void>;
}

export interface CodexDriverOptions {
  readonly runtime: MurasameRuntime;
  readonly executable?: string;
  readonly provider?: string;
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly stderrLimit?: number;
  readonly defaultTimeoutMs?: number;
  readonly gracefulCancelMs?: number;
  readonly onDiagnostic?: CodexDriverDiagnosticListener;
  readonly spawner?: CodexProcessSpawner;
  readonly processSpawner?: CodexProcessSpawner;
  readonly adapterFactory?: CodexAdapterFactory;
  readonly timer?: CodexTimerScheduler;
  readonly now?: () => number;
}

export type CodexAdapterFactory = (options: CodexAdapterOptions) => CodexAdapter;

export interface CodexTimerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CodexSpawnOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly shell: false;
  readonly stdio: readonly ["pipe", "pipe", "pipe"];
}

export interface CodexReadableStream {
  setEncoding?(encoding: "utf8"): void;
  on(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
  once(event: "end" | "close", listener: () => void): unknown;
}

export interface CodexWritableStream {
  write(data: string): boolean;
  end(): void;
  once(event: "error", listener: (error: unknown) => void): unknown;
}

export interface CodexChildProcess {
  readonly pid?: number;
  readonly stdin: CodexWritableStream | null;
  readonly stdout: CodexReadableStream | null;
  readonly stderr: CodexReadableStream | null;

  once(event: "error", listener: (error: unknown) => void): unknown;
  once(
    event: "exit" | "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface CodexProcessSpawner {
  spawn(command: string, args: readonly string[], options: CodexSpawnOptions): CodexChildProcess;
}

export interface InternalCodexRunOptions {
  readonly id: CodexRunId;
  readonly input: CodexRunInput;
  readonly args: readonly string[];
  readonly runtime: MurasameRuntime;
  readonly executable: string;
  readonly provider?: string;
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly stderrLimit: number;
  readonly gracefulCancelMs: number;
  readonly defaultTimeoutMs?: number;
  readonly spawner: CodexProcessSpawner;
  readonly adapterFactory: CodexAdapterFactory;
  readonly timer: CodexTimerScheduler;
  readonly now: () => number;
  readonly emit: (diagnostic: CodexDriverDiagnostic) => void;
  readonly onFinished: () => void;
}
