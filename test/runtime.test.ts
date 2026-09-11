import { describe, expect, test } from "bun:test";
import { type CodexAdapter, createCodexAdapter } from "@murasame/adapter-codex";
import { createCodexDriver } from "../src/index.ts";
import { FakeSpawner, makeRuntime } from "./helpers.ts";

function thread(id: string): string {
  return `${JSON.stringify({ type: "thread.started", thread_id: id })}\n`;
}

describe("runtime integration", () => {
  test("shares one session sequence across concurrent runs", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({ runtime, spawner });
    const first = driver.run({ prompt: "first" });
    const second = driver.run({ prompt: "second" });

    spawner.children[0]?.stdout.push(thread("thread-1"));
    spawner.children[1]?.stdout.push(thread("thread-2"));
    spawner.children[1]?.complete();
    spawner.children[0]?.complete();

    expect((await first.result).status).toBe("completed");
    expect((await second.result).status).toBe("completed");
    const sequences = runtime.events.map((event) => event.sequence);
    expect(sequences).toEqual(sequences.map((_, index) => index + 1));
    expect(runtime.snapshot().agents).toHaveLength(2);
    await driver.dispose();
  });

  test("keeps adapter/runtime failures on the failed run path", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({
      runtime,
      spawner,
      adapterFactory: () => {
        throw new Error("adapter construction failed");
      },
    });

    expect(() => driver.run({ prompt: "hello" })).toThrow("adapter construction failed");
    expect(spawner.children).toHaveLength(0);
    await driver.dispose();
  });

  test("terminates the process when adapter consumption fails", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({
      runtime,
      spawner,
      adapterFactory: (options): CodexAdapter => {
        const adapter = createCodexAdapter(options);
        return {
          accept: adapter.accept.bind(adapter),
          push: () => {
            throw new Error("adapter push failed");
          },
          pushLine: adapter.pushLine.bind(adapter),
          flush: adapter.flush.bind(adapter),
          finish: adapter.finish.bind(adapter),
          reset: adapter.reset.bind(adapter),
          get context() {
            return adapter.context;
          },
          get unknownEvents() {
            return adapter.unknownEvents;
          },
        };
      },
    });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stdout.push("not-json\n");
    expect(child.signals).toEqual(["SIGTERM"]);
    child.complete(143, "SIGTERM");

    expect((await run.result).status).toBe("failed");
    await driver.dispose();
  });
});
