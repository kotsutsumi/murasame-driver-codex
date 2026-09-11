# Codex CLI transport contract

The v0.1 driver invokes:

```text
codex exec --json [options]
```

The prompt is written to stdin, followed by `stdin.end()`. The driver uses
`spawn()` with `shell: false` and three pipes. It never constructs a shell
command string.

## Known limitations

- stdout is the only semantic source; stderr is diagnostic text only. A JSON
  object printed in stderr is deliberately ignored by the adapter pipeline.
- Codex JSONL may omit some internal subagent or unified-tool events. The driver
  does not inspect rollout files or infer missing graph edges.
- The JSONL projection may not preserve every typed provider error. The driver
  limits its process-level classification to spawn errors, exit code, signal,
  timeout, and cancellation.
- Headless or detached environments can produce an exit-0 run with no stdout.
  The driver reports `EMPTY_SUCCESSFUL_RUN` and marks that run failed.
- Long-running coding tasks have no default timeout. Callers can set
  `timeoutMs` or provide an outer watchdog.

Interactive Codex output is a separate presentation path:

```text
interactive codex → @murasame/pty → @murasame/vt → @murasame/vt-terminal
```

The app-server, rollout JSONL enrichment, and authentication configuration are
future driver backends or host responsibilities, not part of this v0.1
transport.
