import { t } from "../../../i18n";
import type { BrowserPanelTab } from "../../domains/session/panel/panel-tab-store";
import type { BrowserCowork, FrameState } from "../store/frame-store";

/**
 * The browser in the side panel, as pure functions: what the address field shows, where it
 * goes, which tab Cowork is on, and what the bar under the address says.
 */

/** The site's host, with no `www.`, for a web page; empty for anything else. Never the path. */
export function addressHost(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The search the panel's new tabs open on (`BROWSER_NEW_TAB_URL` in the desktop app). */
export const SEARCH_URL = "https://www.google.com/search?q=";

/**
 * Where the address field goes: a web address as typed, something that looks like one with
 * `https://` in front, and anything else as a search. Blank goes nowhere.
 */
export function addressTarget(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const looksLikeAddress = !/\s/.test(value) && (/^[^/?#]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value) || /^localhost(?::\d+)?(?:[/?#]|$)/i.test(value));
  return looksLikeAddress ? `https://${value}` : `${SEARCH_URL}${encodeURIComponent(value)}`;
}

export type BrowserPage = "new" | "error" | "web";

/** No tab or a blank one is the new tab page; a page that failed to load is an error. */
export function pageFor(tab: Pick<BrowserPanelTab, "url" | "status"> | null): BrowserPage {
  if (!tab || !tab.url || tab.url === "about:blank") return "new";
  return tab.status === "error" ? "error" : "web";
}

/**
 * The tab Cowork is on: the one the frame store pinned, else the one showing the site Cowork
 * last opened, else the active tab. Null until a web step has touched the browser.
 */
export function coworkTabId(
  tabs: ReadonlyArray<Pick<BrowserPanelTab, "id" | "url">>,
  input: { pinned: string | null; reading: { url: string | null } | null; activeId: string | null },
): string | null {
  if (input.pinned && tabs.some((tab) => tab.id === input.pinned)) return input.pinned;
  if (!input.reading) return null;
  const host = addressHost(input.reading.url);
  const match = host ? tabs.find((tab) => addressHost(tab.url) === host) : undefined;
  return match?.id ?? input.activeId;
}

export type AgentBar = {
  state: "running" | "stopped" | "done";
  label: string;
  action: { kind: "take-over" | "hand-back"; label: string } | null;
};

/** The bar under the address on Cowork's tab: reading with Take over, yours with Hand back, or done. */
export function agentBarFor(cowork: BrowserCowork): AgentBar {
  if (cowork === "reading") {
    return { state: "running", label: t("cowork.browser_reading"), action: { kind: "take-over", label: t("cowork.browser_take_over") } };
  }
  if (cowork === "you") {
    return { state: "stopped", label: t("cowork.browser_yours"), action: { kind: "hand-back", label: t("cowork.browser_hand_back") } };
  }
  return { state: "done", label: t("cowork.browser_done"), action: null };
}

/** What the agent hears when it tries to drive the browser while the person has it. Agent-facing. */
export const BROWSER_HELD_ERROR = "The person has this tab. Wait until they hand it back.";

/** Whether the person holds the browser, so Cowork's browser actions must not run. */
export function browserHeldByPerson(cowork: BrowserCowork): boolean {
  return cowork === "you";
}

/** The refusal a browser control action returns while the person holds the browser, else null. */
export function browserHeldResult(cowork: BrowserCowork): { ok: false; error: string } | null {
  return browserHeldByPerson(cowork) ? { ok: false, error: BROWSER_HELD_ERROR } : null;
}

type CoworkControls = Pick<FrameState, "setCowork" | "showToast">;

/** Take over: the tab is the person's until they hand it back, and a toast says so. */
export function takeOver(frame: CoworkControls) {
  frame.setCowork("you");
  frame.showToast(t("cowork.browser_toast_title"), t("cowork.browser_toast_text"));
}

/** Hand back: Cowork reads the tab again. */
export function handBack(frame: Pick<FrameState, "setCowork">) {
  frame.setCowork("reading");
}
