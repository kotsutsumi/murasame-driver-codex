import { describe, expect, test } from "bun:test";
import { createCodexDriver } from "../src/index.ts";
import { FakeSpawner, makeRuntime } from "./helpers.ts";

describe("stderr capture", () => {
  test("retains only a bounded tail and reports truncation once", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const diagnostics: string[] = [];
    const driver = createCodexDriver({
      runtime,
      spawner,
      stderrLimit: 5,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stderr.push("0123456789");
    child.complete(1);

    const result = await run.result;
    expect(new TextEncoder().encode(result.stderr).byteLength).toBeLessThanOrEqual(5);
    expect(result.stderr).toBe("56789");
    expect(diagnostics.filter((code) => code === "STDERR_TRUNCATED")).toHaveLength(1);
    await driver.dispose();
  });
});
