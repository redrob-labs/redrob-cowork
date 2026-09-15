import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import en from "../../../../i18n/locales/en";
import ko from "../../../../i18n/locales/ko";

/**
 * Status indicators must say what they mean.
 *
 * The runtime dot was a bare coloured span — no title, no accessible name, no
 * role — so a sighted reader got a colour with no key to it and a screen reader
 * got nothing. The counters beside it were labelled but unexplained: "2 MCP
 * servers" does not tell someone what an MCP server is or where to change them.
 *
 * These read the source rather than rendering, because the component needs the
 * whole dropdown/tooltip provider tree to mount. That is a weaker check than a
 * render, so each assertion targets a specific thing that was missing rather
 * than pattern-matching the file at large.
 */

const SOURCE = readFileSync(
  path.join(import.meta.dir, "sidebar-status-menu.tsx"),
  "utf8",
);

describe("StatusDot", () => {
  it("can carry an accessible name", () => {
    expect(SOURCE).toContain("function StatusDot({ variant, label }");
  });

  it("exposes that name to assistive tech and to hover alike", () => {
    const dot = SOURCE.slice(SOURCE.indexOf("function StatusDot"), SOURCE.indexOf("function StatusDot") + 900);
    expect(dot).toContain("aria-label={label}");
    expect(dot).toContain("title={label}");
  });

  it("hides itself from assistive tech when it has no name, instead of announcing nothing", () => {
    // An unnamed dot next to text that already says the same thing is
    // decoration; announcing it twice is worse than not announcing it.
    const dot = SOURCE.slice(SOURCE.indexOf("function StatusDot"), SOURCE.indexOf("function StatusDot") + 900);
    expect(dot).toContain("aria-hidden={label ? undefined : true}");
  });

  it("is named where it sits alone in the dropdown", () => {
    expect(SOURCE).toContain("<StatusDot variant={runtimeStatus.variant} label={runtimeStatus.label} />");
  });
});

describe("the connection counters", () => {
  it("each carry their own tooltip rather than sharing one line of text", () => {
    for (const testId of [
      "providers-connected-count",
      "mcp-connected-count",
      "developer-mode-marker",
    ]) {
      expect(SOURCE).toContain(`data-testid="${testId}"`);
    }
    // Three facts, three tooltips.
    expect(SOURCE.split("<TooltipContent>").length - 1).toBe(3);
  });

  it("hint every counter through a string, not inline prose", () => {
    for (const key of [
      "account.providers_connected_hint",
      "account.mcp_connected_hint",
      "status.developer_mode_hint",
    ]) {
      expect(SOURCE).toContain(key);
    }
  });
});

describe("the hint strings", () => {
  const keys = [
    "account.providers_connected_hint",
    "account.mcp_connected_hint",
    "status.developer_mode_hint",
  ] as const;

  it("exist in every locale, so no reader gets a raw key", () => {
    for (const key of keys) {
      expect(en[key as keyof typeof en]).toBeTruthy();
      expect(ko[key as keyof typeof ko]).toBeTruthy();
    }
  });

  it("say where to change the thing, not just what it is", () => {
    // A tooltip that only restates the label is the bug wearing a hat.
    for (const key of keys) {
      const value = String(en[key as keyof typeof en]);
      expect(value).toMatch(/Settings/);
      expect(value.length).toBeGreaterThan(40);
    }
  });

  it("are translated rather than copied from English", () => {
    for (const key of keys) {
      expect(String(ko[key as keyof typeof ko])).not.toBe(String(en[key as keyof typeof en]));
    }
  });
});
