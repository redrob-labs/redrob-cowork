import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { IconButton, type IconButtonProps } from "@redrob-labs/ui";

import {
  DeskSidePanelView,
  panelBrowserTab,
  panelSwitch,
  panelTitle,
} from "../src/react-app/desk/panel/desk-side-panel";
import {
  applyFramePanelCommand,
  FILES_TARGET,
  routeSidePanelRequest,
} from "../src/react-app/desk/panel/route-side-panel";
import { isDeskFramePath, isToggleBrowserShortcut, type ShortcutKey } from "../src/react-app/desk/shell/desk-layer";
import { DeskShellView, deskShellClassName } from "../src/react-app/desk/shell/desk-shell";
import { createFrameStore, useFrameStore, type PanelTab } from "../src/react-app/desk/store/frame-store";
import type { ArtifactPanelTab, BrowserPanelTab } from "../src/react-app/domains/session/panel/panel-tab-store";

function render(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/chat"]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Every IconButton in an element tree, by walking the elements a function component returns. */
function iconButtons(node: ReactNode): Array<ReactElement<IconButtonProps>> {
  const found: Array<ReactElement<IconButtonProps>> = [];
  const walk = (child: ReactNode) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === IconButton && isValidElement<IconButtonProps>(child)) {
      found.push(child);
      return;
    }
    Children.forEach(child.props.children, walk);
  };
  walk(node);
  return found;
}

function view(tab: PanelTab, calls: string[] = []) {
  return DeskSidePanelView({
    tab,
    onSwitch: (to) => calls.push(`switch:${to}`),
    onClose: () => calls.push("close"),
    children: <p>Body</p>,
  });
}

