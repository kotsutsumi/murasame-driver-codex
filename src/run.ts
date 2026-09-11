import type {
  CodexAdapter,
  CodexAdapterDiagnostic,
  CodexAdapterFinishInput,
} from "@murasame/adapter-codex";
import type { MurasameEvent } from "@murasame/protocol";
import { nextEscalationSignal } from "./cancellation.ts";
import { buildCodexEnvironment } from "./environment.ts";
import { createRunAgentId, createRunTaskId } from "./ids.ts";
import { finalRunStatus, isTerminalRunState } from "./lifecycle.ts";
import { chunkByteLength } from "./process.ts";
import { BoundedTailBuffer } from "./stderr.ts";
import type {
  CodexChildProcess,
  CodexDriverDiagnostic,
  CodexDriverDiagnosticListener,
  CodexRunHandle,
  CodexRunResult,
  CodexRunState,
  Disposable,
  InternalCodexRunOptions,
} from "./types.ts";

type AdapterFinishReason = NonNullable<CodexAdapterFinishInput["reason"]>;

export class InternalCodexRun implements CodexRunHandle {
  readonly id;
  readonly result: Promise<CodexRunResult>;

  #state: CodexRunState = "starting";
  #child: CodexChildProcess | undefined;
  #adapter: CodexAdapter;
  #resolveResult!: (result: CodexRunResult) => void;
  #listeners = new Set<CodexDriverDiagnosticListener>();
  #stderr: BoundedTailBuffer;
  #stdoutDecoder = new TextDecoder();
  #stderrDecoder = new TextDecoder();
  #stdoutEnded = false;
  #stderrEnded = false;
  #processExitKnown = false;
  #exitCode: number | null = null;
  #exitSignal: NodeJS.Signals | null = null;
  #executionFailed = false;
  #cancelRequested = false;
  #terminationRequested = false;
  #cancelReason: string | undefined;
  #finishCalled = false;
  #finalizing = false;
  #finalized = false;
  #timeoutHandle: unknown;
  #escalationHandle: unknown;
  #stdoutBytes = 0;
  #stderrBytes = 0;
  #semanticEventCount = 0;
  #liveSemanticEventCount = 0;
  #startedAt: number;

