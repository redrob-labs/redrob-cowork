/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { IconButton, icons } from "@redrob-labs/ui";
import type { WindowControlAction, WindowState } from "@redrob/types/desktop-ipc";

import { t } from "@/i18n";
import { useFrameStore } from "../desk/store/frame-store";
import { openCommandPalette } from "./use-shell-shortcuts";

const WINDOW_STATE_EVENT = "redrob:window:state";
const TOGGLE_SIDEBAR_EVENT = "redrob:native-menu:toggle-sidebar";

type TitleBarPlatform = "windows" | "linux";

/** The platforms that get this bar: Electron on Windows and Linux. macOS keeps its own traffic lights. */
export function titleBarPlatform(): TitleBarPlatform | null {
  if (typeof window === "undefined") return null;
  const platform = window.__REDROB_ELECTRON__?.meta?.platform;
  return platform === "windows" || platform === "linux" ? platform : null;
}

function control(action: WindowControlAction) {
  void window.__REDROB_ELECTRON__?.invokeDesktop?.("__windowControl", action);
}

function isWindowState(value: unknown): value is WindowState {
  return (
    typeof value === "object" &&
    value !== null &&
    "maximized" in value &&
    typeof value.maximized === "boolean" &&
    "fullScreen" in value &&
    typeof value.fullScreen === "boolean"
  );
}

function useWindowState(): WindowState {
  const [state, setState] = useState<WindowState>({ maximized: false, fullScreen: false });
  useEffect(() => {
    let live = true;
    void window.__REDROB_ELECTRON__?.invokeDesktop?.("__windowState").then((next) => {
      if (live && next) setState(next);
    });
    const onState = (event: Event) => {
      if (event instanceof CustomEvent && isWindowState(event.detail)) setState(event.detail);
    };
    window.addEventListener(WINDOW_STATE_EVENT, onState);
    return () => {
      live = false;
      window.removeEventListener(WINDOW_STATE_EVENT, onState);
    };
  }, []);
  return state;
}

/** Where the router's history stands. React Router keeps the entry's index in `history.state.idx`. */
function historyIndex(): number {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && "idx" in state && typeof state.idx === "number" ? state.idx : 0;
}

/**
 * Whether Back and Forward have anywhere to go. Back: any entry before this one. Forward: an entry
 * this session has visited past this one, which a new navigation (a PUSH) discards, as browsers do.
 */
export function useHistoryReach(): { canGoBack: boolean; canGoForward: boolean } {
  // Re-read on every navigation; the index itself lives in history.state.
  useLocation();
  const navigationType = useNavigationType();
  const furthest = useRef(0);
  const index = historyIndex();
  if (navigationType === "PUSH" || index > furthest.current) furthest.current = index;
  return { canGoBack: index > 0, canGoForward: index < furthest.current };
}

/**
 * The window's title bar on Windows and Linux, in place of the OS title bar and menu bar.
 *
 * Laid out like Slack's: the sidebar toggle, Back and Forward at the start, Search in the middle, and the
 * window buttons at the end. No app name, no File/Edit/View menus; the native menu stays installed
 * underneath (app-menu.mjs) only so its shortcuts keep working.
 *
 * 40px (`--control-height-md`), so it lines up with the Windows caption buttons main.mjs asks for. The bar
 * drags the window; its buttons opt out. On Windows the right end is left empty for the caption buttons
 * Windows draws (they keep Snap Layouts); on Linux the bar draws them itself, round as GNOME's are.
 */
export function WindowTitleBar() {
  const platform = titleBarPlatform();
  if (!platform) return null;
  return <WindowTitleBarView platform={platform} />;
}

const glyph = (draw: (typeof icons)["close"]) => draw({ width: 16, height: 16, "aria-hidden": true });

function WindowTitleBarView({ platform }: { platform: TitleBarPlatform }) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryReach();
  const state = useWindowState();
  const openModal = useFrameStore((store) => store.openModal);
  const search = () => {
    if (!openCommandPalette()) openModal({ kind: "search" });
  };

  return (
    // A double click on the bar maximises: the OS does that for a drag region, so there is no handler.
    <div className="window-titlebar titlebar-drag">
      <div className="window-titlebar__nav titlebar-no-drag">
        <IconButton
          label={t("titlebar.toggle_sidebar")}
          size="sm"
          onClick={() => window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT))}
        >
          {glyph(icons.sidebar)}
        </IconButton>
        <IconButton label={t("titlebar.back")} size="sm" className="window-titlebar__navbtn" disabled={!canGoBack} onClick={() => navigate(-1)}>
          {glyph(icons.back)}
        </IconButton>
        <IconButton label={t("titlebar.forward")} size="sm" className="window-titlebar__navbtn" disabled={!canGoForward} onClick={() => navigate(1)}>
          {glyph(icons.forward)}
        </IconButton>
      </div>
      <button type="button" className="window-titlebar__search titlebar-no-drag" onClick={search}>
        {glyph(icons.search)}
        <span className="window-titlebar__search-label">{t("titlebar.search_placeholder")}</span>
        <kbd className="window-titlebar__kbd">Ctrl K</kbd>
      </button>
      {platform === "linux" ? (
        <div className="window-titlebar__controls titlebar-no-drag">
          <IconButton label={t("titlebar.minimize")} size="sm" round className="window-titlebar__winbtn" onClick={() => control("minimize")}>
            {icons.minus({ width: 14, height: 14, "aria-hidden": true })}
          </IconButton>
          <IconButton
            label={state.maximized ? t("titlebar.restore") : t("titlebar.maximize")}
            size="sm"
            round
            className="window-titlebar__winbtn"
            onClick={() => control("toggleMaximize")}
          >
            {(state.maximized ? icons.copy : icons.maximize)({ width: 14, height: 14, "aria-hidden": true })}
          </IconButton>
          <IconButton
            label={t("titlebar.close_window")}
            size="sm"
            round
            className="window-titlebar__winbtn window-titlebar__close"
            onClick={() => control("close")}
          >
            {icons.close({ width: 14, height: 14, "aria-hidden": true })}
          </IconButton>
        </div>
      ) : (
        <div className="window-titlebar__caption-space" aria-hidden="true" />
      )}
    </div>
  );
}
