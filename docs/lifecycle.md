# Run lifecycle

```text
starting
   │ spawn succeeds
   ▼
running ── cancel/timeout ──▶ cancelling
   │                              │
   ├─ exit 0 + semantic output ───┘ completed
   ├─ non-zero / signal ──────────┘ failed
   └─ requested termination ──────┘ cancelled
```

The semantic close order is always:

1. drain stdout and stderr;
2. call `adapter.flush()`;
3. call `adapter.finish()` exactly once;
4. ingest both event batches into the runtime;
5. resolve `run.result`.

`task.finished` and `agent.finished` are therefore emitted by the adapter before
the run result is resolved. `agent.finished` is not emitted merely because a
process exit notification arrived; it is emitted during adapter finalization.

Cancellation is idempotent. The default escalation is SIGINT, then SIGTERM,
then SIGKILL, with two seconds between stages. A timeout requests cancellation
with reason `timeout`. `dispose()` requests cancellation for every active run.
