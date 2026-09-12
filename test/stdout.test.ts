import { describe, expect, test } from "bun:test";
import { createCodexDriver } from "../src/index.ts";
import { FakeSpawner, makeRuntime } from "./helpers.ts";

describe("stdout pipeline", () => {
  test("does not parse JSON-looking stderr as semantic input", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({ runtime, spawner });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    const stderrFixture = await Bun.file(
      new URL("./fixtures/stderr-json.txt", import.meta.url),
    ).text();
    child.stderr.push(stderrFixture);
    child.stdout.push(`${JSON.stringify({ type: "thread.started", thread_id: "thread-1" })}\n`);
    child.complete();

    const result = await run.result;
    expect(result.stderr).toContain('"type":"turn.started"');
    expect(runtime.snapshot().tasks).toHaveLength(1);
    await driver.dispose();
  });

  test("keeps stdout byte counts and passes trailing unterminated JSON to flush", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({ runtime, spawner });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    const line = JSON.stringify({ type: "thread.started", thread_id: "thread-1" });
    child.stdout.push(line);
    child.complete();

    const result = await run.result;
    expect(result.stdoutBytes).toBe(new TextEncoder().encode(line).byteLength);
    expect(result.status).toBe("completed");
    await driver.dispose();
  });

  test("waits for stderr drain before resolving the run", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({ runtime, spawner });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stdout.end();
    child.emitExit(2);
    let resolved = false;
    const resultPromise = run.result.then((result) => {
      resolved = true;
      return result;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    child.stderr.push("late diagnostic");
    child.stderr.end();
    child.emitClose(2);

    const result = await resultPromise;
    expect(result.stderr).toBe("late diagnostic");
    await driver.dispose();
  });
});
