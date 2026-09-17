import { describe, expect, test } from "bun:test";
import { orderVariantModels } from "../src/components/chat/variant-model-order";

const m = (modelID: string) => ({ providerID: "redrob", modelID });

describe("variant model order", () => {
  test("auto comes first", () => {
    const ids = orderVariantModels([m("claude-sonnet-5"), m("auto"), m("aion-2.0")]).map(x => x.modelID);
    expect(ids[0]).toBe("auto");
  });

  test("the pinned families come next, in the order they were asked for", () => {
    const ids = orderVariantModels([
      m("deepseek-v3"),
      m("aion-2.0"),
      m("gpt-5"),
      m("claude-opus-5"),
      m("grok-4"),
      m("auto"),
    ]).map(x => x.modelID);
    expect(ids).toEqual(["auto", "grok-4", "claude-opus-5", "gpt-5", "deepseek-v3", "aion-2.0"]);
  });

  test("everything else is alphabetical", () => {
    const ids = orderVariantModels([m("zzz-model"), m("amazon/nova-pro"), m("mistral-large")]).map(
      x => x.modelID
    );
    expect(ids).toEqual(["amazon/nova-pro", "mistral-large", "zzz-model"]);
  });

  test("digits sort the way a reader expects", () => {
    const ids = orderVariantModels([m("qwen-10b"), m("qwen-2b")]).map(x => x.modelID);
    expect(ids).toEqual(["qwen-2b", "qwen-10b"]);
  });

  test("matches a provider-prefixed id", () => {
    const ids = orderVariantModels([m("aion-2.0"), m("anthropic/claude-3-haiku")]).map(x => x.modelID);
    expect(ids).toEqual(["anthropic/claude-3-haiku", "aion-2.0"]);
  });

  test("pinning removes nothing", () => {
    /*
      Ordering, not filtering. A filter would have quietly answered "these are the models you have", which
      is a different and false statement, and the search box has to be able to reach every one of them.
    */
    const input = [m("auto"), m("grok-4"), m("aion-2.0"), m("zzz"), m("mistral")];
    expect(orderVariantModels(input)).toHaveLength(input.length);
  });

  test("does not reorder the caller's array", () => {
    const input = [m("zzz"), m("auto")];
    orderVariantModels(input);
    expect(input.map(x => x.modelID)).toEqual(["zzz", "auto"]);
  });
});
