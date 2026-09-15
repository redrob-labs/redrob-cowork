import { describe, expect, it } from "bun:test";

import {
  SESSION_NUMBER_SHORTCUT_LIMIT,
  assignSessionNumberShortcuts,
  getSessionNumberShortcutIntent,
  isSessionNumberModifierKey,
  isSessionNumberModifierPressed,
  isSessionNumberShortcutBlockingOwner,
  nextSessionNumberModifierHeld,
  resolveSessionNumberShortcutOs,
  sameSessionNumberShortcutTargets,
  sessionNumberAriaKeyShortcut,
  sessionNumberShortcutLabel,
  sessionNumberShortcutTargetKey,
  type SessionNumberShortcutCandidate,
  type SessionNumberShortcutOs,
} from "./session-number-shortcuts";

/**
 * Cmd/Ctrl+1-9 jumps to the Nth visible session. The feature was already built
 * and wired; what it had no coverage of was the parts that are easy to get
 * subtly wrong and impossible to notice: which modifier belongs to which OS, and
 * every case where the shortcut must decline rather than fire.
 *
 * A shortcut that fires when it should not is worse than one that never fires —
 * it steals a keystroke from a dialog or from text the user is editing — so most
 * of what follows asserts the declining.
 */

const key = (over: Partial<Parameters<typeof getSessionNumberShortcutIntent>[0]> = {}) => ({
  key: "1",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

const free = { ownerActive: false, cancelled: false };

describe("which modifier belongs to which OS", () => {
  it("is Command on macOS and Control elsewhere", () => {
    expect(isSessionNumberModifierKey("Meta", "macos")).toBe(true);
    expect(isSessionNumberModifierKey("Control", "macos")).toBe(false);
    for (const os of ["windows", "linux"] as const) {
      expect(isSessionNumberModifierKey("Control", os)).toBe(true);
      expect(isSessionNumberModifierKey("Meta", os)).toBe(false);
    }
  });

  it("reads the matching flag off the event", () => {
    expect(isSessionNumberModifierPressed({ metaKey: true, ctrlKey: false }, "macos")).toBe(true);
    expect(isSessionNumberModifierPressed({ metaKey: false, ctrlKey: true }, "macos")).toBe(false);
    expect(isSessionNumberModifierPressed({ metaKey: false, ctrlKey: true }, "linux")).toBe(true);
    expect(isSessionNumberModifierPressed({ metaKey: true, ctrlKey: false }, "linux")).toBe(false);
  });

  it("fires on the right modifier per OS", () => {
    expect(getSessionNumberShortcutIntent(key({ metaKey: true }), "macos", free)).toEqual({
      type: "activate",
      digit: 1,
    });
    expect(getSessionNumberShortcutIntent(key({ ctrlKey: true }), "linux", free)).toEqual({
      type: "activate",
      digit: 1,
    });
  });

  it("does not fire on the other platform's modifier", () => {
    // Ctrl+1 on a Mac is not this shortcut, and neither is Cmd+1 on Windows.
    expect(getSessionNumberShortcutIntent(key({ ctrlKey: true }), "macos", free).type).toBe("ignore");
    expect(getSessionNumberShortcutIntent(key({ metaKey: true }), "windows", free).type).toBe("ignore");
  });

  it("does not fire when both modifiers are down", () => {
    // Cmd+Ctrl+1 is somebody else's binding, not a sloppy version of ours.
    expect(
      getSessionNumberShortcutIntent(key({ metaKey: true, ctrlKey: true }), "macos", free).type,
    ).toBe("ignore");
    expect(
      getSessionNumberShortcutIntent(key({ metaKey: true, ctrlKey: true }), "linux", free).type,
    ).toBe("ignore");
  });
});

describe("when the shortcut must decline", () => {
  it("declines with an extra modifier held", () => {
    for (const extra of [{ shiftKey: true }, { altKey: true }]) {
      expect(
        getSessionNumberShortcutIntent(key({ metaKey: true, ...extra }), "macos", free).type,
      ).toBe("ignore");
    }
  });

  it("declines while a dialog owns the keyboard", () => {
    expect(
      getSessionNumberShortcutIntent(key({ metaKey: true }), "macos", {
        ownerActive: true,
        cancelled: false,
      }).type,
    ).toBe("ignore");
  });

  it("declines after the gesture was cancelled", () => {
    expect(
      getSessionNumberShortcutIntent(key({ metaKey: true }), "macos", {
        ownerActive: false,
        cancelled: true,
      }).type,
    ).toBe("ignore");
  });

  it("declines on 0, which is not a session number", () => {
    expect(getSessionNumberShortcutIntent(key({ key: "0", metaKey: true }), "macos", free).type).toBe(
      "hold",
    );
  });

  it("holds rather than activating on an unrelated key, so Cmd+K still works", () => {
    expect(getSessionNumberShortcutIntent(key({ key: "k", metaKey: true }), "macos", free).type).toBe(
      "hold",
    );
  });

  it("does not start holding while a dialog owns the keyboard", () => {
    expect(
      getSessionNumberShortcutIntent(key({ key: "Meta" }), "macos", {
        ownerActive: true,
        cancelled: false,
      }).type,
    ).toBe("ignore");
    expect(getSessionNumberShortcutIntent(key({ key: "Meta" }), "macos", free).type).toBe("hold");
  });

  it("activates every digit 1 through 9", () => {
    for (let digit = 1; digit <= 9; digit += 1) {
      expect(
        getSessionNumberShortcutIntent(key({ key: String(digit), metaKey: true }), "macos", free),
      ).toEqual({ type: "activate", digit });
    }
  });
});

describe("assigning digits to sessions", () => {
  const candidate = (
    sessionId: string,
    over: Partial<SessionNumberShortcutCandidate> = {},
  ): SessionNumberShortcutCandidate => ({
    workspaceId: "ws",
    sessionId,
    visible: true,
    actionable: true,
    ...over,
  });

  it("numbers visible sessions from 1 in order", () => {
    const assigned = assignSessionNumberShortcuts([candidate("a"), candidate("b"), candidate("c")]);
    expect(assigned.map((target) => [target.sessionId, target.digit])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("skips hidden and unactionable rows without leaving a gap in the numbering", () => {
    // The digits must match what the user can actually see, or Cmd+2 lands
    // somewhere other than the second row they are looking at.
    const assigned = assignSessionNumberShortcuts([
      candidate("a"),
      candidate("hidden", { visible: false }),
      candidate("disabled", { actionable: false }),
      candidate("b"),
    ]);
    expect(assigned.map((target) => [target.sessionId, target.digit])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("stops at nine, because there is no tenth digit to press", () => {
    const many = Array.from({ length: 20 }, (_, index) => candidate(`s${index}`));
    const assigned = assignSessionNumberShortcuts(many);
    expect(assigned).toHaveLength(SESSION_NUMBER_SHORTCUT_LIMIT);
    expect(assigned.at(-1)?.digit).toBe(9);
  });

  it("assigns nothing when nothing is usable", () => {
    expect(assignSessionNumberShortcuts([candidate("a", { visible: false })])).toEqual([]);
    expect(assignSessionNumberShortcuts([])).toEqual([]);
  });
});

describe("what counts as a dialog owning the keyboard", () => {
  const element = (attrs: Record<string, string | null>) => ({
    getAttribute: (name: string) => attrs[name] ?? null,
  });

  it("blocks for dialogs", () => {
    expect(isSessionNumberShortcutBlockingOwner(element({ "data-slot": "dialog-content" }))).toBe(true);
    expect(isSessionNumberShortcutBlockingOwner(element({ role: "dialog" }))).toBe(true);
    expect(isSessionNumberShortcutBlockingOwner(element({ role: "alertdialog" }))).toBe(true);
  });

  it("does not block for a popover, even though it also carries a dialog role", () => {
    // This is the case the popover exemption exists for. A popover in this UI
    // library renders with role="dialog", so without the exemption every open
    // popover would swallow the shortcut — and a popover can be open while the
    // user still means to switch sessions. Asserting a popover with no role
    // would pass whether the exemption were there or not.
    expect(
      isSessionNumberShortcutBlockingOwner(
        element({ "data-slot": "popover-content", role: "dialog" }),
      ),
    ).toBe(false);
    expect(isSessionNumberShortcutBlockingOwner(element({ "data-slot": "popover-content" }))).toBe(
      false,
    );
  });

  it("does not block for ordinary content", () => {
    expect(isSessionNumberShortcutBlockingOwner(element({}))).toBe(false);
    expect(isSessionNumberShortcutBlockingOwner(element({ role: "button" }))).toBe(false);
  });
});

describe("the modifier-held state", () => {
  it("is held only while the modifier is genuinely down", () => {
    expect(nextSessionNumberModifierHeld("modifier-down")).toBe(true);
  });

  it("is released by everything else, so a stuck modifier cannot linger", () => {
    // Losing the window is the case that matters: a keyup never arrives, so
    // anything other than modifier-down has to clear it.
    for (const transition of [
      "modifier-up",
      "modifier-mismatch",
      "blur",
      "focus",
      "visibility-hidden",
      "owner-change",
      "unmount",
    ] as const) {
      expect(nextSessionNumberModifierHeld(transition)).toBe(false);
    }
  });
});

describe("labels shown to the user", () => {
  it("uses the platform's own notation", () => {
    expect(sessionNumberShortcutLabel("macos", 3)).toBe("⌘3");
    expect(sessionNumberShortcutLabel("windows", 3)).toBe("Ctrl+3");
    expect(sessionNumberShortcutLabel("linux", 3)).toBe("Ctrl+3");
  });

  it("gives assistive tech the key names it expects, not the glyphs", () => {
    expect(sessionNumberAriaKeyShortcut("macos", 3)).toBe("Meta+3");
    expect(sessionNumberAriaKeyShortcut("linux", 3)).toBe("Control+3");
  });
});

describe("resolveSessionNumberShortcutOs", () => {
  it("trusts an explicit platform over sniffing", () => {
    expect(resolveSessionNumberShortcutOs("linux", "MacIntel")).toBe("linux");
  });

  it("falls back to the navigator string when nothing was passed", () => {
    expect(resolveSessionNumberShortcutOs(undefined, "MacIntel")).toBe("macos");
    expect(resolveSessionNumberShortcutOs(undefined, "Win32")).toBe("windows");
    expect(resolveSessionNumberShortcutOs(undefined, "X11; Linux x86_64")).toBe("linux");
  });

  it("treats an unrecognised platform as linux rather than guessing macOS", () => {
    // Getting this wrong binds the wrong modifier and the feature silently
    // does nothing, so the fallback must be the Ctrl branch.
    for (const platform of ["", "FreeBSD amd64", "unknown"]) {
      const os: SessionNumberShortcutOs = resolveSessionNumberShortcutOs(undefined, platform);
      expect(os).toBe("linux");
      expect(isSessionNumberModifierKey("Control", os)).toBe(true);
    }
  });
});

describe("target bookkeeping", () => {
  it("keys a target by workspace and session together", () => {
    // The same session id under two workspaces must not collide.
    expect(sessionNumberShortcutTargetKey("w1", "s1")).not.toBe(
      sessionNumberShortcutTargetKey("w2", "s1"),
    );
  });

  it("separates the two halves with a character an id cannot contain", () => {
    expect(sessionNumberShortcutTargetKey("a", "b")).toContain("\u0000");
  });

  it("compares target lists by identity and order", () => {
    const left = [{ workspaceId: "w", sessionId: "a", digit: 1 }];
    expect(sameSessionNumberShortcutTargets(left, [{ workspaceId: "w", sessionId: "a", digit: 1 }])).toBe(
      true,
    );
    // A reorder changes which digit goes where, so it is not the same.
    expect(
      sameSessionNumberShortcutTargets(
        [
          { workspaceId: "w", sessionId: "a", digit: 1 },
          { workspaceId: "w", sessionId: "b", digit: 2 },
        ],
        [
          { workspaceId: "w", sessionId: "b", digit: 1 },
          { workspaceId: "w", sessionId: "a", digit: 2 },
        ],
      ),
    ).toBe(false);
    expect(sameSessionNumberShortcutTargets(left, [])).toBe(false);
  });
});
