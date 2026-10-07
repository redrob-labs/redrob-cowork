/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { AgentAction as DsAgentAction, ApprovalStep as DsApprovalStep } from "@redrob-labs/ui";
import type { DynamicToolUIPart } from "ai";
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import type { PendingPermission } from "../../src/app/types";
import { Tool } from "../../src/components/ui/tool";
import { t } from "../../src/i18n";
import { PermissionApprovalPanel } from "../../src/react-app/domains/session/chat/permission-approval-modal";
import { parityTree } from "../helpers/ds-parity";

const markup = renderToStaticMarkup;
const rr = (html: string) => new Set(parityTree(html).flatMap((node) => ("rr" in node ? node.rr : [])));
const missing = (needed: string[], have: Set<string>) => needed.filter((name) => !have.has(name));

function permission(): PendingPermission {
  return {
    id: "perm-1",
    sessionID: "session-1",
    permission: "bash",
    patterns: ["git status"],
    metadata: {},
    always: { session: false, project: false },
    receivedAt: 1,
    protocol: "legacy",
  };
}

const TOOL_CASES: Array<{ state: string; toolPart: DynamicToolUIPart; expected: string; label: string }> = [
  {
    state: "done",
    toolPart: { type: "dynamic-tool", toolName: "grep", toolCallId: "1", state: "output-available", input: { q: "x" }, output: "ok" },
    expected: "rr-action__state--done",
    label: "tool.state_done",
  },
  {
    state: "running",
    toolPart: { type: "dynamic-tool", toolName: "grep", toolCallId: "2", state: "input-available", input: { q: "x" } },
    expected: "rr-action__state--running",
    label: "tool.state_running",
  },
  {
    state: "error",
    toolPart: { type: "dynamic-tool", toolName: "grep", toolCallId: "3", state: "output-error", input: {}, errorText: "boom" },
    expected: "rr-action__state--error",
    label: "tool.state_failed",
  },
];

describe("the permission panel is the design system's ApprovalStep", () => {
  const html = markup(
    React.createElement(PermissionApprovalPanel, { permission: permission(), respondPermission: () => undefined }),
  );
  const designSystem = rr(
    markup(
      <DsApprovalStep
        title="Run a command?"
        description="It wants to run git status."
        detail="git status"
        onApprove={() => undefined}
        onReject={() => undefined}
        onAlways={() => undefined}
      />,
    ),
  );

  test("it draws every part of the ApprovalStep: frame, head, shield, title, what, detail and actions", () => {
    const parts = [
      "rr-approval",
      "rr-approval__head",
      "rr-approval__icon",
      "rr-approval__title",
      "rr-approval__what",
      "rr-approval__detail",
      "rr-approval__actions",
    ];
    expect(missing(parts, designSystem)).toEqual([]);
    expect(missing(parts, rr(html))).toEqual([]);
  });

  test("it is a group named by its question, as the design system's is", () => {
    expect(html).toMatch(/role="group" aria-label="[^"]+"/);
  });

  test("its answers are the design system's weights: secondary, primary, ghost", () => {
    const buttons = [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((match) => match[1]);
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toContain("rr-btn--secondary");
    expect(buttons[1]).toContain("rr-btn--primary");
    expect(buttons[2]).toContain("rr-btn--ghost");
  });
});

describe("a tool row is the design system's AgentAction", () => {
  const parts = ["rr-action", "rr-action__head", "rr-action__icon", "rr-action__summary", "rr-action__state", "rr-accordion__chevron"];
  const designSystem = rr(markup(<DsAgentAction name="grep" summary="Searched src" state="done" />));

  for (const { state, toolPart, expected, label } of TOOL_CASES) {
    test(`a ${state} tool draws the AgentAction head with the ${state} state`, () => {
      const html = markup(<Tool toolPart={toolPart} />);
      expect(missing(parts, designSystem)).toEqual([]);
      expect(missing(parts, rr(html))).toEqual([]);
      expect(rr(html).has(expected)).toBe(true);
      expect(html).toContain(t(label));
    });
  }

  test("the expanded body is the AgentAction body", () => {
    const html = markup(
      <Tool
        defaultOpen
        toolPart={{ type: "dynamic-tool", toolName: "grep", toolCallId: "4", state: "output-available", input: {}, output: "ok" }}
      />,
    );
    expect(rr(html).has("rr-action__body")).toBe(true);
    expect(rr(markup(<DsAgentAction name="grep" summary="x" defaultOpen>out</DsAgentAction>)).has("rr-action__body")).toBe(true);
  });
});

describe("generated text sits on the AI surface", () => {
  test("assistant prose takes surface-ai and border-ai, which the design system reserves for machine output", () => {
    const list = readFileSync(join(import.meta.dir, "..", "..", "src/components/chat/message-list.tsx"), "utf8");
    expect(list).toMatch(/data-surface="ai"[\s\S]{0,80}className="[^"]*border-border-ai[^"]*bg-surface-ai/);
  });
});
