/** @jsxImportSource react */
import { useRef, useState, type FormEvent, type Ref } from "react";
import { Button, EmptyState, IconButton, SectionMark, TaskStatus, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { useSessionPanelState, type BrowserPanelTab } from "../../domains/session/panel/panel-tab-store";
import { useNativeBrowserBounds } from "../../domains/session/panel/use-native-browser-bounds";
import { useSidePanelTabs } from "../../domains/session/panel/use-side-panel-tabs";
import { getElectronBrowser } from "../../domains/session/panel/utils";
import { pagesToday, useDeskPages, type DeskPage } from "../run/desk-pages";
import { useFrameStore, type BrowserDesk } from "../store/frame-store";
import {
  addressHost,
  addressTarget,
  agentBarFor,
  deskTabId,
  handBack,
  pageFor,
  takeOver,
} from "./desk-browser-state";

const TAB_ICON = { width: 13, height: 13, "aria-hidden": true };
const BAR_ICON = { width: 15, height: 15, "aria-hidden": true };

/** A new tab opens on the Desk's own page, not on a search engine. */
export const NEW_TAB_URL = "about:blank";

/** A tab's name: its page title, the host when the page has none, "New tab" for a blank one. */
export function tabTitle(tab: Pick<BrowserPanelTab, "label" | "url" | "status">): string {
  const page = pageFor(tab);
  if (page === "new") return t("desk.browser_new_tab_title");
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
    <form className="desk-browser__address" onSubmit={submit} role="search">
      <label>
        {glyph}
        <input
          ref={inputRef}
          type="text"
          value={draft ?? host}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => setDraft(null)}
          placeholder={t("desk.browser_address_placeholder")}
          aria-label={t("desk.browser_address")}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
    </form>
  );
}

export type DeskNewTabProps = { pages: readonly DeskPage[]; onOpen: (url: string) => void };

