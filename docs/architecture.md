# Driver architecture

`@murasame/driver-codex` is a transport/control layer around one headless
Codex execution.

```text
Murasame task
     │
     ▼
CodexDriver
     │ spawn (shell=false)
     ▼
codex exec --json
     ├─ stdin  ◀─ prompt
     ├─ stdout ──▶ CodexAdapter.push()
     │                    │
     │                    ▼
     │              MurasameEvent[]
     │                    │
     │                    ▼
     │              Runtime.ingestMany()
     └─ stderr ──▶ bounded diagnostic tail

stdout EOF + process exit
     │
     ├─ adapter.flush()  ──▶ runtime
     └─ adapter.finish() ──▶ runtime
             │
             ▼
        CodexRunResult
```

The driver never inspects a decoded Codex event. It only counts adapter output,
forwards adapter diagnostics, and reads the adapter context for the resulting
thread ID. Semantic mapping remains in `@murasame/adapter-codex`.

Each `run()` creates one adapter and one MURASAME agent/task identity. All runs
created by a driver use the runtime's session-scoped sequence provider.

The process finalization barrier waits for process exit and stdout EOF before
calling `flush()` and `finish()`. This prevents an exit event from racing the
last JSONL bytes.
