import { CodexRunConfigurationError } from "./errors.ts";
import type { CodexDriverOptions, CodexRunInput } from "./types.ts";

export function validateDriverOptions(options: CodexDriverOptions): void {
  if (options.executable !== undefined && options.executable.trim().length === 0) {
    throw new CodexRunConfigurationError("executable must not be empty");
  }
  validateNonNegativeInteger(options.stderrLimit, "stderrLimit");
  validateNonNegativeInteger(options.defaultTimeoutMs, "defaultTimeoutMs");
  validateNonNegativeInteger(options.gracefulCancelMs, "gracefulCancelMs");
}

export function validateRunInput(input: CodexRunInput): void {
  if (typeof input.prompt !== "string" || input.prompt.length === 0) {
    throw new CodexRunConfigurationError("prompt must be a non-empty string");
  }
  validateNonNegativeInteger(input.timeoutMs, "timeoutMs");
  if (input.cwd !== undefined && input.cwd.length === 0) {
    throw new CodexRunConfigurationError("cwd must not be empty");
  }
  if (input.model !== undefined && input.model.length === 0) {
    throw new CodexRunConfigurationError("model must not be empty");
  }
  if (input.resumeThreadId !== undefined && input.resumeThreadId.length === 0) {
    throw new CodexRunConfigurationError("resumeThreadId must not be empty");
  }
  for (const [index, image] of (input.images ?? []).entries()) {
    if (image.length === 0)
      throw new CodexRunConfigurationError(`images[${index}] must not be empty`);
  }
  for (const [index, arg] of (input.extraArgs ?? []).entries()) {
    if (arg.length === 0)
      throw new CodexRunConfigurationError(`extraArgs[${index}] must not be empty`);
    if (arg === "exec" || arg === "resume" || arg === "--json" || arg.startsWith("--json=")) {
      throw new CodexRunConfigurationError(
        `extraArgs[${index}] attempts to override a reserved Codex argument`,
      );
    }
  }
}

function validateNonNegativeInteger(value: number | undefined, name: string): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CodexRunConfigurationError(`${name} must be a non-negative safe integer`);
  }
}
