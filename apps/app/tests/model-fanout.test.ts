import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PARAPHRASE_COUNT,
  MAX_FAN_OUT,
  compareSlots,
  parseFanOutCommand,
  resolveCompareModels,
  resolveParaphraseSlots,
} from "../src/react-app/domains/session/model-fanout";

const model = (modelID: string, extra: { variant?: string | null; available?: boolean } = {}) => ({
  providerID: "redrob",
  modelID,
  ...extra,
});

describe("compare", () => {
  test("runs one variant per named model, labelled by model", () => {
    const slots = compareSlots([model("gpt-5"), model("claude-sonnet-5")]);
    expect(slots.map(s => s.label)).toEqual(["gpt-5", "claude-sonnet-5"]);
    expect(slots.map(s => s.index)).toEqual([0, 1]);
  });

  test("keeps the same model at two variants, because that is a real comparison", () => {
    /*
      Collapsing these would answer a different question than the one asked: a thinking level is exactly
      what someone compares a model against itself on.
    */
    const slots = compareSlots([model("a", { variant: "low" }), model("a", { variant: "high" })]);
    expect(slots).toHaveLength(2);
    expect(slots.map(s => s.label)).toEqual(["a low", "a high"]);
  });

  test("drops an exact duplicate and an unusable model", () => {
    expect(resolveCompareModels([model("a"), model("a"), model("b")])).toHaveLength(2);
    expect(
      resolveCompareModels([model("a"), model("b", { available: false }), model("c")]).map(
        m => m.modelID
      )
    ).toEqual(["a", "c"]);
  });

  test("refuses a single model, since one variant is a normal turn wearing a panel", () => {
    expect(compareSlots([model("a")])).toEqual([]);
    expect(compareSlots([model("a"), model("b", { available: false })])).toEqual([]);
  });

  test("caps the run so the variants still fit side by side", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map(id => model(id));
    expect(compareSlots(many)).toHaveLength(MAX_FAN_OUT);
  });
});

describe("paraphrase", () => {
  test("runs the SAME model more than once", () => {
    /*
      The question is about the wording, not the model. Drawing another model in would answer a different
      question and make the two results incomparable.
    */
    const slots = resolveParaphraseSlots({ model: model("gpt-5") });
    expect(slots).toHaveLength(DEFAULT_PARAPHRASE_COUNT);
    expect(new Set(slots.map(s => s.modelID ?? s.model.modelID))).toEqual(new Set(["gpt-5"]));
    expect(slots.map(s => s.label)).toEqual(["1", "2"]);
  });

  test("never runs fewer than two, since one paraphrase is not a choice", () => {
    expect(resolveParaphraseSlots({ model: model("a"), count: 1 })).toHaveLength(2);
  });

  test("caps the count", () => {
    expect(resolveParaphraseSlots({ model: model("a"), count: 99 })).toHaveLength(MAX_FAN_OUT);
  });

  test("returns nothing without a usable model", () => {
    expect(resolveParaphraseSlots({ model: null })).toEqual([]);
    expect(resolveParaphraseSlots({ model: model("a", { available: false }) })).toEqual([]);
  });
});

describe("commands", () => {
  test("shuffle is a paraphrase run and takes an optional count", () => {
    expect(parseFanOutCommand("/shuffle explain this regex")).toEqual({
      kind: "paraphrase",
      count: DEFAULT_PARAPHRASE_COUNT,
      prompt: "explain this regex",
    });
    expect(parseFanOutCommand("/shuffle 3 explain this regex")).toMatchObject({ count: 3 });
  });

  test("compare reads the leading model ids and leaves the prompt alone", () => {
    expect(parseFanOutCommand("/compare gpt-5 claude-sonnet-5 write a haiku")).toEqual({
      kind: "compare",
      modelIDs: ["gpt-5", "claude-sonnet-5"],
      prompt: "write a haiku",
    });
  });

  test("compare does not eat the first words of a prompt", () => {
    // The permissive version of this bug is silent: the question changes and the user never sees why.
    expect(parseFanOutCommand("/compare write a haiku about caches")).toEqual({
      kind: "compare",
      modelIDs: [],
      prompt: "write a haiku about caches",
    });
  });

  test("is not confused by ordinary text", () => {
    expect(parseFanOutCommand("compare these two files")).toBeNull();
    expect(parseFanOutCommand("/compactnow")).toBeNull();
  });
});
