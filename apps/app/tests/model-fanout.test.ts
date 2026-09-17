import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SHUFFLE_COUNT,
  MAX_FAN_OUT,
  fanOutSessionTitle,
  parseFanOutCommand,
  resolveCompareModels,
  resolveShuffleModels,
} from "../src/react-app/domains/session/model-fanout";

const model = (modelID: string, extra: { variant?: string | null; available?: boolean } = {}) => ({
  providerID: "redrob",
  modelID,
  ...extra,
});

describe("compare", () => {
  test("runs each named model once", () => {
    const picked = resolveCompareModels([model("a"), model("b")]);
    expect(picked.map(m => m.modelID)).toEqual(["a", "b"]);
  });

  test("keeps the same model at two variants, because that is a real comparison", () => {
    /*
      Collapsing these would silently answer a different question than the one asked: thinking levels are
      exactly the thing someone compares a model against itself on.
    */
    const picked = resolveCompareModels([
      model("a", { variant: "low" }),
      model("a", { variant: "high" }),
    ]);
    expect(picked).toHaveLength(2);
  });

  test("drops an exact duplicate", () => {
    expect(resolveCompareModels([model("a"), model("a"), model("b")])).toHaveLength(2);
  });

  test("drops a model that cannot currently run", () => {
    // A session that opens and immediately errors is worse than not opening.
    const picked = resolveCompareModels([model("a"), model("b", { available: false }), model("c")]);
    expect(picked.map(m => m.modelID)).toEqual(["a", "c"]);
  });

  test("refuses a single model, since one session is not a comparison", () => {
    expect(resolveCompareModels([model("a")])).toEqual([]);
    expect(resolveCompareModels([model("a"), model("b", { available: false })])).toEqual([]);
  });

  test("caps the fan-out rather than opening a wall of sessions", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map(id => model(id));
    expect(resolveCompareModels(many)).toHaveLength(MAX_FAN_OUT);
  });
});

describe("shuffle", () => {
  const pool = ["a", "b", "c", "d", "e"].map(id => model(id));

  test("picks the default count when none is given", () => {
    const picked = resolveShuffleModels({ models: pool, random: () => 0 });
    expect(picked).toHaveLength(DEFAULT_SHUFFLE_COUNT);
  });

  test("leaves the session's current model out of the draw", () => {
    // Spending one of three slots on the answer the user already has is the one clearly wrong pick.
    const picked = resolveShuffleModels({
      models: pool,
      exclude: model("a"),
      count: 4,
      random: () => 0,
    });
    expect(picked.map(m => m.modelID)).not.toContain("a");
    expect(picked).toHaveLength(4);
  });

  test("actually varies with the source of randomness", () => {
    const first = resolveShuffleModels({ models: pool, count: 3, random: () => 0 });
    const second = resolveShuffleModels({ models: pool, count: 3, random: () => 0.99 });
    expect(first.map(m => m.modelID)).not.toEqual(second.map(m => m.modelID));
  });

  test("does not reorder the caller's list", () => {
    const source = [...pool];
    resolveShuffleModels({ models: source, count: 3, random: () => 0.5 });
    expect(source.map(m => m.modelID)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("runs what there is when fewer models are available than asked for", () => {
    const picked = resolveShuffleModels({ models: [model("a"), model("b")], count: 4 });
    expect(picked).toHaveLength(2);
  });

  test("returns nothing when the pool is empty, so the caller can say so", () => {
    expect(resolveShuffleModels({ models: [model("a", { available: false })] })).toEqual([]);
  });

  test("never exceeds the fan-out cap even when asked to", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map(id => model(id));
    expect(resolveShuffleModels({ models: many, count: 99 })).toHaveLength(MAX_FAN_OUT);
  });
});

describe("commands", () => {
  test("shuffle takes an optional count and the rest as the prompt", () => {
    expect(parseFanOutCommand("/shuffle explain this regex")).toEqual({
      kind: "shuffle",
      count: DEFAULT_SHUFFLE_COUNT,
      prompt: "explain this regex",
    });
    expect(parseFanOutCommand("/shuffle 2 explain this regex")).toEqual({
      kind: "shuffle",
      count: 2,
      prompt: "explain this regex",
    });
  });

  test("shuffle clamps a silly count instead of opening that many sessions", () => {
    expect(parseFanOutCommand("/shuffle 99 hello")).toMatchObject({ count: MAX_FAN_OUT });
    expect(parseFanOutCommand("/shuffle 0 hello")).toMatchObject({ count: 1 });
  });

  test("compare reads the leading model ids and leaves the prompt alone", () => {
    expect(parseFanOutCommand("/compare gpt-5 claude-sonnet-4-5 write a haiku")).toEqual({
      kind: "compare",
      modelIDs: ["gpt-5", "claude-sonnet-4-5"],
      prompt: "write a haiku",
    });
  });

  test("compare does not eat the first words of a prompt", () => {
    /*
      The permissive version of this bug is silent: a prompt starting with an ordinary word would lose it
      to the model list and the user would never see why the question changed.
    */
    const parsed = parseFanOutCommand("/compare write a haiku about caches");
    expect(parsed).toEqual({ kind: "compare", modelIDs: [], prompt: "write a haiku about caches" });
  });

  test("accepts a provider-prefixed id", () => {
    expect(parseFanOutCommand("/compare redrob/gpt-5 anthropic/claude-opus hello")).toMatchObject({
      modelIDs: ["redrob/gpt-5", "anthropic/claude-opus"],
      prompt: "hello",
    });
  });

  test("is not confused by ordinary text", () => {
    expect(parseFanOutCommand("compare these two files")).toBeNull();
    expect(parseFanOutCommand("/compactnow")).toBeNull();
  });
});

describe("titles", () => {
  test("name the model, because the prompt is identical in every session", () => {
    expect(fanOutSessionTitle({ model: model("claude-sonnet"), index: 0, total: 3 })).toBe(
      "claude-sonnet (1/3)"
    );
    expect(
      fanOutSessionTitle({ model: model("gpt-5", { variant: "high" }), index: 2, total: 3 })
    ).toBe("gpt-5 high (3/3)");
  });
});
