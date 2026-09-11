import type { AgentId, TaskId } from "@murasame/protocol";
import { asAgentId, asTaskId } from "@murasame/protocol";
import type { CodexRunId } from "./types.ts";

export function asCodexRunId(value: string): CodexRunId {
  if (value.length === 0) throw new TypeError("CodexRunId must not be empty");
  return value as CodexRunId;
}

export function createCodexRunId(sequence: number): CodexRunId {
  return asCodexRunId(`codex-run-${sequence}`);
}

export function createRunAgentId(runId: CodexRunId): AgentId {
  return asAgentId(`agent_codex_run_${runId}`);
}

export function createRunTaskId(runId: CodexRunId): TaskId {
  return asTaskId(`task_codex_run_${runId}`);
}
