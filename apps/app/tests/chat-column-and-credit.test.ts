import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { classifyRedrobPaymentRefusal } from "../src/react-app/domains/billing/redrob-pay";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

/**
 * One column for the conversation and the composer.
 *
 * The transcript was `max-w-3xl` (768px) with `md:px-10`; the composer was `max-w-[800px]` with an inner
 * `px-4`. Two different widths AND two different insets, so the text a reader types was not under the
 * text they had just read. Both now read one CSS variable, which is what stops them drifting apart again
 * the next time either side is touched.
 */
describe("chat column", () => {
  it("is one variable, used by the transcript and the composer", () => {
    const list = read("../src/components/chat/message-list.tsx");
    const composer = read("../src/react-app/domains/session/surface/composer/composer.tsx");
    expect(list).not.toContain("max-w-3xl");
    expect(list).toContain("max-w-[var(--ow-chat-column)]");
    expect(composer).toContain("max-w-[var(--ow-chat-column)]");
    expect(composer).not.toContain("max-w-[800px]");
    expect(read("../src/app/index.css")).toContain("--ow-chat-column:");
  });

  it("uses the same inset on both sides of the column", () => {
    // md:px-10 against the composer panel's px-4 put the two text edges 24px apart.
    const list = read("../src/components/chat/message-list.tsx");
    expect(list).not.toContain("md:px-10");
    expect(list).not.toContain("md:px-8");
  });
});

/**
 * Cost belongs on the turn that incurred it.
 *
 * It was in the hover action row - a figure nobody sees - and a single session total under the composer
 * stood in for it. A running total says nothing about which turn was expensive, and under the composer it
 * reads as the cost of the message about to be sent.
 */
describe("per-message cost", () => {
  const list = read("../src/components/chat/message-list.tsx");

  it("is rendered per turn, outside the hover row", () => {
    const hoverRow = list.indexOf("group-hover/message-group:opacity-100 max-lg:opacity-100");
    const cost = list.indexOf("<MessageCost");
    expect(cost).toBeGreaterThan(-1);
    // Before the hover row in source order means it is a sibling of it, not a child.
    expect(cost).toBeLessThan(hoverRow);
  });

  it("is not gated on hover", () => {
    const block = list.slice(list.indexOf("<MessageCost") - 200, list.indexOf("<MessageCost"));
    expect(block).not.toContain("opacity-0");
  });

  it("no longer accumulates a session total anywhere", () => {
    expect(read("../src/react-app/domains/session/surface/session-surface.tsx")).not.toContain(
      "totalSessionCost",
    );
  });
});

/**
 * The console's own out-of-credit refusal.
 *
 * The classifier matched credit / credits / balance / funds but NOT `quota`, and this console sends
 * `insufficient_quota`. So the one wording that actually reaches users fell through to a raw JSON blob
 * with no top-up offered - which is exactly what was reported.
 */
describe("out-of-credit refusal", () => {
  const real =
    '{"message":"This workspace is out of credit (balance $-0.64). Top up to keep making requests.","type":"insufficient_quota","param":null,"code":"insufficient_quota"}';

  it("recognises the wording this console actually sends", () => {
    const refusal = classifyRedrobPaymentRefusal(real);
    expect(refusal).not.toBeNull();
    expect(refusal?.signal).toBe("insufficient_credit");
  });

  it("recognises the prose form on its own", () => {
    // The message says "out of credit" without ever putting "insufficient" next to it.
    expect(classifyRedrobPaymentRefusal("This workspace is out of credit (balance $-0.64).")).not.toBeNull();
  });

  it("still recognises the older wordings", () => {
    for (const text of [
      "insufficient credit",
      "insufficient_credits",
      "Insufficient balance",
      "402 Payment Required",
    ]) {
      expect(classifyRedrobPaymentRefusal(text)).not.toBeNull();
    }
  });

  it("leaves another provider's billing problem alone", () => {
    // Offering a Redrob top-up for someone else's bill sends the user to the wrong place.
    expect(
      classifyRedrobPaymentRefusal("Provider: openai\ninsufficient_quota"),
    ).toBeNull();
  });

  it("does not read an ordinary error as a bill", () => {
    expect(classifyRedrobPaymentRefusal("model_not_found")).toBeNull();
    expect(classifyRedrobPaymentRefusal("quota")).toBeNull();
    expect(classifyRedrobPaymentRefusal("")).toBeNull();
  });
});
