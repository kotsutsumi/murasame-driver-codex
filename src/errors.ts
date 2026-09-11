export class CodexDriverError extends Error {
  override readonly name: string = "CodexDriverError";
}

export class CodexDriverDisposedError extends CodexDriverError {
  override readonly name = "CodexDriverDisposedError";
}

export class CodexSpawnError extends CodexDriverError {
  override readonly name = "CodexSpawnError";
}

export class CodexRunConfigurationError extends CodexDriverError {
  override readonly name = "CodexRunConfigurationError";
}
