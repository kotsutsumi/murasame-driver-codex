import { createCodexAdapter } from "@murasame/adapter-codex";
import { buildCodexArgs } from "./command.ts";
import { CodexDriverDisposedError } from "./errors.ts";
import { createCodexRunId } from "./ids.ts";
import { defaultTimer } from "./process.ts";
import { createInternalCodexRun, type InternalCodexRun } from "./run.ts";
import { nodeProcessSpawner } from "./spawner.ts";
import type {
  CodexAdapterFactory,
  CodexDriver,
  CodexDriverDiagnostic,
  CodexDriverOptions,
  CodexProcessSpawner,
  CodexRunHandle,
  CodexRunInput,
} from "./types.ts";
import { validateDriverOptions, validateRunInput } from "./validation.ts";

const DEFAULT_STDERR_LIMIT = 1024 * 1024;
const DEFAULT_GRACEFUL_CANCEL_MS = 2_000;

export function createCodexDriver(options: CodexDriverOptions): CodexDriver {
  return new CodexDriverImpl(options);
}

class CodexDriverImpl implements CodexDriver {
  #disposed = false;
  #nextRun = 1;
  #runs = new Map<string, InternalCodexRun>();
  #onDiagnostic: CodexDriverOptions["onDiagnostic"];
  #runtime: CodexDriverOptions["runtime"];
  #executable: string;
  #provider: string | undefined;
  #baseEnv: CodexDriverOptions["baseEnv"];
  #stderrLimit: number;
  #defaultTimeoutMs: number | undefined;
  #gracefulCancelMs: number;
  #spawner: CodexProcessSpawner;
  #adapterFactory: CodexAdapterFactory;
  #timer: NonNullable<CodexDriverOptions["timer"]>;
  #now: () => number;

  constructor(options: CodexDriverOptions) {
    if (options.runtime === undefined || options.runtime === null) {
      throw new TypeError("runtime is required");
    }
    validateDriverOptions(options);
    this.#runtime = options.runtime;
    this.#onDiagnostic = options.onDiagnostic;
    this.#executable = options.executable ?? "codex";
    this.#provider = options.provider;
    this.#baseEnv = options.baseEnv;
    this.#stderrLimit = options.stderrLimit ?? DEFAULT_STDERR_LIMIT;
    this.#defaultTimeoutMs = options.defaultTimeoutMs;
    this.#gracefulCancelMs = options.gracefulCancelMs ?? DEFAULT_GRACEFUL_CANCEL_MS;
    this.#spawner = options.spawner ?? options.processSpawner ?? nodeProcessSpawner;
    this.#adapterFactory = options.adapterFactory ?? createCodexAdapter;
    this.#timer = options.timer ?? defaultTimer;
    this.#now = options.now ?? Date.now;
  }

  run(input: CodexRunInput): CodexRunHandle {
    this.ensureActive();
    validateRunInput(input);
    const args = buildCodexArgs(input);
    const id = createCodexRunId(this.#nextRun);
    this.#nextRun += 1;
    const run = createInternalCodexRun({
      id,
      input,
      args,
      runtime: this.#runtime,
      executable: this.#executable,
      ...(this.#provider === undefined ? {} : { provider: this.#provider }),
      ...(this.#baseEnv === undefined ? {} : { baseEnv: this.#baseEnv }),
      stderrLimit: this.#stderrLimit,
      ...(this.#defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs: this.#defaultTimeoutMs }),
      gracefulCancelMs: this.#gracefulCancelMs,
      spawner: this.#spawner,
      adapterFactory: this.#adapterFactory,
      timer: this.#timer,
      now: this.#now,
      emit: (diagnostic) => this.report(diagnostic),
      onFinished: () => this.#runs.delete(id),
    });
    this.#runs.set(id, run);
    run.start();
    return run;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.report({
      severity: "info",
      code: "DRIVER_DISPOSED",
      message: "Codex driver is disposing active runs",
    });
    const activeRuns = [...this.#runs.values()];
    for (const run of activeRuns) run.cancel("driver-dispose");
    await Promise.all(activeRuns.map((run) => run.result));
  }

  private ensureActive(): void {
    if (this.#disposed) throw new CodexDriverDisposedError("Codex driver has been disposed");
  }

  private report(diagnostic: CodexDriverDiagnostic): void {
    try {
      this.#onDiagnostic?.(diagnostic);
    } catch {
      // A driver diagnostic listener must not break process control.
    }
  }
}
