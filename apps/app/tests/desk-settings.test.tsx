import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

import { DEFAULT_CROSS_CHECK } from "../src/react-app/desk/composer/composer-state";
import { createKeepAwakeSync, readKeepAwakePreference, runIsBusy } from "../src/react-app/desk/run/keep-awake";
import {
  DeskSettingsGate,
  DeskSettingsGateView,
  DeskSettingsView,
  FoldersView,
  GeneralView,
  PlanView,
  SAMPLE_FOLDERS,
  SettingsNav,
  folderRows,
  generalActions,
  languageOptions,
  textSizeOptions,
  type GeneralDeps,
  type GeneralValues,
  type PlanViewProps,
} from "../src/react-app/desk/settings/desk-settings";
import {
  DESK_SETTINGS_SECTIONS,
  folderPlace,
  isDeskSettingsPath,
  notificationPreference,
  notifiesWhenDone,
  removeFolder,
  resolveSettingsSection,
  textSizeForZoom,
  zoomForTextSize,
  type DeskSettingsSection,
} from "../src/react-app/desk/settings/settings-sections";
import { REDROB_CONSOLE_BILLING_URL } from "../src/react-app/domains/settings/redrob-provider";
import { LocalProvider, type LocalPreferences } from "../src/react-app/kernel/local-provider";
import { ShellConfigProvider } from "../src/react-app/shell/shell-config";

function render(node: ReactNode, path = "/settings/general") {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LocalProvider>
        <ShellConfigProvider>
          <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
        </ShellConfigProvider>
      </LocalProvider>
    </QueryClientProvider>,
  );
}

/** What a person reads or hears: the text between tags, and the labels a screen reader says. */
function readable(html: string): string {
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);
  return [html.replace(/<[^>]*>/g, " "), ...labels].join(" ");
}

const PREFS: LocalPreferences = {
  showThinking: true,
  modelVariant: null,
  defaultModel: null,
  selectedAgent: null,
  deskNewChatMode: "run",
  deskCrossCheck: DEFAULT_CROSS_CHECK,
  deskKeepAwake: true,
  releaseChannel: "stable",
  featureFlags: { microsandboxCreateSandbox: true, continuousEngine: false, memory: false },
  hasCompletedOnboarding: true,
  analyticsEnabled: true,
  crashReports: false,
  desktopNotifications: "off",
};

const VALUES: GeneralValues = {
  mode: "run",
  language: "en",
  theme: "system",
  textSize: "default",
  notify: false,
  keepAwake: true,
};

function fakeGeneral() {
  const calls: string[] = [];
  let prefs = PREFS;
  const deps: GeneralDeps = {
    setPrefs: (updater) => {
      prefs = updater(prefs);
    },
    setLocale: (language) => calls.push(`locale:${language}`),
    setTheme: (theme) => calls.push(`theme:${theme}`),
    setZoom: (zoom) => calls.push(`zoom:${zoom}`),
    keepAwake: { setEnabled: (on) => calls.push(`awake:${on}`) },
    showToast: (title) => calls.push(`toast:${title}`),
  };
  return { calls, deps, prefs: () => prefs };
}

const PLAN: PlanViewProps = { connected: true, onChangeKey: () => {}, onOpenBilling: () => {}, keyStep: null };

