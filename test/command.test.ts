import { describe, expect, test } from "bun:test";
import { buildCodexArgs } from "../src/index.ts";

describe("buildCodexArgs", () => {
  test("uses headless JSON mode and stdin without putting the prompt in argv", () => {
    const args = buildCodexArgs({ prompt: "line one\nline two" });

    expect(args).toEqual(["exec", "--json", "-"]);
    expect(args).not.toContain("line one\nline two");
  });

  test("maps execution options to the current Codex CLI shape", () => {
    const args = buildCodexArgs({
      prompt: "hello",
      model: "gpt-test",
      sandbox: "workspace-write",
      approvalPolicy: "never",
      profile: "ci",
      config: {
        features: { unified_exec: true },
        retries: 2,
      },
      images: ["a.png", "b.png"],
      skipGitRepoCheck: true,
      extraArgs: ["--ephemeral"],
    });

    expect(args).toEqual([
      "exec",
      "--json",
      "--model",
      "gpt-test",
      "--sandbox",
      "workspace-write",
      "-c",
      'approval_policy="never"',
      "--profile",
      "ci",
      "-c",
      "features.unified_exec=true",
      "-c",
      "retries=2",
      "--image",
      "a.png",
      "--image",
      "b.png",
      "--skip-git-repo-check",
      "--ephemeral",
      "-",
    ]);
  });

  test("places resume before the session id and reads the new prompt from stdin", () => {
    const args = buildCodexArgs({
      prompt: "continue",
      resumeThreadId: "thread-1",
    });

    expect(args).toEqual(["exec", "resume", "--json", "thread-1", "-"]);
  });

  test("does not allow extra args to replace the semantic protocol flag", () => {
    expect(() => buildCodexArgs({ prompt: "hello", extraArgs: ["--json"] })).toThrow();
    expect(() => buildCodexArgs({ prompt: "hello", extraArgs: ["exec"] })).toThrow();
  });
});
