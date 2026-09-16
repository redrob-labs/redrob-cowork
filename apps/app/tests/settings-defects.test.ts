import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(import.meta.dir, "..");
const REPO = join(APP, "..", "..");
const read = (relative: string) => readFileSync(join(APP, relative), "utf8");
const repoRead = (relative: string) => readFileSync(join(REPO, relative), "utf8");

/**
 * The four reported settings defects, pinned.
 *
 * Every one of them was a wire that went nowhere rather than logic that computed the wrong answer, which is
 * why they are asserted as wiring: a title-bar switch writing a key nobody read, tooltips bypassing `t()`,
 * a compaction toggle with no threshold beside it, and a summarize path reachable only by typing a command
 * whose name is not written down anywhere in the UI.
 */
describe("title bar setting", () => {
  test("the switch reaches the main process", () => {
    /*
      It used to write `redrob.hideTitlebar` to localStorage and NOTHING read it - a grep for consumers
      returned the constant's declaration and nothing else. Verified end to end in a real Electron run:
      toggling it wrote window-appearance.json, and after a restart the OS title bar was gone.
    */
    const route = read("src/react-app/shell/settings-route.tsx");
    expect(route).toContain('invokeDesktop?.("__setTitleBarHidden"');
    expect(route).toContain('t("settings.hide_titlebar_restart")');
  });

  test("the main process persists it where startup can read it", () => {
    // `frame` and `titleBarStyle` are construction options, so the value must be on disk before the
    // renderer that owns localStorage exists. That is the whole reason the original wiring could not work.
    const main = repoRead("apps/desktop/electron/main.mjs");
    expect(main).toContain("window-appearance.json");
    expect(main).toContain("await readTitleBarPreference()");
  });

  test("Windows keeps its window controls and Linux does not pretend to", () => {
    /*
      `titleBarOverlay` is Windows-only. On Linux `titleBarStyle: "hidden"` reserves no strip, so the bare
      controls land on the app's own right-hand rail - observed on xfwm4 with the close button sitting
      exactly over the browser-panel icon. Linux therefore gets `frame: false`, which is what the setting's
      stated use case (tiling window managers) actually wants, and Windows keeps the overlay because there
      the three buttons are the user's only handle on the window.
    */
    const main = repoRead("apps/desktop/electron/main.mjs");
    expect(main).toContain('process.platform === "win32"');
    expect(main).toContain("{ frame: false }");
    expect(main).toContain("titleBarOverlay");
  });

  test("macOS reports that it has nothing to do", () => {
    // Already `hiddenInset`. A silent no-op is what made the original bug invisible.
    expect(repoRead("apps/desktop/electron/main.mjs")).toContain("macos-always-hidden");
  });
});

describe("compaction threshold", () => {
  test("the settings page offers one, next to the toggle", () => {
    const view = read("src/react-app/domains/settings/pages/preferences-view.tsx");
    expect(view).toContain("settings.compact_threshold");
    expect(view).toContain('type="range"');
  });

  test("it is disabled rather than hidden when auto-compaction is off", () => {
    // Hiding it would make the toggle look like the whole feature, which is how the engine and the app came
    // to disagree about the default in the first place.
    expect(read("src/react-app/domains/settings/pages/preferences-view.tsx")).toContain(
      "!props.autoCompactContext",
    );
  });

  test("it carries a tooltip, because the number does not explain itself", () => {
    const view = read("src/react-app/domains/settings/pages/preferences-view.tsx");
    expect(view).toContain("settings.compact_threshold_tooltip");
    // Base UI takes `render`, not Radix's `asChild` - which is what the first attempt used, and it failed
    // typecheck rather than rendering wrong, so this keeps the right API pinned.
    expect(view).toContain("<TooltipTrigger");
    expect(view).not.toContain("<TooltipTrigger asChild>");
  });

  test("changing it writes the engine config and is clamped", () => {
    const route = read("src/react-app/shell/settings-route.tsx");
    expect(route).toContain("opencode: { compaction: { threshold: next } }");
    expect(route).toContain("Math.min(100, Math.max(1, Math.round(percent)))");
  });

  test("an unset value displays the engine's real default, not zero", () => {
    // Absent means "the engine decides", and the engine decides 70. Showing 0 would be a third disagreement
    // between what the app displays and what the engine does.
    expect(read("src/react-app/shell/settings-route.tsx")).toContain("useState(70)");
  });
});

describe("manual compaction", () => {
  test("there is a button, not only a command name to memorize", () => {
    const meter = read("src/components/chat/context-meter.tsx");
    expect(meter).toContain("usage.compact_now");
    expect(meter).toContain("props.onCompact");
  });

  test("it is offered only once there is something to summarize", () => {
    expect(read("src/components/chat/context-meter.tsx")).toContain("props.usedPercent >= 50");
  });

  test("it reuses the recognized /compact path", () => {
    /*
      The composer has matched the compact command since before this button existed and routes it to
      `compactCurrentSession`. Sending the same draft means the button cannot drift from what typing the
      command does - the same reason the retry button re-sends a draft instead of calling a second path.
    */
    const surface = read("src/react-app/domains/session/surface/session-surface.tsx");
    expect(surface).toContain('buildDraft("/compact", [])');
    expect(surface).toContain("onCompactSession={handleCompactSession}");
  });
});

describe("Korean tooltips", () => {
  const FILES = [
    "src/components/chat/message-list.tsx",
    "src/components/chat/image-attachment-badge.tsx",
    "src/react-app/domains/workspace/share-workspace-access-panel.tsx",
  ];

  test("no user-facing tooltip or label is hardcoded English", () => {
    /*
      This was the ACTUAL cause, and it is not what a key-coverage count finds. Comparing en.ts against
      ko.ts reported 46 missing keys; every one was an `_one`/`_other` plural pair that the resolver falls
      back to the bare key for, and Korean has no grammatical plural so it defines only the bare key. Real
      missing keys: zero. The English a Korean user saw came from strings that never reached `t()` at all.
    */
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = read(file);
      for (const match of source.matchAll(/(?:tooltip|aria-label|title)="([A-Z][^"]*)"/g)) {
        offenders.push(`${file}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("both locales define every key those call sites now use", () => {
    const en = read("src/i18n/locales/en.ts");
    const ko = read("src/i18n/locales/ko.ts");
    for (const key of [
      "message.revert",
      "message.edit",
      "common.copy",
      "common.remove",
      "usage.compact_now",
      "usage.compact_now_hint",
      "usage.compacting",
      "settings.compact_threshold",
      "settings.compact_threshold_desc",
      "settings.compact_threshold_tooltip",
      "settings.hide_titlebar_restart",
      "settings.hide_titlebar_macos",
    ]) {
      expect(en).toContain(`"${key}":`);
      expect(ko).toContain(`"${key}":`);
    }
  });
});
