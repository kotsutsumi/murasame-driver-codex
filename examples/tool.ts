import { asSessionId } from "@murasame/protocol";
import { createRuntime } from "@murasame/runtime";
import { createCodexDriver } from "../src/index.ts";

const runtime = createRuntime({
  sessionId: asSessionId("example-codex-tool"),
});
const driver = createCodexDriver({ runtime });

const run = driver.run({
  prompt: "List the files in the current directory, then reply DONE.",
  cwd: process.cwd(),
});
const result = await run.result;

console.log(JSON.stringify({ result, tools: runtime.snapshot().tools }, null, 2));
await driver.dispose();
