import { describe, expect, test } from "bun:test";
import { redrobFeatureContributionSchema } from "@redrob/types/redrob-provider";

import { buildRedrobProviderContributions } from "./redrob-provider-adapters.js";

describe("Redrob Cowork provider adapters", () => {
  test("normalizes sessions and extensions into semantic contributions", () => {
    const contributions = buildRedrobProviderContributions();

    expect(contributions.map((contribution) => contribution.featureId)).toEqual([
      "sessions",
      "extensions",
    ]);
    expect(
      contributions.flatMap((contribution) => contribution.affordances)
        .find((affordance) => affordance.id === "session.read"),
    ).toMatchObject({
      kind: "query",
      effects: { data: "read", ui: "none", external: false },
      executor: { kind: "redrob" },
    });
    for (const contribution of contributions) {
      expect(redrobFeatureContributionSchema.safeParse(contribution).success).toBe(true);
    }
  });

  test("includes every MCP provider observed from the engine", () => {
    const contributions = buildRedrobProviderContributions([
      { name: "notion", status: "connected" },
    ]);

    expect(contributions.map((contribution) => contribution.featureId)).toEqual([
      "sessions",
      "extensions",
      "mcp:notion",
    ]);
    expect(contributions[2]).toMatchObject({
      provider: { id: "notion", kind: "mcp" },
      affordances: [],
    });
  });
});
