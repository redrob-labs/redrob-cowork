import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

import { DeskBrowserView, tabTitle, type DeskBrowserViewProps } from "../src/react-app/desk/panel/desk-browser";
import {
  addressHost,
  addressTarget,
  agentBarFor,
  BROWSER_HELD_ERROR,
  browserHeldByPerson,
  browserHeldResult,
  deskTabId,
  handBack,
  pageFor,
  SEARCH_URL,
  takeOver,
} from "../src/react-app/desk/panel/desk-browser-state";
import type { DeskPage } from "../src/react-app/desk/run/desk-pages";
import { createFrameStore } from "../src/react-app/desk/store/frame-store";
import type { DeskTimers, TimerHandle } from "../src/react-app/desk/timers";
import type { BrowserPanelTab } from "../src/react-app/domains/session/panel/panel-tab-store";
import { BrowserPanelContent } from "../src/react-app/domains/session/panel/side-panel";
import { TooltipProvider } from "../src/components/ui/tooltip";

function render(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/chat/chat-1"]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const LAW_URL = "https://www.law.go.kr/lsInfoP.do?lsiSeq=100&efYd=20260101#J111";

const tab = (patch: Partial<BrowserPanelTab> = {}): BrowserPanelTab => ({
  id: "law",
  type: "browser",
  label: "Civil Act, Article 111",
  url: LAW_URL,
  favicon: null,
  status: "ready",
  canGoBack: true,
  canGoForward: false,
  ...patch,
});

const blank = tab({ id: "new", label: "New tab", url: "about:blank", canGoBack: false });

const noop = () => {};
function view(patch: Partial<DeskBrowserViewProps> = {}) {
  return render(
    <DeskBrowserView
      tabs={[tab(), blank]}
      activeId="law"
      deskTabId="law"
      desk="reading"
      pages={[]}
      onSelectTab={noop}
      onNewTab={noop}
      onBack={noop}
      onForward={noop}
      onReload={noop}
      onNavigate={noop}
      onTakeOver={noop}
      onHandBack={noop}
      {...patch}
    />,
  );
}

/** The `<button>` whose aria-label is `label`. */
function button(html: string, label: string): string {
  const match = new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html);
  expect(match).not.toBeNull();
  return match?.[0] ?? "";
}

describe("addressHost", () => {
  test("the host only, never the path", () => {
    expect(addressHost("https://law.go.kr/x/y?z")).toBe("law.go.kr");
    expect(addressHost(LAW_URL)).toBe("law.go.kr");
    expect(addressHost("http://localhost:3000/a")).toBe("localhost");
  });

  test("nothing for a blank page, an invalid address or a page that is not on the web", () => {
    expect(addressHost("about:blank")).toBe("");
    expect(addressHost("not a url")).toBe("");
    expect(addressHost("file:///Users/kim/a.html")).toBe("");
    expect(addressHost("")).toBe("");
    expect(addressHost(null)).toBe("");
  });
});

describe("addressTarget", () => {
  test("a web address goes there, something like one gets https://, anything else is a search", () => {
    expect(addressTarget("https://law.go.kr/x")).toBe("https://law.go.kr/x");
    expect(addressTarget(" law.go.kr ")).toBe("https://law.go.kr");
    expect(addressTarget("scourt.go.kr/holidays")).toBe("https://scourt.go.kr/holidays");
    expect(addressTarget("localhost:5173")).toBe("https://localhost:5173");
    expect(addressTarget("civil act article 111")).toBe(`${SEARCH_URL}civil%20act%20article%20111`);
    expect(addressTarget("민법 제111조")).toBe(`${SEARCH_URL}${encodeURIComponent("민법 제111조")}`);
    expect(addressTarget("   ")).toBeNull();
  });
});

