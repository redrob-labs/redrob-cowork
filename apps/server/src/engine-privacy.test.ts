import { describe, expect, test } from "bun:test";

import { coworkPrivacyLevel, engineModeForLevel, syncEnginePrivacy } from "./engine-privacy.js";
import { ApiError } from "./errors.js";

describe("engine privacy bridge", () => {
  test("maps every Cowork level to the engine's switch, Standard where nothing is set", () => {
    expect(coworkPrivacyLevel({})).toBe("standard");
    expect(coworkPrivacyLevel({ coworkPrivacy: { level: "nonsense" } })).toBe("standard");
    expect(coworkPrivacyLevel({ coworkPrivacy: { level: "strict" } })).toBe("strict");
    expect(engineModeForLevel("off")).toBe("off");
    expect(engineModeForLevel("standard")).toBe("regex");
    expect(engineModeForLevel("high")).toBe("model");
    expect(engineModeForLevel("strict")).toBe("model");
  });

  test("refuses with 503 when the engine is not reachable, so no level is stored unenforced", async () => {
    const input = { config: { workspaces: [] } as never };
    await expect(syncEnginePrivacy(input, { coworkPrivacy: { level: "high" } })).rejects.toBeInstanceOf(ApiError);
    await expect(syncEnginePrivacy(input, { coworkPrivacy: { level: "high" } })).rejects.toMatchObject({ status: 503 });
  });
});
