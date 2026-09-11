import { asSessionId } from "@murasame/protocol";
import { createRuntime } from "@murasame/runtime";
import { createCodexDriver } from "../src/index.ts";

const runtime = createRuntime({
  sessionId: asSessionId("example-codex-hello"),
});
const driver = createCodexDriver({
  runtime,
  onDiagnostic: (diagnostic) => console.error(`[${diagnostic.code}] ${diagnostic.message}`),
});

const run = driver.run({
  prompt: "Reply exactly hello",
  cwd: process.cwd(),
});
const result = await run.result;

console.log(JSON.stringify({ result, snapshot: runtime.snapshot().streams }, null, 2));
await driver.dispose();
