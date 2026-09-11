import { asSessionId } from "@murasame/protocol";
import { createRuntime } from "@murasame/runtime";
import { createCodexDriver } from "../src/index.ts";

const runtime = createRuntime({
  sessionId: asSessionId("example-codex-multi-run"),
});
const driver = createCodexDriver({ runtime });

const first = driver.run({ prompt: "Reply exactly first" });
const second = driver.run({ prompt: "Reply exactly second" });
const results = await Promise.all([first.result, second.result]);

console.log(
  JSON.stringify(
    {
      results,
      sequences: runtime.events.map((event) => event.sequence),
    },
    null,
    2,
  ),
);
await driver.dispose();