describe("the page and Desk's tab", () => {
  test("blank is the new tab page, a failed load is an error, anything else is the page", () => {
    expect(pageFor(null)).toBe("new");
    expect(pageFor(blank)).toBe("new");
    expect(pageFor(tab({ url: "" }))).toBe("new");
    expect(pageFor(tab({ status: "error" }))).toBe("error");
    expect(pageFor(tab({ status: "loading" }))).toBe("web");
  });

  test("Desk's tab: pinned, else the one on the site Desk opened, else the active one; none before a web step", () => {
    const tabs = [blank, tab()];
    expect(deskTabId(tabs, { pinned: null, reading: null, activeId: "new" })).toBeNull();
    expect(deskTabId(tabs, { pinned: null, reading: { url: "https://law.go.kr/other" }, activeId: "new" })).toBe("law");
    expect(deskTabId(tabs, { pinned: null, reading: { url: null }, activeId: "new" })).toBe("new");
    expect(deskTabId(tabs, { pinned: "new", reading: { url: "https://law.go.kr" }, activeId: "law" })).toBe("new");
    expect(deskTabId(tabs, { pinned: "gone", reading: { url: "https://law.go.kr" }, activeId: "new" })).toBe("law");
  });

  test("a tab is named by its title, by its host when the title is its address, New tab when blank", () => {
    expect(tabTitle(tab())).toBe("Civil Act, Article 111");
    expect(tabTitle(tab({ label: LAW_URL }))).toBe("law.go.kr");
    expect(tabTitle(blank)).toBe("New tab");
  });
});

describe("the bar under the address", () => {
  test("reading with Take over, yours with Hand back, done with no button", () => {
    expect(agentBarFor("reading")).toEqual({
      state: "running",
      label: "Desk is reading this page",
      action: { kind: "take-over", label: "Take over" },
    });
    expect(agentBarFor("you")).toEqual({
      state: "stopped",
      label: "You have this tab",
      action: { kind: "hand-back", label: "Hand back" },
    });
    expect(agentBarFor("done")).toEqual({ state: "done", label: "Desk is done with this page", action: null });
  });

  test("Take over hands the tab to the person with a toast; Hand back gives it to Desk", () => {
    // The toast's timer never fires here, so the toast is still up to be read.
    const timers: DeskTimers = {
      setTimeout: () => globalThis.setTimeout(() => {}, 0),
      clearTimeout: (handle: TimerHandle) => globalThis.clearTimeout(handle),
    };
    const frame = createFrameStore({ storage: () => null, timers });
    frame.getState().setDesk("reading");
    takeOver(frame.getState());
    expect(frame.getState().browser.desk).toBe("you");
    expect(frame.getState().toast).toMatchObject({ title: "You have the tab", text: "Desk waits until you hand it back." });
    handBack(frame.getState());
    expect(frame.getState().browser.desk).toBe("reading");
  });

  test("while the person has the tab, Desk's browser actions are refused", () => {
    expect(browserHeldByPerson("you")).toBe(true);
    expect(browserHeldByPerson("reading")).toBe(false);
    expect(browserHeldByPerson("done")).toBe(false);
    expect(browserHeldResult("you")).toEqual({ ok: false, error: BROWSER_HELD_ERROR });
    expect(browserHeldResult("reading")).toBeNull();
    expect(BROWSER_HELD_ERROR).toBe("The person has this tab. Wait until they hand it back.");
  });

  test("the session page checks it before opening a url or setting a proxy", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "src", "react-app", "domains", "session", "chat", "session-page.tsx"),
      "utf8",
    );
    const openUrl = source.slice(source.indexOf('id: "browser.open_url"'), source.indexOf("useControlAction(openBrowserUrlControlAction)"));
    const proxy = source.slice(source.indexOf('id: "browser.set_proxy"'), source.indexOf("useControlAction(setBrowserProxyControlAction)"));
    for (const action of [openUrl, proxy]) {
      expect(action).toContain("browserHeldResult(useFrameStore.getState().browser.desk)");
      expect(action).toContain("if (held) return held;");
    }
    expect(openUrl.indexOf("if (held) return held;")).toBeLessThan(openUrl.indexOf("openUrl?.("));
  });
});

