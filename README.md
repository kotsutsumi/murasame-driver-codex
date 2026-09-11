# @murasame/driver-codex

`@murasame/driver-codex` is the process/control layer for headless Codex CLI
executions.

It launches `codex exec --json`, feeds stdout to `@murasame/adapter-codex`, and
ingests the resulting `MurasameEvent` values into `@murasame/runtime`.

It does not parse Codex semantics itself, render UI, own a PTY, or merge stderr
into the semantic stream.

```text
prompt
  │ stdin
  ▼
codex exec --json
  ├── stdout ──▶ adapter-codex ──▶ runtime
  └── stderr ──▶ bounded diagnostics only
```

## Usage

```ts
import { asSessionId } from "@murasame/protocol"
import { createRuntime } from "@murasame/runtime"
import { createCodexDriver } from "@murasame/driver-codex"

const runtime = createRuntime({
  sessionId: asSessionId("session-1"),
})

const driver = createCodexDriver({ runtime })
const run = driver.run({
  prompt: "Reply exactly hello",
  cwd: process.cwd(),
})

const result = await run.result
console.log(result.status)
console.log(runtime.snapshot().streams)

await driver.dispose()
```

The prompt is sent through stdin and stdin is always closed. `exec` and
`--json` are owned by the driver; `extraArgs` cannot replace them.

The runtime's session-scoped `sequenceProvider` is passed to every adapter
created by this driver. Multiple concurrent runs therefore share one monotonic
event sequence.

## Boundaries and caveats

- Only Codex stdout is a semantic source. stderr is never parsed as JSON and is
  never passed to the adapter.
- The driver uses the headless pipe mode, not the interactive Codex TUI or a
  PTY. Interactive presentation belongs to `pty → vt → vt-terminal`.
- The driver does not read rollout files or enrich missing subagent/unified-tool
  events. If `codex exec --json` does not expose an event, it is not guessed.
- Process-level failures are classified as spawn failure, non-zero exit,
  signal, timeout, or cancellation. Detailed provider semantics remain in the
  adapter.
- A zero-exit process that produced no semantic stdout events is reported as
  `EMPTY_SUCCESSFUL_RUN` and returned as a failed run. This catches silent
  headless executions while preserving the raw stderr for diagnosis.
- Timeout and signal escalation timers are execution controls, not a UI
  scheduler.

## Development

```sh
bun install
bun run check
```

The examples start the locally installed `codex` executable and are intended
for manual smoke tests:

```sh
bun run example:hello
bun run example:tool
bun run example:cancel
bun run example:multi-run
```

Unit tests use an injected process spawner and do not start Codex.

## Non-goals for v0.1

PTY/TUI execution, Codex app-server, rollout enrichment, authentication,
retries, model fallback, quota handling, persistent storage, queues, and UI
rendering are intentionally outside this package.