/** The markup of the panel's header, from the `aside` to the end of its first row. */
function panelHeader(html: string): string {
  const start = html.indexOf('<aside class="desk-panel"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('<div class="desk-panel__body', start));
}

const browserTab = (id: string): BrowserPanelTab => ({
  id,
  type: "browser",
  label: id,
  url: `https://${id}.example`,
  favicon: null,
  status: "ready",
  canGoBack: false,
  canGoForward: false,
});

afterEach(() => useFrameStore.getState().closePanel());

describe("the side panel header", () => {
  test("titles the panel Browser or Files, as an h2", () => {
    expect(panelTitle("browser")).toBe("Browser");
    expect(panelTitle("files")).toBe("Files");
    expect(render(view("files"))).toContain('<h2 class="desk-panel__title">Files</h2>');
    expect(render(view("browser"))).toContain('<h2 class="desk-panel__title">Browser</h2>');
  });

  test("has exactly two buttons: the switch, then Close", () => {
    for (const tab of ["browser", "files"] satisfies PanelTab[]) {
      const header = panelHeader(render(view(tab)));
      expect(header.match(/<button/g)?.length).toBe(2);
      expect(header).not.toContain('role="tablist"');
    }
    expect(iconButtons(view("browser")).map((button) => button.props.label)).toEqual(["Show files", "Close"]);
    expect(iconButtons(view("files")).map((button) => button.props.label)).toEqual(["Show the browser", "Close"]);
  });

  test("the switch goes to the other tab and Close closes", () => {
    const calls: string[] = [];
    // The handlers ignore the click event, so they are pressed here without one.
    const press = (button: ReactElement<IconButtonProps>) => Reflect.apply(button.props.onClick ?? (() => {}), undefined, []);
    iconButtons(view("browser", calls)).forEach(press);
    iconButtons(view("files", calls)).forEach(press);
    expect(calls).toEqual(["switch:files", "close", "switch:browser", "close"]);
    expect(panelSwitch("browser").to).toBe("files");
    expect(panelSwitch("files").to).toBe("browser");
  });

  test("the browser body is flush, Files keeps its padding", () => {
    expect(render(view("browser"))).toContain('class="desk-panel__body desk-panel__body--flush"');
    expect(render(view("files"))).toContain('class="desk-panel__body"');
  });
});

describe("the browser tab the panel shows", () => {
  test("is the active page, else the first page, else none", () => {
    const a = browserTab("a");
    const b = browserTab("b");
    const artifact: ArtifactPanelTab = { id: "file:x.md", type: "artifact", label: "x.md", preview: "markdown" };
    expect(panelBrowserTab({ tabs: [a, b], activeTabId: "b" })).toBe(b);
    expect(panelBrowserTab({ tabs: [artifact, a], activeTabId: artifact.id })).toBe(a);
    expect(panelBrowserTab({ tabs: [artifact], activeTabId: artifact.id })).toBeNull();
    expect(panelBrowserTab({ tabs: [], activeTabId: null })).toBeNull();
  });
});

describe("DeskShell with the side panel", () => {
  const shell = (panelOpen: boolean) =>
    render(
      <DeskShellView title="Chat" rail={<p>Screen rail</p>} panelOpen={panelOpen} onTogglePanel={() => undefined}>
        <p>Work</p>
      </DeskShellView>,
    );

  test("open: the panel sits beside the work and the screen's rail steps aside", () => {
    const html = shell(true);
    expect(html).toContain('class="desk-shell desk-shell--panel"');
    expect(html).toContain('<aside class="desk-panel" aria-label="Files">');
    // Files load through a query, so the first render holds the list's place.
    expect(html).toContain('<div class="desk-panel__body">');
    expect(html).not.toContain("Screen rail");
    expect(html).toContain('aria-label="Close the side panel"');
    // The panel follows the AppShell, so it is the column to the right of the work.
    expect(html.indexOf("Work")).toBeLessThan(html.indexOf('class="desk-panel"'));
  });

  test("closed: no panel, and the rail is back", () => {
    const html = shell(false);
    expect(html).not.toContain("desk-panel");
    expect(html).toContain("Screen rail");
    expect(deskShellClassName(true, false)).toBe("desk-shell desk-shell--fill");
    expect(deskShellClassName(true, true)).toBe("desk-shell desk-shell--fill desk-shell--panel");
  });

  test("the toggle reopens whatever the panel showed last, Files the first time", () => {
    const store = createFrameStore({ storage: () => null });
    store.getState().togglePanel();
    expect(store.getState().panel).toMatchObject({ open: true, tab: "files" });
    store.getState().openPanel("browser");
    store.getState().togglePanel();
    store.getState().togglePanel();
    expect(store.getState().panel).toMatchObject({ open: true, tab: "browser" });
  });
});

describe("Ctrl+Shift+B", () => {
  const key = (patch: Partial<ShortcutKey>): ShortcutKey => ({
    key: "B",
    code: "KeyB",
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    ...patch,
  });

  test("Ctrl on Windows and Linux, Cmd on a Mac", () => {
    expect(isToggleBrowserShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isToggleBrowserShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isToggleBrowserShortcut(key({ metaKey: true }), false)).toBe(false);
    expect(isToggleBrowserShortcut(key({ ctrlKey: true }), true)).toBe(false);
  });

  test("needs Shift, and no Alt", () => {
    expect(isToggleBrowserShortcut(key({ ctrlKey: true, shiftKey: false, key: "b" }), false)).toBe(false);
    expect(isToggleBrowserShortcut(key({ ctrlKey: true, altKey: true }), false)).toBe(false);
  });

  test("only B, by letter or by the physical key under a Korean layout", () => {
    expect(isToggleBrowserShortcut(key({ ctrlKey: true, key: "b", code: "" }), false)).toBe(true);
    expect(isToggleBrowserShortcut(key({ ctrlKey: true, key: "ㅠ" }), false)).toBe(true);
    expect(isToggleBrowserShortcut(key({ ctrlKey: true, key: "N", code: "KeyN" }), false)).toBe(false);
    expect(isToggleBrowserShortcut(key({ ctrlKey: true, key: "F", code: "KeyF" }), false)).toBe(false);
  });

  test("works on the Desk screens, not on the ones outside the frame", () => {
    for (const path of ["/chat", "/chat/abc", "/workspace/w/session/abc", "/projects", "/memory/you", "/settings/general", "/settings/plan"]) {
      expect(isDeskFramePath(path)).toBe(true);
    }
    // The developer settings keep their own sidebar, outside the frame.
    for (const path of ["/welcome", "/extensions", "/extensions/x", "/settings/ai", "/workspace/w/settings/extensions", "/workspace/w/extensions"]) {
      expect(isDeskFramePath(path)).toBe(false);
    }
  });
});

describe("the session page defers its side panel to the frame", () => {
  test("in the frame, panel requests become frame commands", () => {
    expect(routeSidePanelRequest("panel", true)).toEqual({ kind: "open", tab: "browser" });
    expect(routeSidePanelRequest("panel", true, FILES_TARGET)).toEqual({ kind: "open", tab: "files" });
    expect(routeSidePanelRequest("panel", true, { tab: "files", file: "file:a.md" })).toEqual({ kind: "file", id: "file:a.md" });
    expect(routeSidePanelRequest("panel", true, { tab: "files", toggle: true })).toEqual({ kind: "toggle", tab: "files" });
  });

  test("voice, extensions and closing stay with the session page, and nothing moves outside the frame", () => {
    expect(routeSidePanelRequest("voice", true)).toBeNull();
    expect(routeSidePanelRequest("extensions", true)).toBeNull();
    expect(routeSidePanelRequest(null, true)).toBeNull();
    expect(routeSidePanelRequest("panel", false)).toBeNull();
    expect(routeSidePanelRequest("panel", false, { tab: "files", toggle: true })).toBeNull();
  });

  test("the commands drive the frame store", () => {
    const store = createFrameStore({ storage: () => null });
    const run = (request: Parameters<typeof routeSidePanelRequest>[2]) => {
      const command = routeSidePanelRequest("panel", true, request);
      if (command) applyFramePanelCommand(command, store.getState());
    };

    run({ tab: "browser" });
    expect(store.getState().panel).toMatchObject({ open: true, tab: "browser" });
    run({ tab: "files", file: "file:a.md" });
    expect(store.getState().panel).toMatchObject({ open: true, tab: "files", file: "file:a.md" });
    run({ tab: "files", toggle: true });
    expect(store.getState().panel.open).toBe(false);
    run({ tab: "files", toggle: true });
    expect(store.getState().panel).toMatchObject({ open: true, tab: "files" });
    run({ tab: "browser", toggle: true });
    expect(store.getState().panel).toMatchObject({ open: true, tab: "browser" });
  });
});

describe("the side panel stylesheet", () => {
  const css = readFileSync(join(import.meta.dir, "..", "src", "app", "index.css"), "utf8");
  const start = css.indexOf(".desk-shell--panel {");
  // The panel's rules run from its grid to the next commented section.
  const block = css.slice(start, css.indexOf("/**", start));

  test("440px, 400px under 1180px, and a sheet with the large shadow under 900px", () => {
    expect(block).toContain("grid-template-columns: minmax(0, 1fr) 440px;");
    expect(block).toMatch(/@media \(max-width: 1180px\) \{\s*\.desk-shell--panel \{\s*grid-template-columns: minmax\(0, 1fr\) 400px;/);
    expect(block).toMatch(/@media \(max-width: 900px\) \{[\s\S]*\.desk-panel \{\s*position: fixed;[\s\S]*box-shadow: var\(--shadow-lg\);/);
    expect(block).toContain("min-height: 57px;");
    expect(block).toContain("border-left: 1px solid var(--border-subtle);");
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.desk-panel \{\s*animation: none;/);
  });

  test("selects no design system class", () => {
    const selectors = [...block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{/g)].map((match) => match[1]);
    expect(selectors.length).toBeGreaterThan(5);
    expect(selectors.filter((selector) => selector.includes(".rr-"))).toEqual([]);
  });
});