describe("DeskBrowserView markup", () => {
  test("a tablist of tabs, the selected one marked, and a New tab button", () => {
    const html = view();
    expect(html).toContain('role="tablist" aria-label="Browser tabs"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*role="tab" aria-selected="true"[^>]*title="Civil Act, Article 111"/);
    expect(html).toContain('aria-label="New tab"');
  });

  test("the live dot is on Desk's tab only while Desk reads", () => {
    expect(view().match(/aria-label="Desk is using this tab"/g)).toHaveLength(1);
    expect(view({ desk: "you" })).not.toContain("Desk is using this tab");
    expect(view({ desk: "done" })).not.toContain("Desk is using this tab");
  });

  test("the address shows the host, never the full address", () => {
    const html = view();
    expect(html).toMatch(/<input[^>]*value="law.go.kr"/);
    expect(html).toContain('aria-label="Address"');
    expect(html).toContain('placeholder="Search, or type a web address"');
    expect(html).not.toContain("lsInfoP");
    expect(html).not.toContain("www.law.go.kr");
    expect(html).not.toContain(LAW_URL);
    // Not even through a tab whose title is its address.
    expect(view({ tabs: [tab({ label: LAW_URL })] })).not.toContain("lsInfoP");
  });

  test("Back and Forward are disabled when there is nowhere to go", () => {
    const html = view();
    expect(button(html, "Back")).not.toContain("disabled");
    expect(button(html, "Forward")).toContain("disabled");
    const fresh = view({ activeId: "new" });
    expect(button(fresh, "Back")).toContain("disabled");
  });

  test("the bar: reading with Take over, yours with Hand back, done without a button, none on another tab", () => {
    expect(view()).toContain("Desk is reading this page");
    expect(view()).toContain(">Take over<");
    expect(view({ desk: "you" })).toContain("You have this tab");
    expect(view({ desk: "you" })).toContain(">Hand back<");
    const done = view({ desk: "done" });
    expect(done).toContain("Desk is done with this page");
    expect(done).not.toContain("Take over");
    expect(done).not.toContain("Hand back");
    expect(view({ deskTabId: null })).not.toContain("Desk is reading this page");
    expect(view({ activeId: "new" })).not.toContain("Desk is reading this page");
  });

  test("the page is Electron's: an empty area, with no new tab page over it", () => {
    const html = view();
    expect(html).toContain('class="desk-browser__page desk-browser__page--native"');
    expect(html).not.toContain("Sites you sign in to here");
  });

  test("a blank tab is the new tab page: the sentence and today's pages with their chats", () => {
    const pages: DeskPage[] = [
      { url: "https://law.go.kr/x", host: "law.go.kr", chatId: "chat-1", chatTitle: "Notice by email - valid?", at: 1 },
      { url: "https://scourt.go.kr/y", host: "scourt.go.kr", chatId: "chat-2", chatTitle: null, at: 2 },
    ];
    const html = view({ activeId: "new", pages });
    expect(html).toContain("Sites you sign in to here stay signed in for Desk, on this computer only.");
    expect(html).toContain("Pages Desk read today");
    expect(html).toContain("<b>law.go.kr</b><span>for Notice by email - valid?</span>");
    expect(html).toContain("<b>scourt.go.kr</b><span>for Untitled chat</span>");
    expect(html).not.toContain("desk-browser__page--native");
    expect(html).not.toContain("law.go.kr/x");
    expect(view({ activeId: "new" })).toContain("Pages Desk reads for your chats appear here.");
  });

  test("with no tab at all it is still the new tab page", () => {
    const html = view({ tabs: [], activeId: null, deskTabId: null });
    expect(html).toContain("Sites you sign in to here");
    expect(html).not.toContain('role="tab"');
  });

  test("a page that did not load names its host, never a raw browser error", () => {
    const html = view({ tabs: [tab({ status: "error", label: "ERR_NAME_NOT_RESOLVED" })], deskTabId: null });
    expect(html).toContain("law.go.kr did not open");
    expect(html).toContain("Check the address, or try again in a moment.");
    expect(html).toContain(">Try again<");
    expect(html).not.toContain("desk-browser__page--native");
    expect(html).not.toContain("lsInfoP");
    expect(html).not.toContain("ERR_");
  });
});

describe("the old panel's browser", () => {
  test("BrowserPanelContent still renders its own bar", () => {
    const html = render(
      <TooltipProvider>
        <BrowserPanelContent tab={tab()} />
      </TooltipProvider>,
    );
    // Outside the desktop app it says so; the native page and its bounds are Electron's.
    expect(html).toContain("flex h-10 shrink-0");
  });
});

describe("the browser stylesheet", () => {
  const css = readFileSync(join(import.meta.dir, "..", "src", "app", "index.css"), "utf8");
  const start = css.indexOf(".desk-browser {");
  const block = css.slice(start, css.indexOf("/**", start));

  test("selects no design system class and reads radii through --theme()", () => {
    expect(start).toBeGreaterThan(-1);
    const selectors = [...block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{/g)].map((match) => match[1]);
    expect(selectors.filter((selector) => selector.includes(".rr-"))).toEqual([]);
    expect(block).not.toContain("var(--radius");
    expect(block).toContain("--theme(--radius-md)");
  });

  test("the live dot stops pulsing for reduced motion", () => {
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.desk-browser__live \{\s*animation: none;/);
  });
});