describe("settings routing", () => {
  test("the three Desk sections always render", () => {
    for (const section of DESK_SETTINGS_SECTIONS) {
      expect(resolveSettingsSection(section, false)).toEqual({ kind: "desk", section });
      expect(resolveSettingsSection(section, true)).toEqual({ kind: "desk", section });
    }
    expect(resolveSettingsSection("plan/extra", false)).toEqual({ kind: "desk", section: "plan" });
  });

  test("a developer page needs developer mode; without it, General", () => {
    for (const section of ["ai", "extensions", "extensions/mcps", "advanced", "environment", "updates", "recovery", "debug", "preferences", "permissions", "mcp", "skills"]) {
      expect(resolveSettingsSection(section, false)).toEqual({ kind: "redirect", to: "/settings/general" });
      expect(resolveSettingsSection(section, true)).toEqual({ kind: "developer" });
    }
  });

  test("an unknown or empty section goes to General", () => {
    for (const section of ["nope", "", undefined, null]) {
      expect(resolveSettingsSection(section, true)).toEqual({ kind: "redirect", to: "/settings/general" });
    }
  });

  test("the gate renders the developer page only in developer mode", () => {
    const tree = (developerMode: boolean) => {
      const gate = <DeskSettingsGateView developer={<p>legacy settings page</p>} developerMode={developerMode} />;
      return (
        <Routes>
          <Route path="/settings/*" element={gate} />
          <Route path="/workspace/:workspaceId/settings/*" element={gate} />
          <Route path="*" element={<p>somewhere else</p>} />
        </Routes>
      );
    };
    expect(render(tree(false), "/settings/ai")).not.toContain("legacy settings page");
    expect(render(tree(false), "/workspace/w1/settings/extensions")).not.toContain("legacy settings page");
    expect(render(tree(true), "/settings/ai")).toContain("legacy settings page");
    expect(render(tree(true), "/workspace/w1/settings/extensions")).toContain("legacy settings page");
    // The app's own gate reads developer mode from the frame store, off by default.
    const appGate = (
      <Routes>
        <Route path="/settings/*" element={<DeskSettingsGate developer={<p>legacy settings page</p>} />} />
      </Routes>
    );
    expect(render(appGate, "/settings/debug")).not.toContain("legacy settings page");
  });

  test("the Desk sections render inside the frame, with Settings as the title and the section as meta", () => {
    const tree = (
      <Routes>
        <Route path="/settings/*" element={<DeskSettingsGate developer={<p>legacy settings page</p>} />} />
      </Routes>
    );
    const html = render(tree, "/settings/plan");
    expect(html).toContain("desk-shell");
    expect(html).toContain("desk-settings");
    expect(html).toContain("Settings");
    expect(html).toContain("Plan and usage");
    expect(html).not.toContain("legacy settings page");
    expect(isDeskSettingsPath("/settings/folders")).toBe(true);
    expect(isDeskSettingsPath("/workspace/w/settings/general")).toBe(true);
    expect(isDeskSettingsPath("/settings/ai")).toBe(false);
  });
});

