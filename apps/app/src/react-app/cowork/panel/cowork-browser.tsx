/** @jsxImportSource react */
import { useRef, useState, type FormEvent, type Ref } from "react";
import { Reorder } from "motion/react";
import { Button, EmptyState, IconButton, SectionMark, TaskStatus, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { isBlockMarkerTitle } from "../../../app/lib/session-title";
import { useSessionPanelState, type BrowserPanelTab } from "../../domains/session/panel/panel-tab-store";
import { useNativeBrowserBounds } from "../../domains/session/panel/use-native-browser-bounds";
import { useSidePanelTabs } from "../../domains/session/panel/use-side-panel-tabs";
import { getElectronBrowser } from "../../domains/session/panel/utils";
import { pagesToday, useCoworkPages, type CoworkPage } from "../run/cowork-pages";
import { useFrameStore, type BrowserCowork } from "../store/frame-store";
import {
  addressHost,
  addressTarget,
  agentBarFor,
  coworkTabId,
  handBack,
  pageFor,
  takeOver,
} from "./cowork-browser-state";

const TAB_ICON = { width: 14, height: 14, "aria-hidden": true };
const CLOSE_ICON = { width: 12, height: 12, "aria-hidden": true };
const BAR_ICON = { width: 15, height: 15, "aria-hidden": true };

/**
 * Every panel tab id in the order to store, after the browser tabs were dragged into
 * `browserOrder`. The store's reorder wants ALL of the session's tabs (it refuses a partial list),
 * and the browser view only shows browser tabs, so the other tabs keep their slots and the browser
 * slots take the new order. Pure.
 */
export function mergeTabOrder(all: readonly { id: string; type: string }[], browserOrder: readonly string[]): string[] {
  const browserIds = all.filter((tab) => tab.type === "browser").map((tab) => tab.id);
  const queue = browserOrder.filter((id, index) => browserIds.includes(id) && browserOrder.indexOf(id) === index);
  // Not the same set of browser tabs (a stale drag): keep the stored order rather than lose a tab.
  if (queue.length !== browserIds.length) return all.map((tab) => tab.id);
  return all.map((tab) => (tab.type === "browser" ? (queue.shift() ?? tab.id) : tab.id));
}

/**
 * The tab a key moves to in the tab strip (ArrowLeft/ArrowRight wrap, Home/End jump), or null for
 * any other key. Pure; the strip selects and focuses the result (roving tabindex).
 */
export function tabKeyTarget(ids: readonly string[], currentId: string, key: string): string | null {
  const at = ids.indexOf(currentId);
  if (at < 0 || ids.length === 0) return null;
  if (key === "ArrowRight") return ids[(at + 1) % ids.length] ?? null;
  if (key === "ArrowLeft") return ids[(at - 1 + ids.length) % ids.length] ?? null;
  if (key === "Home") return ids[0] ?? null;
  if (key === "End") return ids[ids.length - 1] ?? null;
  return null;
}

/** A new tab opens on the Cowork's own page, not on a search engine. */
export const NEW_TAB_URL = "about:blank";

/** A tab's name: its page title, the host when the page has none, "New tab" for a blank one. */
export function tabTitle(tab: Pick<BrowserPanelTab, "label" | "url" | "status">): string {
  const page = pageFor(tab);
  if (page === "new") return t("cowork.browser_new_tab_title");
  if (page === "error" || tab.label === tab.url || /^[a-z][a-z0-9+.-]*:\/\//i.test(tab.label)) return addressHost(tab.label) || addressHost(tab.url);
  return tab.label;
}

/** The one address field: the site's host until the person types, then what they type. */
function AddressField(props: { url: string | null; onNavigate: (target: string) => void }) {
  const host = addressHost(props.url);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = draft === null ? null : addressTarget(draft);
    if (!target) return;
    props.onNavigate(target);
    setDraft(null);
    inputRef.current?.blur();
  };
  const glyph = !host ? icons.search(TAB_ICON) : props.url?.startsWith("https:") ? icons.lock(TAB_ICON) : icons.globe(TAB_ICON);
  return (
    <form className="cowork-browser__address" onSubmit={submit} role="search">
      <label>
        {glyph}
        <input
          ref={inputRef}
          type="text"
          value={draft ?? host}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => setDraft(null)}
          placeholder={t("cowork.browser_address_placeholder")}
          aria-label={t("cowork.browser_address")}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
    </form>
  );
}

export type CoworkNewTabProps = { pages: readonly CoworkPage[]; onOpen: (url: string) => void };

