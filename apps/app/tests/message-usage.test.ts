import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  contextTokensUsed,
  contextUsagePercent,
  formatMessageCost,
  latestUsage,
  messageUsageMetadata,
  readMessageUsage,
  totalSessionCost,
} from "../src/components/chat/message-usage";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const assistant = (cost?: number, tokens?: unknown) => ({
  role: "assistant",
  metadata: { opencode: { ...(cost === undefined ? {} : { cost }), ...(tokens ? { tokens } : {}) } },
});

/**
 * The engine has always computed `cost` and `tokens` per assistant message, and the app dropped both at
 * the two points where a session message becomes a UI message - neither of which so much as named the
 * fields. So there was nothing to render a per-message cost from and nothing to build a context gauge
 * from either.
 */
describe("message usage plumbing", () => {
  it("keeps a turn that reports usage and skips one that does not", () => {
    expect(messageUsageMetadata({ cost: 0.0123, tokens: { input: 10, output: 2 } })).toEqual({
      cost: 0.0123,
      tokens: { input: 10, output: 2, reasoning: undefined, cache: undefined },
    });
    // Undefined rather than {}, so a message with no usage does not gain a metadata key and start
    // looking different to the upsert than the message it replaces.
    expect(messageUsageMetadata({})).toBeUndefined();
    expect(messageUsageMetadata({ cost: undefined, tokens: undefined })).toBeUndefined();
  });

  it("rejects a nonsense number rather than rendering it", () => {
    expect(messageUsageMetadata({ cost: Number.NaN })).toBeUndefined();
    expect(messageUsageMetadata({ cost: -1 })).toBeUndefined();
    expect(messageUsageMetadata({ cost: Number.POSITIVE_INFINITY })).toBeUndefined();
  });

  it("round-trips through metadata", () => {
    expect(readMessageUsage(assistant(0.5, { input: 1 }))).toEqual({ cost: 0.5, tokens: { input: 1 } });
    expect(readMessageUsage({ role: "assistant" })).toBeUndefined();
  });
});

describe("context fill", () => {
  it("counts input, cache reads and output", () => {
    expect(contextTokensUsed({ tokens: { input: 1000, output: 200, cache: { read: 300 } } })).toBe(1500);
  });

  it("does NOT add reasoning, which the engine reports as part of output", () => {
    // Adding it counts the same tokens twice and the gauge overshoots on exactly the models people
    // reach for.
    expect(contextTokensUsed({ tokens: { input: 100, output: 50, reasoning: 40 } })).toBe(150);
  });

  it("excludes cache writes, which are a cost rather than conversation in the window", () => {
    expect(contextTokensUsed({ tokens: { input: 100, output: 0, cache: { read: 0, write: 900 } } })).toBe(100);
  });

  it("is a percentage of the published window, capped at 100", () => {
    expect(
      contextUsagePercent({ usage: { tokens: { input: 50_000, output: 0 } }, contextLimitTokens: 200_000 }),
    ).toBe(25);
    expect(
      contextUsagePercent({ usage: { tokens: { input: 500_000, output: 0 } }, contextLimitTokens: 200_000 }),
    ).toBe(100);
  });

  it("shows nothing rather than a made-up number when either half is unknown", () => {
    expect(contextUsagePercent({ usage: undefined, contextLimitTokens: 200_000 })).toBeNull();
    expect(contextUsagePercent({ usage: { tokens: { input: 1 } }, contextLimitTokens: undefined })).toBeNull();
    expect(contextUsagePercent({ usage: { tokens: { input: 1 } }, contextLimitTokens: 0 })).toBeNull();
    expect(contextUsagePercent({ usage: { cost: 1 }, contextLimitTokens: 200_000 })).toBeNull();
  });

  it("reads the LAST reporting turn, not a sum over the session", () => {
    // Each request carries the whole conversation, so the newest turn's input already includes every
    // earlier one. Summing would multiply the transcript by the number of turns in it.
    const messages = [
      assistant(0.1, { input: 1_000, output: 100 }),
      { role: "user", metadata: undefined },
      assistant(0.2, { input: 5_000, output: 200 }),
      { role: "assistant" },
    ];
    expect(latestUsage(messages)).toEqual({ cost: 0.2, tokens: { input: 5_000, output: 200 } });
    expect(contextUsagePercent({ usage: latestUsage(messages), contextLimitTokens: 52_000 })).toBe(10);
  });
});

describe("cost", () => {
  it("does sum across the session, because cost accrues where context does not", () => {
    const messages = [assistant(0.1), { role: "user" }, assistant(0.25), { role: "assistant" }];
    expect(totalSessionCost(messages)).toBeCloseTo(0.35);
    expect(totalSessionCost([{ role: "assistant" }])).toBeUndefined();
  });

  it("prints a sub-cent amount as a fact rather than as $0.00", () => {
    expect(formatMessageCost(0.0004)).toBe("$0.0004");
    expect(formatMessageCost(0.0123)).toBe("$0.012");
    expect(formatMessageCost(1.5)).toBe("$1.50");
    expect(formatMessageCost(0)).toBe("$0");
    expect(formatMessageCost(undefined)).toBeNull();
  });
});

describe("wiring", () => {
  it("reads usage on BOTH the live path and the history reload", () => {
    // A reload that lost them would silently drop what was on screen a moment earlier.
    expect(read("../src/react-app/domains/session/sync/session-sync.ts")).toContain("messageUsageMetadata(info)");
    expect(read("../src/react-app/domains/session/sync/usechat-adapter.ts")).toContain("messageUsageMetadata(");
  });

  it("renders the turn cost and the context line", () => {
    expect(read("../src/components/chat/message-list.tsx")).toContain("<MessageTurnFacts");
    const composer = read("../src/react-app/domains/session/surface/composer/composer.tsx");
    expect(composer).toContain("<ContextMeter");
    // The meter itself lives in its own module now, so the string it renders is asserted there.
    expect(read("../src/components/chat/context-meter.tsx")).toContain("usage.context_used");
  });

  it("takes the window from the console catalogue, not the engine", () => {
    // The engine reports one flat context for every Redrob model; the console publishes it per model.
    expect(read("../src/react-app/domains/session/surface/session-surface.tsx")).toContain(
      "capabilities.maxContextTokens",
    );
  });
});

describe("model picker width", () => {
  const code = read("../src/react-app/domains/session/modals/model-picker-modal.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");

  it("overrides the primitive at lg, which is where it caps itself", () => {
    /*
      `DialogContent` carries `lg:max-w-md`. A `sm:` override does not beat it at large widths - both
      apply and the later breakpoint wins - and tailwind-merge cannot collapse them because they are
      different variants. Leaving `lg:` out is why the first attempt at this rendered narrow.
    */
    expect(code).toContain("lg:max-w-[min(94vw,80rem)]");
    expect(code).toContain("lg:w-[min(94vw,80rem)]");
  });

  it("lets the model column take the slack and fixes the rest", () => {
    expect(code).toContain("table-fixed");
    expect(code).toContain('className="w-auto"');
  });
});
