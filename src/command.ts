import { CodexRunConfigurationError } from "./errors.ts";
import type { CodexRunInput } from "./types.ts";

/**
 * Builds argv for the current `codex exec` command shape.
 * The prompt is intentionally represented by `-` and is written to stdin by the driver.
 */
export function buildCodexArgs(input: CodexRunInput): readonly string[] {
  const args: string[] = ["exec"];
  if (input.resumeThreadId !== undefined) args.push("resume");
  args.push("--json");

  if (input.model !== undefined) args.push("--model", input.model);
  if (input.sandbox !== undefined) args.push("--sandbox", input.sandbox);
  if (input.approvalPolicy !== undefined) {
    args.push("-c", `approval_policy=${tomlValue(input.approvalPolicy)}`);
  }
  if (input.profile !== undefined) args.push("--profile", input.profile);
  for (const [key, value] of flattenConfig(input.config)) {
    args.push("-c", `${key}=${tomlValue(value)}`);
  }
  for (const image of input.images ?? []) args.push("--image", image);
  if (input.skipGitRepoCheck === true) args.push("--skip-git-repo-check");

  for (const arg of input.extraArgs ?? []) {
    if (isReservedArgument(arg)) {
      throw new CodexRunConfigurationError(`extraArgs cannot override ${arg}`);
    }
    args.push(arg);
  }

  if (input.resumeThreadId !== undefined) {
    args.push(input.resumeThreadId, "-");
  } else {
    args.push("-");
  }
  return Object.freeze(args);
}

function isReservedArgument(arg: string): boolean {
  return arg === "exec" || arg === "resume" || arg === "--json" || arg.startsWith("--json=");
}

function flattenConfig(
  config: Readonly<Record<string, unknown>> | undefined,
): readonly [string, unknown][] {
  if (config === undefined) return [];
  const entries: [string, unknown][] = [];
  visitConfig(config, "", entries);
  return entries;
}

function visitConfig(
  value: Readonly<Record<string, unknown>>,
  prefix: string,
  entries: [string, unknown][],
): void {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (isPlainRecord(child)) {
      visitConfig(child, path, entries);
    } else {
      entries.push([path, child]);
    }
  }
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("value is not serializable");
    return serialized;
  } catch (error) {
    throw new CodexRunConfigurationError(`config value is not serializable: ${String(error)}`);
  }
}
