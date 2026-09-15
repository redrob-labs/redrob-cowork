import { describe, expect, test } from "bun:test";

import { matchesModelQuery, modelSearchHaystack } from "../src/app/lib/model-search";
import { inferModelVendor } from "../src/app/lib/model-vendor";

const redrobAuto = {
  providerID: "redrob",
  modelID: "auto",
  title: "Auto",
  description: "Redrob",
};

const redrobOpus = {
  providerID: "redrob",
  modelID: "claude-opus-5",
  title: "Claude Opus 5",
  description: "Redrob",
};

describe("inferModelVendor", () => {
  test("names the vendor behind a vendor model id", () => {
    expect(inferModelVendor("claude-opus-5")?.name).toBe("Anthropic");
    expect(inferModelVendor("gpt-5.2")?.name).toBe("OpenAI");
    expect(inferModelVendor("gemini-3-pro")?.name).toBe("Google");
    expect(inferModelVendor("deepseek-v3")?.name).toBe("DeepSeek");
    expect(inferModelVendor("grok-4")?.name).toBe("xAI");
  });

  test("strips a provider segment before matching", () => {
    expect(inferModelVendor("redrob/claude-opus-5")?.id).toBe("anthropic");
    expect(inferModelVendor("anthropic:claude-haiku-4-5")?.id).toBe("anthropic");
  });

  test("returns null for the router model, so the Redrob mark stays", () => {
    expect(inferModelVendor("auto")).toBe(null);
  });

  test("returns null rather than guessing on an unknown id", () => {
    expect(inferModelVendor("some-internal-model-7")).toBe(null);
    expect(inferModelVendor("")).toBe(null);
  });

  test("does not match a vendor name that is only a substring", () => {
    // "notclaude-x" starts with no vendor token; a substring match would
    // mislabel it as Anthropic.
    expect(inferModelVendor("notclaude-x")).toBe(null);
  });
});

describe("matchesModelQuery", () => {
  test("matches provider then model, the order the row is read in", () => {
    expect(matchesModelQuery(redrobAuto, "Redrob Auto")).toBe(true);
    expect(matchesModelQuery(redrobOpus, "redrob claude opus")).toBe(true);
  });

  test("matches out-of-order tokens", () => {
    expect(matchesModelQuery(redrobAuto, "auto redrob")).toBe(true);
  });

  test("matches the inferred vendor name", () => {
    expect(matchesModelQuery(redrobOpus, "anthropic")).toBe(true);
    expect(matchesModelQuery(redrobAuto, "anthropic")).toBe(false);
  });

  test("still matches a single field query", () => {
    expect(matchesModelQuery(redrobOpus, "opus")).toBe(true);
    expect(matchesModelQuery(redrobOpus, "claude-opus-5")).toBe(true);
  });

  test("rejects a query with a token that matches nothing", () => {
    expect(matchesModelQuery(redrobAuto, "redrob gemini")).toBe(false);
  });

  test("an empty query matches everything", () => {
    expect(matchesModelQuery(redrobAuto, "   ")).toBe(true);
  });

  test("haystack carries the provider/model path form", () => {
    expect(modelSearchHaystack(redrobOpus)).toContain("redrob/claude-opus-5");
  });
});