/** The new tab: what signing in here means, and the pages Desk read today with their chats. */
export function DeskNewTab(props: DeskNewTabProps) {
  return (
    <div className="desk-browser__new">
      <p className="desk-browser__lede">{t("desk.browser_new_tab_lede")}</p>
      <section className="desk-browser__read">
        <SectionMark as="heading" level={3} label={t("desk.browser_read_today")} />
        {props.pages.length > 0 ? (
          <ul className="desk-browser__pages">
            {props.pages.map((page) => (
              <li key={`${page.chatId}:${page.url}`}>
                <button type="button" onClick={() => props.onOpen(page.url)}>
                  <b>{page.host}</b>
                  <span>{t("desk.browser_read_for", { chat: page.chatTitle ?? t("desk.untitled_chat") })}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="desk-browser__none">{t("desk.browser_read_none")}</p>
        )}
      </section>
    </div>
  );
}

export type DeskBrowserViewProps = {
  tabs: readonly BrowserPanelTab[];
  /** The tab on screen; the first tab when it is not one of `tabs`. */
  activeId: string | null;
  /** The tab Desk is on, when a web step has touched the browser. */
  deskTabId: string | null;
  desk: BrowserDesk;
  pages: readonly DeskPage[];
  /** Where Electron lays the page; only rendered while a page is showing. */
  contentRef?: Ref<HTMLDivElement>;
  onSelectTab: (id: string) => void;
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
 * the bar saying whether Desk or the person has the tab, and the page. The page itself is
 * Electron's, laid over `contentRef`; a blank tab is the new tab page, and a page that
 * did not load names its site.
 */
export function DeskBrowserView(props: DeskBrowserViewProps) {
  const tab = props.tabs.find((entry) => entry.id === props.activeId) ?? props.tabs[0] ?? null;
  const page = pageFor(tab);
  const bar = tab && tab.id === props.deskTabId ? agentBarFor(props.desk) : null;
  const host = addressHost(tab?.url);
  return (
    <div className="desk-browser">
      <div className="desk-browser__tabs" role="tablist" aria-label={t("desk.browser_tabs")}>
        {props.tabs.map((entry) => {
          const title = tabTitle(entry);
          const live = entry.id === props.deskTabId && props.desk === "reading";
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tab?.id}
              className="desk-browser__tab"
              title={title}
              onClick={() => props.onSelectTab(entry.id)}
            >
              {live ? (
                <span className="desk-browser__live" role="img" aria-label={t("desk.browser_live")} />
              ) : entry.favicon ? (
                <img src={entry.favicon} alt="" width={13} height={13} className="desk-browser__favicon" />
              ) : (
                icons.globe(TAB_ICON)
              )}
              <span className="desk-browser__tab-title">{title}</span>
            </button>
          );
        })}
        <IconButton label={t("desk.browser_new_tab")} size="sm" onClick={props.onNewTab}>
          {icons.plus(BAR_ICON)}
        </IconButton>
      </div>
      <div className="desk-browser__bar">
        <IconButton label={t("desk.browser_back")} size="sm" disabled={!tab?.canGoBack} onClick={props.onBack}>
          {icons.arrowLeft(BAR_ICON)}
        </IconButton>
        <IconButton label={t("desk.browser_forward")} size="sm" disabled={!tab?.canGoForward} onClick={props.onForward}>
          {icons.arrowRight(BAR_ICON)}
        </IconButton>
        <AddressField key={tab?.id ?? "none"} url={tab?.url ?? null} onNavigate={props.onNavigate} />
      </div>
      {bar ? (
        <div className="desk-browser__agent">
          <TaskStatus state={bar.state} label={bar.label} />
          {bar.action ? (
            <Button size="sm" variant="secondary" onClick={bar.action.kind === "take-over" ? props.onTakeOver : props.onHandBack}>
              {bar.action.label}
            </Button>
          ) : null}
        </div>
      ) : null}
      {page === "web" ? <div ref={props.contentRef} className="desk-browser__page desk-browser__page--native" /> : null}
      {page === "new" ? (
        <div className="desk-browser__page">
          <DeskNewTab pages={props.pages} onOpen={props.onNavigate} />
        </div>
      ) : null}
      {page === "error" ? (
        <div className="desk-browser__page">
          <EmptyState
            compact
            icon={icons.globe({ width: 20, height: 20, "aria-hidden": true })}
            title={t("desk.browser_error_title", { host: host || t("desk.browser_error_this_site") })}
            description={t("desk.browser_error_text")}
            action={
              <Button size="sm" variant="secondary" onClick={props.onReload}>
                {t("desk.browser_try_again")}
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Desk panel's browser, on the session's tabs, kept in sync with Electron. Desk's tab
 * comes from the last web step; Take over hands it to the person until they hand it back.
 */
export function DeskBrowser(props: { sessionKey: string }) {
  const session = useSessionPanelState(props.sessionKey);
  const { createTab, selectTab } = useSidePanelTabs(props.sessionKey);
  const desk = useFrameStore((state) => state.browser.desk);
  const pinned = useFrameStore((state) => state.browser.tab);
  const reading = useDeskPages((state) => state.reading);
  const pages = useDeskPages((state) => state.pages);
  const [now] = useState(Date.now);
  const contentRef = useRef<HTMLDivElement>(null);

  const tabs = session.tabs.filter((tab): tab is BrowserPanelTab => tab.type === "browser");
  const active = tabs.find((tab) => tab.id === session.activeTabId) ?? tabs[0] ?? null;
  const browser = getElectronBrowser();
  useNativeBrowserBounds(contentRef, Boolean(browser) && pageFor(active) === "web");

  return (
    <DeskBrowserView
      tabs={tabs}
      activeId={active?.id ?? null}
      deskTabId={deskTabId(tabs, { pinned, reading, activeId: active?.id ?? null })}
      desk={desk}
      pages={pagesToday(pages, now)}
      contentRef={contentRef}
      onSelectTab={selectTab}
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
