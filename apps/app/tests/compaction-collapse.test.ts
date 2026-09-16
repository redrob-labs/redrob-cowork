import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  COMPACTION_PART_TYPE,
  collapsedCompactionIndexes,
  compactionSpans,
  isCompactionMarker,
} from "../src/components/chat/compaction-collapse";
import type { UIMessage } from "ai";

const text = (role: UIMessage["role"], body: string): UIMessage =>
  ({ id: `${role}-${body}`, role, parts: [{ type: "text", text: body, state: "done" }] }) as UIMessage;

const marker = (): UIMessage =>
  ({ id: "marker", role: "user", parts: [{ type: COMPACTION_PART_TYPE, data: { auto: true } }] }) as UIMessage;

/**
 * A context compaction arrives as real messages - a marked user message, then the assistant turn holding
 * the summary the engine wrote. Rendered as ordinary turns, that pastes a wall of machine-written recap
 * addressed to the MODEL into the middle of a conversation addressed to a person.
 */
describe("compaction spans", () => {
  it("recognizes the marker by its part, not by its text", () => {
    expect(isCompactionMarker(marker())).toBe(true);
    expect(isCompactionMarker(text("user", "summarize this"))).toBe(false);
    // An assistant message carrying the same part is not a marker: the engine puts it on a user message,
    // and treating either as one would collapse a real answer.
    expect(
      isCompactionMarker({ role: "assistant", parts: [{ type: COMPACTION_PART_TYPE }] } as never),
    ).toBe(false);
  });

  it("claims the assistant run that follows the marker", () => {
    const messages = [text("user", "a"), text("assistant", "b"), marker(), text("assistant", "summary"), text("user", "c")];
    expect(compactionSpans(messages)).toEqual([{ markerIndex: 2, summaryIndexes: [3] }]);
    expect([...collapsedCompactionIndexes(messages)].sort()).toEqual([2, 3]);
  });

  it("claims every message of a multi-message summary run", () => {
    const messages = [marker(), text("assistant", "part one"), text("assistant", "part two"), text("user", "next")];
    expect(compactionSpans(messages)).toEqual([{ markerIndex: 0, summaryIndexes: [1, 2] }]);
  });

  it("stops at the next user turn, so a real answer is never collapsed", () => {
    const messages = [marker(), text("assistant", "summary"), text("user", "my question"), text("assistant", "my answer")];
    expect([...collapsedCompactionIndexes(messages)].sort()).toEqual([0, 1]);
  });

  it("handles a marker whose summary has not arrived", () => {
    const messages = [text("user", "a"), marker()];
    expect(compactionSpans(messages)).toEqual([{ markerIndex: 1, summaryIndexes: [] }]);
  });

  it("finds every compaction in a long session, not just the first", () => {
    const messages = [marker(), text("assistant", "s1"), text("user", "q"), marker(), text("assistant", "s2")];
    expect(compactionSpans(messages).map((span) => span.markerIndex)).toEqual([0, 3]);
  });
});

describe("wiring", () => {
  const sync = readFileSync(
    fileURLToPath(new URL("../src/react-app/domains/session/sync/session-sync.ts", import.meta.url)),
    "utf8",
  );
  const list = readFileSync(
    fileURLToPath(new URL("../src/components/chat/message-list.tsx", import.meta.url)),
    "utf8",
  );

  it("carries the marker through the sync layer instead of dropping it", () => {
    // `toUIPart` returned null for it, so the app could not tell that message apart from any other.
    expect(sync).toContain('part.type === "compaction"');
    expect(sync).toContain('type: "data-compaction"');
  });

  it("collapses rather than deletes", () => {
    // The summary is what the model now works from, so it has to stay reachable.
    expect(list).toContain("CompactionNotice");
    expect(list).toContain('aria-expanded={open}');
    expect(list).toContain("compaction.collapsed");
  });
});