  constructor(private readonly options: InternalCodexRunOptions) {
    this.id = options.id;
    this.#startedAt = options.now();
    this.#stderr = new BoundedTailBuffer(options.stderrLimit);
    this.#adapter = options.adapterFactory({
      sessionId: options.runtime.sessionId,
      agentId: createRunAgentId(options.id),
      taskId: createRunTaskId(options.id),
      eventIdPrefix: options.id,
      ...(options.provider === undefined ? {} : { provider: options.provider }),
      ...(options.input.model === undefined ? {} : { model: options.input.model }),
      sequenceProvider: options.runtime.sequenceProvider,
      onDiagnostic: (diagnostic) => this.handleAdapterDiagnostic(diagnostic),
    });
    this.result = new Promise<CodexRunResult>((resolve) => {
      this.#resolveResult = resolve;
    });
  }

  get state(): CodexRunState {
    return this.#state;
  }

  get pid(): number | undefined {
    return this.#child?.pid;
  }

  start(): void {
    let child: CodexChildProcess;
    try {
      child = this.options.spawner.spawn(this.options.executable, this.options.args, {
        cwd: this.options.input.cwd ?? process.cwd(),
        env: buildCodexEnvironment(this.options.baseEnv, this.options.input.env),
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      this.report("error", "SPAWN_FAILED", `could not spawn ${this.options.executable}`, error);
      this.#executionFailed = true;
      this.#processExitKnown = true;
      this.#stdoutEnded = true;
      this.#stderrEnded = true;
      this.finalize();
      return;
    }

    this.#child = child;
    this.#state = "running";
    this.attachProcess(child);
    this.writePrompt();
    this.scheduleTimeout();
  }

  cancel(reason = "cancelled"): void {
    if (this.#finalized || this.#cancelRequested) return;
    this.#cancelRequested = true;
    this.#terminationRequested = true;
    this.#cancelReason = reason;
    if (isTerminalRunState(this.#state)) return;
    this.#state = "cancelling";

    if (this.#processExitKnown || this.#child === undefined) {
      this.tryFinalize();
      return;
    }

    this.sendSignal("SIGINT");
    this.scheduleEscalation("SIGTERM");
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    if (this.#finalized) return;
    this.#terminationRequested = true;
    this.#cancelRequested = true;
    this.#cancelReason = `kill:${signal}`;
    if (!isTerminalRunState(this.#state)) this.#state = "cancelling";
    this.clearEscalationTimer();
    if (this.#processExitKnown) {
      this.tryFinalize();
      return;
    }
    this.sendSignal(signal);
  }

  onDiagnostic(listener: CodexDriverDiagnosticListener): Disposable {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    this.#listeners.add(listener);
    let active = true;
    return {
      dispose: () => {
        if (!active) return;
        active = false;
        this.#listeners.delete(listener);
      },
    };
  }

  private attachProcess(child: CodexChildProcess): void {
    child.once("error", (error) => this.handleProcessError(error));
    child.once("exit", (code, signal) => this.handleProcessExit(code, signal));
    child.once("close", (code, signal) => this.handleProcessClose(code, signal));

    if (child.stdout === null) {
      this.#stdoutEnded = true;
    } else {
      this.configureEncoding(child.stdout, "stdout");
      child.stdout.on("data", (chunk) => this.handleStdoutChunk(chunk));
      child.stdout.once("end", () => this.handleStdoutEnd());
      child.stdout.once("close", () => this.handleStdoutEnd());
    }

    if (child.stderr === null) {
      this.#stderrEnded = true;
    } else {
      this.configureEncoding(child.stderr, "stderr");
      child.stderr.on("data", (chunk) => this.handleStderrChunk(chunk));
      child.stderr.once("end", () => this.handleStderrEnd());
      child.stderr.once("close", () => this.handleStderrEnd());
    }
  }

  private configureEncoding(
    stream: NonNullable<CodexChildProcess["stdout"]>,
    name: "stdout" | "stderr",
  ): void {
    if (stream.setEncoding === undefined) return;
    try {
      stream.setEncoding("utf8");
    } catch (error) {
      this.report("warning", "UNEXPECTED_PROCESS_STATE", `could not set ${name} encoding`, error);
    }
  }

  private writePrompt(): void {
    const stdin = this.#child?.stdin;
    if (stdin === null || stdin === undefined) {
      this.handleStdinFailure(new Error("Codex stdin is unavailable"));
      return;
    }
    try {
      stdin.once("error", (error) => this.handleStdinFailure(error));
    } catch (error) {
      this.handleStdinFailure(error);
    }

    try {
      stdin.write(this.options.input.prompt);
    } catch (error) {
      this.report("error", "STDIN_WRITE_FAILED", "could not write the Codex prompt", error);
      this.#executionFailed = true;
    } finally {
      try {
        stdin.end();
      } catch (error) {
        this.handleStdinFailure(error);
      }
    }
    if (this.#executionFailed) this.terminateAfterFailure();
  }

  private scheduleTimeout(): void {
    const timeoutMs = this.options.input.timeoutMs ?? this.options.defaultTimeoutMs;
    if (timeoutMs === undefined) return;
    this.#timeoutHandle = this.options.timer.setTimeout(() => {
      if (this.#finalized || this.#processExitKnown) return;
      this.report("warning", "RUN_TIMEOUT", `Codex run exceeded ${timeoutMs}ms`);
      this.cancel("timeout");
    }, timeoutMs);
  }

  private scheduleEscalation(signal: NodeJS.Signals): void {
    this.clearEscalationTimer();
    this.#escalationHandle = this.options.timer.setTimeout(() => {
      this.#escalationHandle = undefined;
      if (this.#finalized || this.#processExitKnown || !this.#cancelRequested) return;
      const next = nextEscalationSignal(signal === "SIGTERM" ? "SIGTERM" : "SIGKILL");
      this.report(
        "warning",
        "CANCEL_ESCALATED",
        `Codex did not stop after cancellation; sending ${signal}`,
      );
      this.sendSignal(signal);
      if (next !== undefined) this.scheduleEscalation(next);
    }, this.options.gracefulCancelMs);
  }

  private clearTimeout(): void {
    if (this.#timeoutHandle === undefined) return;
    this.options.timer.clearTimeout(this.#timeoutHandle);
    this.#timeoutHandle = undefined;
  }

  private clearEscalationTimer(): void {
    if (this.#escalationHandle === undefined) return;
    this.options.timer.clearTimeout(this.#escalationHandle);
    this.#escalationHandle = undefined;
  }

  private handleStdoutChunk(chunk: string | Uint8Array): void {
    if (this.#finalized) return;
    this.#stdoutBytes += chunkByteLength(chunk);
    const text = this.decodeChunk(chunk, "stdout");
    if (text.length === 0) return;
    try {
      this.ingestAdapterEvents(this.#adapter.push(text), true);
    } catch (error) {
      this.handleAdapterFailure(error);
    }
  }

  private handleStdoutEnd(): void {
    if (this.#stdoutEnded) return;
    this.#stdoutEnded = true;
    const trailing = this.#stdoutDecoder.decode();
    if (trailing.length > 0) {
      try {
        this.ingestAdapterEvents(this.#adapter.push(trailing), true);
      } catch (error) {
        this.handleAdapterFailure(error);
      }
    }
    this.tryFinalize();
  }

  private handleStderrChunk(chunk: string | Uint8Array): void {
    if (this.#finalized) return;
    this.#stderrBytes += chunkByteLength(chunk);
    const text = this.decodeChunk(chunk, "stderr");
    this.appendStderr(text);
  }

  private handleStderrEnd(): void {
    if (this.#stderrEnded) return;
    this.#stderrEnded = true;
    this.appendStderr(this.#stderrDecoder.decode());
  }

  private appendStderr(text: string): void {
    if (!this.#stderr.append(text)) return;
    this.report("warning", "STDERR_TRUNCATED", `Codex stderr exceeded ${this.#stderr.limit} bytes`);
  }

  private decodeChunk(chunk: string | Uint8Array, stream: "stdout" | "stderr"): string {
    if (typeof chunk === "string") return chunk;
    if (stream === "stdout") {
      return this.#stdoutDecoder.decode(chunk, { stream: true });
    }
    return this.#stderrDecoder.decode(chunk, { stream: true });
  }

  private handleProcessError(error: unknown): void {
    if (this.#finalized) return;
    this.#executionFailed = true;
    this.report("error", "SPAWN_FAILED", "Codex process emitted a process error", error);
    if (this.#child?.pid === undefined && !this.#processExitKnown) {
      this.#processExitKnown = true;
      this.#stdoutEnded = true;
      this.#stderrEnded = true;
      this.finalize();
      return;
    }
    this.terminateAfterFailure();
    this.tryFinalize();
  }

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.#processExitKnown) return;
    this.#processExitKnown = true;
    this.#exitCode = code;
    this.#exitSignal = signal;
    if (signal !== null) {
      this.report("warning", "PROCESS_EXITED_BY_SIGNAL", `Codex exited with signal ${signal}`);
    } else if (code !== 0) {
      this.report("error", "PROCESS_EXIT_NON_ZERO", `Codex exited with status ${String(code)}`);
    }
    this.tryFinalize();
  }

  private handleProcessClose(code: number | null, signal: NodeJS.Signals | null): void {
    if (!this.#processExitKnown) this.handleProcessExit(code, signal);
    if (!this.#stdoutEnded) this.handleStdoutEnd();
    if (!this.#stderrEnded) this.handleStderrEnd();
    this.tryFinalize();
  }

  private handleStdinFailure(error: unknown): void {
    if (this.#finalized) return;
    this.#executionFailed = true;
    this.report("error", "STDIN_WRITE_FAILED", "Codex stdin failed", error);
    this.terminateAfterFailure();
  }

  private terminateAfterFailure(): void {
    if (this.#terminationRequested || this.#processExitKnown || this.#child === undefined) return;
    this.#terminationRequested = true;
    this.sendSignal("SIGTERM");
  }

  private sendSignal(signal: NodeJS.Signals): void {
    if (this.#child === undefined || this.#processExitKnown) return;
    try {
      this.#child.kill(signal);
    } catch (error) {
      this.report("error", "UNEXPECTED_PROCESS_STATE", `could not send ${signal} to Codex`, error);
    }
  }

  private handleAdapterDiagnostic(diagnostic: CodexAdapterDiagnostic): void {
    this.report("info", "ADAPTER_DIAGNOSTIC", "Codex adapter reported a diagnostic", diagnostic);
  }

  private handleAdapterFailure(error: unknown): void {
    if (this.#finalized) return;
    this.#executionFailed = true;
    this.report("error", "ADAPTER_FAILURE", "Codex adapter failed while consuming stdout", error);
    this.terminateAfterFailure();
  }

  private ingestAdapterEvents(events: readonly MurasameEvent[], live: boolean): void {
    if (events.length === 0) return;
    this.#semanticEventCount += events.length;
    if (live) this.#liveSemanticEventCount += events.length;
    try {
      const result = this.options.runtime.ingestMany(events);
      if (result.rejected > 0) {
        this.report(
          "warning",
          "RUNTIME_EVENT_REJECTED",
          `${result.rejected} Codex event(s) were rejected by runtime`,
          result.diagnostics,
        );
      }
    } catch (error) {
      this.#executionFailed = true;
      this.report("error", "RUNTIME_EVENT_REJECTED", "runtime rejected Codex events", error);
      this.terminateAfterFailure();
    }
  }

  private tryFinalize(): void {
    if (!this.#processExitKnown || !this.#stdoutEnded) return;
    this.finalize();
  }

  private finalize(): void {
    if (this.#finalized || this.#finalizing) return;
    this.#finalizing = true;
    this.clearTimeout();
    this.clearEscalationTimer();

    try {
      try {
        this.ingestAdapterEvents(this.#adapter.flush(), true);
      } catch (error) {
        this.handleAdapterFailure(error);
      }

      const emptySuccessfulRun =
        !this.#cancelRequested &&
        !this.#executionFailed &&
        this.#exitCode === 0 &&
        this.#exitSignal === null &&
        this.#liveSemanticEventCount === 0;
      if (emptySuccessfulRun) {
        this.#executionFailed = true;
        this.report(
          "error",
          "EMPTY_SUCCESSFUL_RUN",
          "Codex exited successfully without producing semantic stdout events",
        );
      }

      const reason: AdapterFinishReason = this.#cancelRequested
        ? "cancelled"
        : this.#executionFailed || this.#exitCode !== 0 || this.#exitSignal !== null
          ? "failed"
          : "completed";
      if (!this.#finishCalled) {
        this.#finishCalled = true;
        try {
          this.ingestAdapterEvents(
            this.#adapter.finish({
              ...(this.#exitCode === null ? {} : { exitCode: this.#exitCode }),
              signal: this.#exitSignal,
              reason,
            }),
            false,
          );
        } catch (error) {
          this.#executionFailed = true;
          this.report(
            "error",
            "ADAPTER_FAILURE",
            "Codex adapter failed during finalization",
            error,
          );
        }
      }

      let threadId: string | undefined;
      try {
        threadId = this.#adapter.context.codexThreadId;
      } catch (error) {
        this.#executionFailed = true;
        this.report("error", "ADAPTER_FAILURE", "could not read Codex adapter context", error);
      }
      const status = finalRunStatus({
        cancelRequested: this.#cancelRequested,
        executionFailed: this.#executionFailed,
        exitCode: this.#exitCode,
        exitSignal: this.#exitSignal,
      });
      const finishedAt = Math.max(this.options.now(), this.#startedAt);
      const result: CodexRunResult = Object.freeze({
        runId: this.id,
        status,
        exitCode: this.#exitCode,
        signal: this.#exitSignal,
        ...(this.#cancelReason === undefined ? {} : { cancelReason: this.#cancelReason }),
        ...(threadId === undefined ? {} : { threadId }),
        stderr: this.#stderr.value,
        startedAt: this.#startedAt,
        finishedAt,
        durationMs: finishedAt - this.#startedAt,
        stdoutBytes: this.#stdoutBytes,
        stderrBytes: this.#stderrBytes,
        semanticEventCount: this.#semanticEventCount,
      });
      this.#state = status;
      this.#finalized = true;
      this.#resolveResult(result);
      this.options.onFinished();
    } finally {
      this.#finalizing = false;
    }
  }

  private report(
    severity: CodexDriverDiagnostic["severity"],
    code: CodexDriverDiagnostic["code"],
    message: string,
    cause?: unknown,
  ): void {
    const diagnostic: CodexDriverDiagnostic = Object.freeze({
      severity,
      code,
      message,
      runId: this.id,
      ...(cause === undefined ? {} : { cause }),
    });
    try {
      this.options.emit(diagnostic);
    } catch {
      // Diagnostics must not destabilize the process-control path.
    }
    for (const listener of [...this.#listeners]) {
      try {
        listener(diagnostic);
      } catch {
        // A run-local diagnostic listener is observational only.
      }
    }
  }
}

export function createInternalCodexRun(options: InternalCodexRunOptions): InternalCodexRun {
  return new InternalCodexRun(options);
}
