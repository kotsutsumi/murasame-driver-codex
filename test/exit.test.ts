import { describe, expect, test } from "bun:test";
import { createCodexDriver } from "../src/index.ts";
import { FakeSpawner, makeRuntime } from "./helpers.ts";

describe("process exit", () => {
  test("returns failed for a non-zero exit and finalizes the adapter", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const diagnostics: string[] = [];
    const driver = createCodexDriver({
      runtime,
      spawner,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");
    child.stdout.push(`${JSON.stringify({ type: "thread.started", thread_id: "thread-1" })}\n`);
    child.complete(2);

    const result = await run.result;
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(2);
    expect(diagnostics).toContain("PROCESS_EXIT_NON_ZERO");
    expect(runtime.snapshot().tasks[0]?.status).toBe("failed");
    await driver.dispose();
  });

  test("classifies an unrequested signal as failed", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createCodexDriver({ runtime, spawner });
    const run = driver.run({ prompt: "hello" });
    spawner.children[0]?.complete(130, "SIGTERM");

    const result = await run.result;
    expect(result.status).toBe("failed");
    expect(result.signal).toBe("SIGTERM");
    await driver.dispose();
  });
});
