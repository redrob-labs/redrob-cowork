import { describe, expect, test } from "bun:test";

import { resolveRedrobCodeCommand } from "../scripts/_util.mjs";

describe("Redrob Code smoke command", () => {
  test("uses the explicit binary and never falls back to upstream OpenCode", () => {
    expect(resolveRedrobCodeCommand({ REDROB_CODE_BIN: "/opt/redrob" })).toBe("/opt/redrob");
    expect(resolveRedrobCodeCommand({ REDROB_CODE_BIN: "  " })).toBe("redrob");
    expect(resolveRedrobCodeCommand({ OPENCODE_BIN: "/opt/opencode" })).toBe("redrob");
  });
});
