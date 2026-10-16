/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { IconButton, icons } from "@redrob-labs/ui";
import type { WindowControlAction, WindowState } from "@/app/lib/desktop-types";

import { t } from "@/i18n";
import { useFrameStore } from "../desk/store/frame-store";
import { resolveExtensionIconSrc } from "../design-system/extension-icon-src";
import { openDesktopUrl } from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/lib/runtime-env";
import { openCommandPalette } from "./use-shell-shortcuts";
import {
  canGoBack,
  canGoForward,
  initialHistoryReach,
  reduceHistoryReach,
  type HistoryReachState,
} from "./history-reach";

const WINDOW_STATE_EVENT = "redrob:window:state";
const TOGGLE_SIDEBAR_EVENT = "redrob:native-menu:toggle-sidebar";

type TitleBarPlatform = "windows" | "linux";

/**
 * The window-control IPC this title bar speaks, typed locally so the UI slice
 * stays self-contained. The Electron main process (`apps/desktop` main.mjs)
 * implements `__windowControl` / `__windowState`; `DesktopCommandMap` in
 * `@redrob/types/desktop-ipc` is their shared declaration. We narrow the bridge
 * to just these two commands here rather than reach across to the whole command
 * map - the shapes match that declaration verbatim.
 */
type WindowBridge = {
  invokeDesktop?: {
    (command: "__windowControl", action: WindowControlAction): Promise<boolean>;
    (command: "__windowState"): Promise<WindowState | undefined>;
  };
};

function windowBridge(): WindowBridge | undefined {
  if (typeof window === "undefined") return undefined;
  // The desktop preload installs invokeDesktop; narrow it to the window-control
  // commands this bar uses. On a non-Electron runtime the bridge is absent and
  // every call below short-circuits via optional chaining.
  return window.__REDROB_ELECTRON__ as WindowBridge | undefined;
}

/** The platforms that get this bar: Electron on Windows and Linux. macOS keeps its own traffic lights. */
export function titleBarPlatform(): TitleBarPlatform | null {
  if (typeof window === "undefined") return null;
  const platform = window.__REDROB_ELECTRON__?.meta?.platform;
  return platform === "windows" || platform === "linux" ? platform : null;
}

function control(action: WindowControlAction) {
  void windowBridge()?.invokeDesktop?.("__windowControl", action);
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
    void windowBridge()?.invokeDesktop?.("__windowState").then((next) => {
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

/**
 * Whether Back and Forward have anywhere to go. Back: any entry before this one. Forward: an entry
 * this session has visited past this one, which a new navigation (a PUSH) discards, as browsers do.
 *
 * This app runs on a HASH router, where `history.state.idx` never advances past 0, so we cannot
 * read reachability off it. Instead we fold each navigation (its type + the location key) into an
 * ordered key-stack with a pointer - see `history-reach.ts`, which is pure and unit-tested.
 */
export function useHistoryReach(): { canGoBack: boolean; canGoForward: boolean } {
  const location = useLocation();
  const navigationType = useNavigationType();
  const reachRef = useRef<HistoryReachState>(initialHistoryReach);
  reachRef.current = reduceHistoryReach(reachRef.current, navigationType, location.key);
  return { canGoBack: canGoBack(reachRef.current), canGoForward: canGoForward(reachRef.current) };
}

/**
 * The window's title bar on Windows and Linux, in place of the OS title bar and menu bar.
 *
 * Laid out like Slack's: the sidebar toggle, then Back and Forward at the start, Search in the
 * middle, and the window buttons at the end. No app name, no File/Edit/View menus; the native menu
 * stays installed underneath (app-menu.mjs) only so its shortcuts keep working.
 *
 * 48px (`--control-height-lg`), so it lines up with the Windows caption buttons main.mjs asks for. The bar
 * drags the window; its buttons opt out. On Windows the right end is left empty for the caption buttons
 * Windows draws (they keep Snap Layouts); on Linux the bar draws them itself, round as GNOME's are.
 */
export function WindowTitleBar() {
  const platform = titleBarPlatform();
  if (!platform) return null;
  return <WindowTitleBarView platform={platform} />;
}

const glyph = (draw: (typeof icons)["close"]) => draw({ width: 16, height: 16, "aria-hidden": true });

// Round 12, item 2 / Round 34: the title bar's two square marks are the REAL brand icons from the
// 2026 icon pack. The LEFT mark links to the Redrob console and is now the official Redrob icon
// (the `redrob-icon-web` master, the "R" symbol on the superellipse tile). The RIGHT mark is the
// Redrob COWORK icon and links home. Both are served from the app's public root at /brand/.
const REDROB_GROUP_MARK_SRC = resolveExtensionIconSrc("/brand/redrob-group.svg");
const REDROB_COWORK_MARK_SRC = resolveExtensionIconSrc("/brand/redrob-cowork.svg");

// Round 13, item 2: the Group mark links to the Redrob console; the system browser on desktop, a
// new tab on web (same policy as desk-connectors' openExternal, kept local so the title bar does
// not pull in that screen's module).
const REDROB_CONSOLE_URL = "https://console.redrob.ai";
function openExternalUrl(url: string) {
  if (isDesktopRuntime()) {
    void openDesktopUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

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
      {/*
        Round 10, item 4: the Redrob GROUP mark then the Redrob COWORK mark dock to the RIGHT with
        the search bar, just before the window buttons: [Group] [Cowork] [Search] [buttons]. The nav
        cluster stays far left. (Both marks share one glyph as a placeholder - see the consts above.)
      */}
      <div className="window-titlebar__right titlebar-no-drag">
        {/*
          Round 13, item 2: the two marks are now interactive, with on-hover tooltips (native title +
          aria-label). Group -> the Redrob console in the browser; Cowork -> the app root (home).
        */}
        <button
          type="button"
          className="window-titlebar__brand-btn"
          data-tip={t("titlebar.group_logo")}
          aria-label={t("titlebar.group_logo")}
          onClick={() => openExternalUrl(REDROB_CONSOLE_URL)}
        >
          <img className="window-titlebar__brand-mark" src={REDROB_GROUP_MARK_SRC} alt="" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="window-titlebar__brand-btn"
          data-tip={t("titlebar.cowork_logo")}
          aria-label={t("titlebar.cowork_logo")}
          onClick={() => navigate("/")}
        >
          <img className="window-titlebar__brand-mark" src={REDROB_COWORK_MARK_SRC} alt="" aria-hidden="true" />
        </button>
        <button type="button" className="window-titlebar__search" onClick={search}>
          {glyph(icons.search)}
          <span className="window-titlebar__search-label">{t("titlebar.search_placeholder")}</span>
        </button>
        {platform === "linux" ? (
          <div className="window-titlebar__controls">
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
    </div>
  );
}
