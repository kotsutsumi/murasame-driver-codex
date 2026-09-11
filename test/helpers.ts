import { asSessionId } from "@murasame/protocol";
import { createRuntime } from "@murasame/runtime";
import type {
  CodexChildProcess,
  CodexProcessSpawner,
  CodexReadableStream,
  CodexSpawnOptions,
  CodexWritableStream,
} from "../src/index.ts";

type Listener = (...args: never[]) => void;

class EventTarget {
  #listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.#listeners.set(event, listeners);
    return this;
  }

  once(event: string, listener: Listener): this {
    const onceListener: Listener = (...args) => {
      this.removeListener(event, onceListener);
      listener(...args);
    };
    return this.on(event, onceListener);
  }

  removeListener(event: string, listener: Listener): this {
    this.#listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: never[]): void {
    for (const listener of [...(this.#listeners.get(event) ?? [])]) listener(...args);
  }
}

export class FakeReadable implements CodexReadableStream {
  readonly target = new EventTarget();
  encoding: "utf8" | undefined;

  setEncoding(encoding: "utf8"): void {
    this.encoding = encoding;
  }

  on(event: "data", listener: (chunk: string | Uint8Array) => void): this {
    this.target.on(event, listener as Listener);
    return this;
  }

  once(event: "end" | "close", listener: () => void): this {
    this.target.once(event, listener as Listener);
    return this;
  }

  push(chunk: string | Uint8Array): void {
    this.target.emit("data", chunk as never);
  }

  end(): void {
    this.target.emit("end");
    this.target.emit("close");
  }
}

export class FakeWritable implements CodexWritableStream {
  readonly target = new EventTarget();
  readonly writes: string[] = [];
  ended = false;

  write(data: string): boolean {
    this.writes.push(data);
    return true;
  }

  end(): void {
    this.ended = true;
  }

  once(event: "error", listener: (error: unknown) => void): this {
    this.target.once(event, listener as Listener);
    return this;
  }

  fail(error: unknown): void {
    this.target.emit("error", error as never);
  }
}

export class FakeChild implements CodexChildProcess {
  readonly target = new EventTarget();
  readonly stdin = new FakeWritable();
  readonly stdout = new FakeReadable();
  readonly stderr = new FakeReadable();
  readonly signals: NodeJS.Signals[] = [];
  readonly pid: number;

  constructor(pid: number) {
    this.pid = pid;
  }

  once(event: "error", listener: (error: unknown) => void): this;
  once(
    event: "exit" | "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  once(event: string, listener: Listener): this {
    this.target.once(event, listener);
    return this;
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this.signals.push(signal);
    return true;
  }

  emitError(error: unknown): void {
    this.target.emit("error", error as never);
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.target.emit("exit", code as never, signal as never);
  }

  emitClose(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.target.emit("close", code as never, signal as never);
  }

  complete(code = 0, signal: NodeJS.Signals | null = null): void {
    this.stdout.end();
    this.stderr.end();
    this.emitExit(code, signal);
    this.emitClose(code, signal);
  }
}

export class FakeSpawner implements CodexProcessSpawner {
  readonly children: FakeChild[] = [];
  readonly calls: Array<{
    command: string;
    args: readonly string[];
    options: CodexSpawnOptions;
  }> = [];

  spawn(command: string, args: readonly string[], options: CodexSpawnOptions): CodexChildProcess {
    const child = new FakeChild(this.children.length + 1);
    this.children.push(child);
    this.calls.push({ command, args: [...args], options });
    return child;
  }
}

export function makeRuntime() {
  return createRuntime({
    sessionId: asSessionId("session-driver-test"),
  });
}
