import { asSessionId } from "@murasame/protocol";
import { createRuntime } from "@murasame/runtime";
import { createCodexDriver } from "../src/index.ts";

const runtime = createRuntime({
  sessionId: asSessionId("example-codex-cancel"),
});
const driver = createCodexDriver({ runtime });
const run = driver.run({
  prompt: "Inspect this repository in detail and explain what you find.",
  cwd: process.cwd(),
});

const cancelTimer = setTimeout(() => run.cancel("example-timeout"), 1_000);
const result = await run.result;
clearTimeout(cancelTimer);

console.log(JSON.stringify({ result, snapshot: runtime.snapshot() }, null, 2));
await driver.dispose();
