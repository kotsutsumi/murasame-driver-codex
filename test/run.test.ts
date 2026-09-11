import { describe, expect, test } from "bun:test";
import { createCodexDriver } from "../src/index.ts";
import { FakeSpawner, makeRuntime } from "./helpers.ts";

const THREAD = JSON.stringify({ type: "thread.started", thread_id: "thread-1" });
const TURN = JSON.stringify({ type: "turn.started" });
const MESSAGE = JSON.stringify({
  type: "item.completed",
  item: { id: "message-1", type: "agent_message", text: "hello" },
});
const DONE = JSON.stringify({
  type: "turn.completed",
  usage: { input_tokens: 3, output_tokens: 2 },
});

function stream(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

describe("CodexDriver run", () => {
  test("feeds stdout through the adapter into runtime and closes stdin", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const diagnostics: string[] = [];
    const driver = createCodexDriver({
      runtime,
      executable: "codex-test",
      spawner,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stdout.push(stream(THREAD, TURN, MESSAGE, DONE));
    child.complete();

    const result = await run.result;
    const snapshot = runtime.snapshot();
    expect(result.status).toBe("completed");
    expect(result.threadId).toBe("thread-1");
    expect(child.stdin.writes).toEqual(["hello"]);
    expect(child.stdin.ended).toBe(true);
    expect(spawner.calls[0]?.command).toBe("codex-test");
    expect(spawner.calls[0]?.options.shell).toBe(false);
    expect(spawner.calls[0]?.options.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(snapshot.streams[0]?.text).toBe("hello");
    expect(snapshot.tasks[0]?.status).toBe("completed");
    expect(snapshot.agents[0]?.status).toBe("completed");
    expect(diagnostics).not.toContain("RUNTIME_EVENT_REJECTED");

    await driver.dispose();
  });

  test("is independent of stdout JSONL chunk boundaries", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({ runtime, spawner });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    const data = stream(THREAD, TURN, MESSAGE, DONE);
    for (const character of data) child.stdout.push(character);
    child.complete();

    const result = await run.result;
    expect(result.status).toBe("completed");
    expect(runtime.snapshot().streams[0]?.text).toBe("hello");
    await driver.dispose();
  });

  test("replays the sanitized JSONL fixture through the real adapter", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({ runtime, spawner });
    const run = driver.run({ prompt: "fixture prompt" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    const fixture = await Bun.file(new URL("./fixtures/simple.jsonl", import.meta.url)).text();
    child.stdout.push(fixture);
    child.complete();

    expect((await run.result).status).toBe("completed");
    expect(runtime.snapshot().streams[0]?.text).toBe("hello from fixture");
    await driver.dispose();
  });

  test("returns failed for a spawn failure without throwing from run", async () => {
    const runtime = makeRuntime();
    const driver = createCodexDriver({
      runtime,
      spawner: {
        spawn() {
          throw new Error("ENOENT");
        },
      },
    });
    const run = driver.run({ prompt: "hello" });

    expect(run.state).toBe("failed");
    const result = await run.result;
    expect(result.status).toBe("failed");
    await driver.dispose();
  });

  test("detects a silent zero-exit process", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const diagnostics: string[] = [];
    const driver = createCodexDriver({
      runtime,
      spawner,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const run = driver.run({ prompt: "hello" });
    spawner.children[0]?.complete();

    const result = await run.result;
    expect(result.status).toBe("failed");
    expect(diagnostics).toContain("EMPTY_SUCCESSFUL_RUN");
    await driver.dispose();
  });
});
