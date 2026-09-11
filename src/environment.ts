export function buildCodexEnvironment(
  baseEnv?: Readonly<Record<string, string | undefined>>,
  runEnv?: Readonly<Record<string, string | undefined>>,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  applyEnvironment(environment, baseEnv);
  applyEnvironment(environment, runEnv);
  return environment;
}

function applyEnvironment(
  environment: NodeJS.ProcessEnv,
  values: Readonly<Record<string, string | undefined>> | undefined,
): void {
  if (values === undefined) return;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete environment[key];
    } else {
      environment[key] = value;
    }
  }
}
