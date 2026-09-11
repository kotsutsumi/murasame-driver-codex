import { describe, expect, test } from "bun:test";
import { type CodexTimerScheduler, createCodexDriver } from "../src/index.ts";
import { FakeSpawner, makeRuntime } from "./helpers.ts";

class ManualTimer implements CodexTimerScheduler {
  #next = 1;
  readonly callbacks = new Map<number, () => void>();

  setTimeout(callback: () => void): number {
    const id = this.#next;
    this.#next += 1;
    this.callbacks.set(id, callback);
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === "number") this.callbacks.delete(handle);
  }

  fireNext(): void {
    const id = this.callbacks.keys().next().value as number | undefined;
    if (id === undefined) throw new Error("no timer is pending");
    const callback = this.callbacks.get(id);
    this.callbacks.delete(id);
    callback?.();
  }
}

describe("cancellation and timeout", () => {
  test("sends SIGINT and returns cancelled when the process exits during grace", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({ runtime, spawner, gracefulCancelMs: 20 });
    const run = driver.run({ prompt: "long task" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    run.cancel("user-request");
    child.complete(130, "SIGINT");

    const result = await run.result;
    expect(result.status).toBe("cancelled");
    expect(result.cancelReason).toBe("user-request");
    expect(child.signals).toEqual(["SIGINT"]);
    await driver.dispose();
  });

  test("escalates SIGINT to SIGTERM and SIGKILL without duplicate chains", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const timer = new ManualTimer();
    const driver = createCodexDriver({ runtime, spawner, timer, gracefulCancelMs: 1 });
    const run = driver.run({ prompt: "long task" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    run.cancel();
    run.cancel();
    expect(child.signals).toEqual(["SIGINT"]);
    timer.fireNext();
    expect(child.signals).toEqual(["SIGINT", "SIGTERM"]);
    timer.fireNext();
    expect(child.signals).toEqual(["SIGINT", "SIGTERM", "SIGKILL"]);

    child.complete(137, "SIGKILL");
    expect((await run.result).status).toBe("cancelled");
    await driver.dispose();
  });

  test("turns timeout into cancellation and does not schedule a UI loop", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const timer = new ManualTimer();
    const diagnostics: string[] = [];
    const driver = createCodexDriver({
      runtime,
      spawner,
      timer,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const run = driver.run({ prompt: "long task", timeoutMs: 100 });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    timer.fireNext();
    expect(diagnostics).toContain("RUN_TIMEOUT");
    expect(child.signals).toEqual(["SIGINT"]);
    child.complete(130, "SIGINT");

    expect((await run.result).status).toBe("cancelled");
    await driver.dispose();
  });
});
