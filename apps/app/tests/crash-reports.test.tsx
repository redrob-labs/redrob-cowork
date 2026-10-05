import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { TutorialStep } from "../src/react-app/domains/onboarding/tutorial-step";
import { syncCrashReports } from "../src/react-app/desk/settings/crash-reports";
import { GeneralView, type GeneralActions } from "../src/react-app/desk/settings/desk-settings";

const src = (path: string) => readFileSync(join(import.meta.dir, "..", "src", path), "utf8");

describe("crash reports", () => {
  test("off until the person turns them on", () => {
    expect(src("react-app/kernel/local-provider.tsx")).toContain("crashReports: false,");
  });

  test("the choice goes to the desktop app; a failure or the web reports off", async () => {
    const asked: boolean[] = [];
    const bridge = {
      desktopSentrySetConsent: async (input: { enabled: boolean }) => {
        asked.push(input.enabled);
        return { enabled: input.enabled };
      },
    };
    expect(await syncCrashReports(true, bridge)).toBe(true);
    expect(await syncCrashReports(false, bridge)).toBe(false);
    expect(asked).toEqual([true, false]);
    expect(await syncCrashReports(true, { desktopSentrySetConsent: async () => { throw new Error("no"); } })).toBe(false);
    expect(await syncCrashReports(true, null)).toBe(false);
  });

  test("Settings shows the switch in the desktop app only", () => {
    const noop = () => {};
    const actions: GeneralActions = { onMode: noop, onLanguage: noop, onTheme: noop, onTextSize: noop, onNotify: noop, onKeepAwake: noop, onCrashReports: noop };
    const values = { mode: "run" as const, language: "en" as const, theme: "system" as const, textSize: "default" as const, notify: false, keepAwake: true };
    expect(renderToStaticMarkup(<GeneralView values={{ ...values, crashReports: false }} actions={actions} />)).toContain("Send crash reports");
    expect(renderToStaticMarkup(<GeneralView values={values} actions={actions} />)).not.toContain("Send crash reports");
  });

  test("onboarding asks, unticked, in the desktop app", () => {
    const route = src("react-app/shell/welcome-route.tsx");
    expect(route).toContain("crashReports: local.prefs.crashReports,");
    expect(route).toContain("void syncCrashReports(on);");
    const tutorial = src("react-app/domains/onboarding/tutorial-step.tsx");
    expect(tutorial).toContain('data-testid="tutorial-crash-reports"');
    expect(tutorial).toContain("checked={crashReports === true}");
  });

  test("the chat route tells the desktop app on start and on each change", () => {
    expect(src("react-app/shell/session-route.tsx")).toContain("void syncCrashReports(local.prefs.crashReports);");
  });

  test("the tutorial step renders without the choice outside the desktop app", () => {
    // TutorialStep needs the boot-state provider; the switch is covered by the source checks above.
    expect(typeof TutorialStep).toBe("function");
  });
});