/** The new tab: what signing in here means, and the pages Cowork read today with their chats. */
export function CoworkNewTab(props: CoworkNewTabProps) {
  return (
    <div className="cowork-browser__new">
      <p className="cowork-browser__lede">{t("cowork.browser_new_tab_lede")}</p>
      <section className="cowork-browser__read">
        <SectionMark as="heading" level={3} label={t("cowork.browser_read_today")} />
        {props.pages.length > 0 ? (
          <ul className="cowork-browser__pages">
            {props.pages.map((page) => (
              <li key={`${page.chatId}:${page.url}`}>
                <button type="button" onClick={() => props.onOpen(page.url)}>
                  <b>{page.host}</b>
                  <span>{t("cowork.browser_read_for", { chat: page.chatTitle && !isBlockMarkerTitle(page.chatTitle) ? page.chatTitle : t("cowork.untitled_chat") })}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cowork-browser__none">{t("cowork.browser_read_none")}</p>
        )}
      </section>
    </div>
  );
}

export type CoworkBrowserViewProps = {
  tabs: readonly BrowserPanelTab[];
  /** The tab on screen; the first tab when it is not one of `tabs`. */
  activeId: string | null;
  /** The tab Cowork is on, when a web step has touched the browser. */
  coworkTabId: string | null;
  cowork: BrowserCowork;
  pages: readonly CoworkPage[];
  /** Where Electron lays the page; only rendered while a page is showing. */
  contentRef?: Ref<HTMLDivElement>;
  onSelectTab: (id: string) => void;
  /** Closes one tab (its x, a middle click, or Ctrl/Cmd+W). */
  onCloseTab: (id: string) => void;
  /** The tabs' new order after a drag, as ids. */
  onReorderTabs: (ids: string[]) => void;
  onNewTab: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNavigate: (target: string) => void;
  onTakeOver: () => void;
  onHandBack: () => void;
};

/**
 * The browser in the side panel: tabs, Back and Forward, one address field with the host,
 * the bar saying whether Cowork or the person has the tab, and the page. The page itself is
 * Electron's, laid over `contentRef`; a blank tab is the new tab page, and a page that
 * did not load names its site.
 */
export function CoworkBrowserView(props: CoworkBrowserViewProps) {
  const tab = props.tabs.find((entry) => entry.id === props.activeId) ?? props.tabs[0] ?? null;
  const page = pageFor(tab);
  const bar = tab && tab.id === props.coworkTabId ? agentBarFor(props.cowork) : null;
  const host = addressHost(tab?.url);
  return (
    <div className="cowork-browser">
      <div className="cowork-browser__tabs">
        {/* Tabs drag to reorder (motion's Reorder, x axis), close with the x, a
            middle click, or Ctrl/Cmd+W on a focused tab. The page is a native view laid over the
            panel, so a drag stays inside this strip. */}
        <Reorder.Group
          as="div"
          axis="x"
          values={props.tabs.map((entry) => entry.id)}
          onReorder={props.onReorderTabs}
          className="cowork-browser__tablist"
          role="tablist"
          aria-label={t("cowork.browser_tabs")}
        >
          {props.tabs.map((entry) => {
            const title = tabTitle(entry);
            const live = entry.id === props.coworkTabId && props.cowork === "reading";
            const selected = entry.id === tab?.id;
            return (
              <Reorder.Item
                as="div"
                key={entry.id}
                value={entry.id}
                dragElastic={0}
                layout="position"
                className="cowork-browser__tab"
                data-active={selected ? "" : undefined}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  props.onCloseTab(entry.id);
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  // Roving tabindex: only the selected tab is in the Tab order; arrows move between tabs.
                  tabIndex={selected ? 0 : -1}
                  data-tab-id={entry.id}
                  className="cowork-browser__tab-select"
                  title={title}
                  onClick={() => props.onSelectTab(entry.id)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
                      event.preventDefault();
                      props.onCloseTab(entry.id);
                      return;
                    }
                    const target = tabKeyTarget(props.tabs.map((each) => each.id), entry.id, event.key);
                    if (!target) return;
                    event.preventDefault();
                    props.onSelectTab(target);
                    event.currentTarget
                      .closest('[role="tablist"]')
                      ?.querySelector<HTMLButtonElement>(`[data-tab-id="${CSS.escape(target)}"]`)
                      ?.focus();
                  }}
                >
                  {live ? (
                    <span className="cowork-browser__live" role="img" aria-label={t("cowork.browser_live")} />
                  ) : entry.favicon ? (
                    <img src={entry.favicon} alt="" width={14} height={14} className="cowork-browser__favicon" draggable={false} />
                  ) : (
                    icons.globe(TAB_ICON)
                  )}
                  <span className="cowork-browser__tab-title">{title}</span>
                </button>
                <button
                  type="button"
                  className="cowork-browser__tab-close"
                  aria-label={t("cowork.browser_close_tab", { title })}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onCloseTab(entry.id);
                  }}
                >
                  {icons.close(CLOSE_ICON)}
                </button>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
        <IconButton label={t("cowork.browser_new_tab")} size="sm" onClick={props.onNewTab}>
          {icons.plus(BAR_ICON)}
        </IconButton>
      </div>
      <div className="cowork-browser__bar">
        <IconButton label={t("cowork.browser_back")} size="sm" disabled={!tab?.canGoBack} onClick={props.onBack}>
          {icons.arrowLeft(BAR_ICON)}
        </IconButton>
        <IconButton label={t("cowork.browser_forward")} size="sm" disabled={!tab?.canGoForward} onClick={props.onForward}>
          {icons.arrowRight(BAR_ICON)}
        </IconButton>
        <AddressField key={tab?.id ?? "none"} url={tab?.url ?? null} onNavigate={props.onNavigate} />
      </div>
      {bar ? (
        <div className="cowork-browser__agent">
          <TaskStatus state={bar.state} label={bar.label} />
          {bar.action ? (
            <Button size="sm" variant="secondary" onClick={bar.action.kind === "take-over" ? props.onTakeOver : props.onHandBack}>
              {bar.action.label}
            </Button>
          ) : null}
        </div>
      ) : null}
      {page === "web" ? <div ref={props.contentRef} className="cowork-browser__page cowork-browser__page--native" /> : null}
      {page === "new" ? (
        <div className="cowork-browser__page">
          <CoworkNewTab pages={props.pages} onOpen={props.onNavigate} />
        </div>
      ) : null}
      {page === "error" ? (
        <div className="cowork-browser__page">
          <EmptyState
            compact
            icon={icons.globe({ width: 20, height: 20, "aria-hidden": true })}
            title={t("cowork.browser_error_title", { host: host || t("cowork.browser_error_this_site") })}
            description={t("cowork.browser_error_text")}
            action={
              <Button size="sm" variant="secondary" onClick={props.onReload}>
                {t("cowork.browser_try_again")}
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Cowork panel's browser, on the session's tabs, kept in sync with Electron. Cowork's tab
 * comes from the last web step; Take over hands it to the person until they hand it back.
 */
export function CoworkBrowser(props: { sessionKey: string }) {
  const session = useSessionPanelState(props.sessionKey);
  const { createTab, selectTab, closeTab, reorderTabs } = useSidePanelTabs(props.sessionKey);
  const cowork = useFrameStore((state) => state.browser.cowork);
  const pinned = useFrameStore((state) => state.browser.tab);
  const reading = useCoworkPages((state) => state.reading);
  const pages = useCoworkPages((state) => state.pages);
  const [now] = useState(Date.now);
  const contentRef = useRef<HTMLDivElement>(null);

  const tabs = session.tabs.filter((tab): tab is BrowserPanelTab => tab.type === "browser");
  const active = tabs.find((tab) => tab.id === session.activeTabId) ?? tabs[0] ?? null;
  const browser = getElectronBrowser();
  useNativeBrowserBounds(contentRef, Boolean(browser) && pageFor(active) === "web");

  return (
    <CoworkBrowserView
      tabs={tabs}
      activeId={active?.id ?? null}
      coworkTabId={coworkTabId(tabs, { pinned, reading, activeId: active?.id ?? null })}
      cowork={cowork}
      pages={pagesToday(pages, now)}
      contentRef={contentRef}
      onSelectTab={selectTab}
      onCloseTab={(id) => {
        const entry = tabs.find((tab) => tab.id === id);
        if (entry) closeTab(entry);
      }}
      onReorderTabs={(ids) => reorderTabs(mergeTabOrder(session.tabs, ids))}
      onNewTab={() => createTab(NEW_TAB_URL)}
      onBack={() => void browser?.back?.()}
      onForward={() => void browser?.forward?.()}
      onReload={() => void browser?.reload?.()}
      onNavigate={(target) => (active ? void browser?.navigate?.(target) : createTab(target))}
      onTakeOver={() => takeOver(useFrameStore.getState())}
      onHandBack={() => handBack(useFrameStore.getState())}
    />
  );
}
