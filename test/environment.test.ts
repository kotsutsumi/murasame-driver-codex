import { describe, expect, test } from "bun:test";
import { buildCodexEnvironment } from "../src/environment.ts";

describe("buildCodexEnvironment", () => {
  test("merges base and run values and removes undefined overrides", () => {
    const environment = buildCodexEnvironment(
      { MURASAME_DRIVER_BASE: "base", MURASAME_DRIVER_REMOVE: "base" },
      { MURASAME_DRIVER_BASE: "run", MURASAME_DRIVER_REMOVE: undefined },
    );

    expect(environment.MURASAME_DRIVER_BASE).toBe("run");
    expect(environment.MURASAME_DRIVER_REMOVE).toBeUndefined();
  });
});
