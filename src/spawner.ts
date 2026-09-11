import { spawn as nodeSpawn } from "node:child_process";
import type { CodexChildProcess, CodexProcessSpawner, CodexSpawnOptions } from "./types.ts";

export const nodeProcessSpawner: CodexProcessSpawner = {
  spawn(command: string, args: readonly string[], options: CodexSpawnOptions): CodexChildProcess {
    return nodeSpawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }) as unknown as CodexChildProcess;
  },
};