describe("section list", () => {
  test("General, Folders, Plan and usage, and nothing else without developer mode", () => {
    const html = render(<SettingsNav current="folders" developerMode={false} />);
    expect(html).toContain('aria-label="Settings"');
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(["/settings/general", "/settings/folders", "/settings/plan"]);
    expect(html).toContain("General");
    expect(html).toContain("Folders");
    expect(html).toContain("Plan and usage");
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    expect(html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/settings/folders"');
    expect(html).not.toContain("Developer");
  });

  test("developer mode adds a Developer group linking to the existing pages", () => {
    const html = render(<SettingsNav current="general" developerMode />);
    expect(html).toContain("Developer");
    for (const tab of ["ai", "extensions", "advanced", "environment", "updates", "recovery", "debug"]) {
      expect(html).toContain(`href="/settings/${tab}"`);
    }
  });

  test("the layout numbers, and the list as a row under 900px", () => {
    const css = readFileSync(join(import.meta.dir, "..", "src", "app", "index.css"), "utf8");
    expect(css).toMatch(/\.desk-settings \{[^}]*grid-template-columns: 220px minmax\(0, 1fr\);[^}]*gap: var\(--space-10\);/);
    expect(css).toMatch(/\.desk-settings__main \{[^}]*max-width: 760px;/);
    expect(css).toMatch(/\.desk-settings__row \{[^}]*border-bottom: 1px solid var\(--border-subtle\);/);
    const narrow = [...css.matchAll(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/g)].map((match) => match[1]).join("\n");
    expect(narrow).toMatch(/\.desk-settings \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(narrow).toMatch(/\.desk-settings__nav \{[^}]*flex-direction: row;/);
  });
});

describe("General", () => {
  test("New chats start in writes the preference and says so", () => {
    const general = fakeGeneral();
    const actions = generalActions(general.deps);
    actions.onMode("plan");
    expect(general.prefs().deskNewChatMode).toBe("plan");
    expect(general.calls).toEqual(["toast:New chats start in Plan"]);
    actions.onMode("run");
    expect(general.prefs().deskNewChatMode).toBe("run");
  });

  test("Language offers exactly English and 한국어, and applies the choice", () => {
    expect(languageOptions()).toEqual([
      { value: "en", label: "English" },
      { value: "ko", label: "한국어" },
    ]);
    const general = fakeGeneral();
    generalActions(general.deps).onLanguage("ko");
    expect(general.calls).toEqual(["locale:ko"]);
  });

  test("Text size maps onto the existing font zoom", () => {
    expect(zoomForTextSize("small")).toBe(0.9);
    expect(zoomForTextSize("default")).toBe(1);
    expect(zoomForTextSize("large")).toBe(1.1);
    expect(textSizeForZoom(null)).toBe("default");
    expect(textSizeForZoom(0.8)).toBe("small");
    expect(textSizeForZoom(1)).toBe("default");
    expect(textSizeForZoom(1.3)).toBe("large");
    expect(textSizeOptions().map((option) => option.label)).toEqual(["Small", "Default", "Large"]);
    const general = fakeGeneral();
    generalActions(general.deps).onTextSize("large");
    expect(general.calls).toEqual(["zoom:1.1"]);
  });

  test("the switches set the notification preference and keep-awake", () => {
    expect(notificationPreference(true)).toBe("all");
    expect(notificationPreference(false)).toBe("off");
    expect(notifiesWhenDone("all")).toBe(true);
    expect(notifiesWhenDone("important")).toBe(false);
    expect(notifiesWhenDone("off")).toBe(false);

    const general = fakeGeneral();
    const actions = generalActions(general.deps);
    actions.onNotify(true);
    expect(general.prefs().desktopNotifications).toBe("all");
    actions.onKeepAwake(false);
    expect(general.prefs().deskKeepAwake).toBe(false);
    expect(general.calls).toEqual(["awake:false"]);
    actions.onTheme("dark");
    expect(general.calls).toEqual(["awake:false", "theme:dark"]);
  });

  test("renders the three groups with their controls", () => {
    const html = render(<GeneralView values={{ ...VALUES, notify: true }} actions={generalActions(fakeGeneral().deps)} />);
    for (const text of ["Starting", "Looks", "While Desk works", "New chats start in", "Language", "Theme", "Text size"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/type="radio"/g)?.length).toBe(2);
    expect(html.match(/role="switch"/g)?.length).toBe(2);
    expect(html).toContain('aria-label="Tell me when a long task finishes"');
    expect(html).toContain('aria-label="Keep this computer awake during a run"');
    expect(html).toContain('for="desk-settings-language"');
    expect(html).toContain('id="desk-settings-language"');
    expect(html).not.toContain("हिन्दी");
  });
});

describe("Folders", () => {
  test("a folder by name and place, never the path", () => {
    expect(folderPlace("C:\\Users\\x\\Documents\\Seorin MSA")).toEqual({ name: "Seorin MSA", where: "in Documents" });
    expect(folderPlace("C:\\Users\\x\\Seorin")).toEqual({ name: "Seorin", where: "in your user folder" });
    expect(folderPlace("D:\\Scans")).toEqual({ name: "Scans", where: "on drive D" });
    expect(folderPlace("d:\\Scans\\")).toEqual({ name: "Scans", where: "on drive D" });
    expect(folderPlace("/Users/x/Documents/A")).toEqual({ name: "A", where: "in Documents" });
    expect(folderPlace("/home/x/notes")).toEqual({ name: "notes", where: "in your user folder" });
    expect(folderPlace("/home/x/work/clients/acme")).toEqual({ name: "acme", where: "in clients" });
    expect(folderPlace("/data/reports", "/home/x")).toEqual({ name: "reports", where: "in data" });
    expect(folderPlace("/srv/team/notes", "/srv/team")).toEqual({ name: "notes", where: "in your user folder" });
    expect(folderPlace("D:\\")).toEqual({ name: "Drive D", where: "on this computer" });
  });

  test("the list shows no path", () => {
    const paths = [...SAMPLE_FOLDERS, "C:\\Users\\x\\Documents\\Seorin MSA", "/home/x/notes"];
    const html = render(<FoldersView rows={folderRows(paths, null)} removing={null} onRemove={() => {}} />);
    const text = readable(html);
    expect(text).not.toMatch(/[\\/]|\b[A-Za-z]:/);
    for (const path of paths) expect(html).not.toContain(path);
    expect(text).toContain("Seorin MSA");
    expect(text).toContain("in Documents");
    expect(text).toContain("on drive D");
    expect(text).toContain("Remove Seorin MSA");
    expect(text).toContain("Desk always asks before it deletes a file, or sends, posts, signs or pays for anything.");
  });

  test("Remove keeps the rest and says Desk will ask again", async () => {
    const calls: string[] = [];
    const toasts: string[] = [];
    const rest = await removeFolder(
      {
        client: {
          setAuthorizedFolders: async (workspaceId, folders) => {
            calls.push(`${workspaceId}:${folders.join("|")}`);
            return { folders, hiddenCount: 0, updatedAt: 1 };
          },
        },
        workspaceId: "w1",
        folders: ["/a/Keep", "/b/Seorin MSA", "/c/Also"],
        showToast: (title, text) => toasts.push(`${title} / ${text}`),
      },
      "/b/Seorin MSA",
    );
    expect(rest).toEqual(["/a/Keep", "/c/Also"]);
    expect(calls).toEqual(["w1:/a/Keep|/c/Also"]);
    expect(toasts).toEqual(["Access removed / Desk will ask again if it needs Seorin MSA."]);
  });

  test("a failed save says nothing was removed", async () => {
    const toasts: string[] = [];
    const attempt = removeFolder(
      {
        client: { setAuthorizedFolders: async () => Promise.reject(new Error("offline")) },
        workspaceId: "w1",
        folders: ["/a/One"],
        showToast: (title) => toasts.push(title),
      },
      "/a/One",
    );
    await expect(attempt).rejects.toThrow("offline");
    expect(toasts).toEqual([]);
  });

  test("no folders: the empty state", () => {
    const html = render(<FoldersView rows={[]} removing={null} onRemove={() => {}} />);
    expect(html).toContain("No folders yet");
    expect(html).toContain("Desk asks the first time a chat or a project needs one.");
  });
});

describe("Plan and usage", () => {
  test("says whether the key is connected, and offers to change or add it", () => {
    const connected = render(<PlanView {...PLAN} />);
    expect(connected).toContain("Redrob Auto picks the best AI for each message");
    expect(connected).toContain("Connected. Every chat uses it.");
    expect(connected).toContain("Change key");
    const missing = render(<PlanView {...PLAN} connected={false} />);
    expect(missing).toContain("Not connected. Add your key to start chatting.");
    expect(missing).toContain("Add key");
    expect(render(<PlanView {...PLAN} connected={null} />)).toContain("Checking the connection");
  });

  test("Change key opens the existing key entry from onboarding", () => {
    expect(render(<PlanView {...PLAN} />)).not.toContain("redrob-submit-key");
    const open = render(
      <PlanView {...PLAN} keyStep={{ busy: false, error: null, onSubmitKey: () => {}, onCancel: () => {} }} />,
    );
    expect(open).toContain('data-testid="redrob-submit-key"');
    expect(open).toContain("Not now");
  });

  test("links to billing on the console and to the Model Guide, with no usage bar", () => {
    const html = render(<PlanView {...PLAN} />);
    expect(REDROB_CONSOLE_BILLING_URL).toBe("https://console.redrob.ai/billing");
    expect(html).toContain('href="https://console.redrob.ai/billing"');
    expect(html).toContain("See your usage and billing");
    expect(html).toContain('href="/guide"');
    expect(html).toContain("See which AI does what");
    expect(html).not.toContain("progressbar");
    expect(html).not.toContain("rr-progress");
  });
});

describe("developer words", () => {
  test("none of them appear in the Desk sections without developer mode", () => {
    const sections: Array<[DeskSettingsSection, ReactNode]> = [
      ["general", <GeneralView values={VALUES} actions={generalActions(fakeGeneral().deps)} />],
      ["folders", <FoldersView rows={folderRows(SAMPLE_FOLDERS, null)} removing={null} onRemove={() => {}} />],
      ["folders", <FoldersView rows={[]} removing={null} onRemove={() => {}} />],
      ["plan", <PlanView {...PLAN} />],
      ["plan", <PlanView {...PLAN} connected={false} />],
      ["plan", <PlanView {...PLAN} connected={null} />],
      // Change key open: the reused key step takes the Desk's plainer words.
      ["plan", <PlanView {...PLAN} keyStep={{ busy: false, error: null, onSubmitKey: () => {}, onCancel: () => {} }} />],
    ];
    for (const [section, node] of sections) {
      const text = readable(
        render(
          <DeskSettingsView section={section} developerMode={false}>
            {node}
          </DeskSettingsView>,
        ),
      ).toLowerCase();
      for (const word of ["api key", "provider", "mcp", "config file", "log", "update channel", "environment variable"]) {
        expect(text).not.toContain(word);
      }
    }
  });
});

describe("keep awake", () => {
  test("starts once while a run is busy with the setting on, and stops when idle", () => {
    const sent: boolean[] = [];
    const sync = createKeepAwakeSync((on) => sent.push(on), true);
    sync.setBusy(true);
    sync.setBusy(true);
    expect(sent).toEqual([true]);
    sync.setBusy(false);
    sync.setBusy(false);
    expect(sent).toEqual([true, false]);
  });

  test("turning the setting off mid-run stops it; on again resumes it", () => {
    const sent: boolean[] = [];
    const sync = createKeepAwakeSync((on) => sent.push(on), true);
    sync.setBusy(true);
    sync.setEnabled(false);
    sync.setBusy(true);
    expect(sent).toEqual([true, false]);
    sync.setEnabled(true);
    expect(sent).toEqual([true, false, true]);
  });

  test("off from the start never asks to stay awake; the first answer still clears an old hold", () => {
    const sent: boolean[] = [];
    const sync = createKeepAwakeSync((on) => sent.push(on), false);
    sync.setBusy(false);
    sync.setBusy(true);
    sync.setBusy(false);
    expect(sent).toEqual([false]);
  });

  test("busy is any chat with a run that has not answered", () => {
    expect(runIsBusy({ live: {} })).toBe(false);
    expect(runIsBusy({ live: { s1: true } })).toBe(true);
  });

  test("reads the saved setting, on by default", () => {
    const storage = (raw: string | null) => ({ getItem: () => raw });
    expect(readKeepAwakePreference(null)).toBe(true);
    expect(readKeepAwakePreference(storage(null))).toBe(true);
    expect(readKeepAwakePreference(storage('{"deskKeepAwake":false}'))).toBe(false);
    expect(readKeepAwakePreference(storage("not json"))).toBe(true);
  });
});
