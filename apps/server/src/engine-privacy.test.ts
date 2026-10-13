import { describe, expect, test } from "bun:test";

import { deskPrivacyLevel, engineModeForLevel, syncEnginePrivacy } from "./engine-privacy.js";
import { ApiError } from "./errors.js";

describe("engine privacy bridge", () => {
  test("maps every Desk level to the engine's switch, Standard where nothing is set", () => {
    expect(deskPrivacyLevel({})).toBe("standard");
    expect(deskPrivacyLevel({ deskPrivacy: { level: "nonsense" } })).toBe("standard");
    expect(deskPrivacyLevel({ deskPrivacy: { level: "strict" } })).toBe("strict");
    expect(engineModeForLevel("off")).toBe("off");
    expect(engineModeForLevel("standard")).toBe("regex");
    expect(engineModeForLevel("high")).toBe("model");
    expect(engineModeForLevel("strict")).toBe("model");
  });

  test("refuses with 503 when the engine is not reachable, so no level is stored unenforced", async () => {
    const input = { config: { workspaces: [] } as never };
    await expect(syncEnginePrivacy(input, { deskPrivacy: { level: "high" } })).rejects.toBeInstanceOf(ApiError);
    await expect(syncEnginePrivacy(input, { deskPrivacy: { level: "high" } })).rejects.toMatchObject({ status: 503 });
  });
});
