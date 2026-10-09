/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { IconButton, icons } from "@redrob-labs/ui";
import type { WindowControlAction, WindowState } from "@redrob/types/desktop-ipc";

import { t } from "@/i18n";
import { resolveExtensionIconSrc } from "@/react-app/design-system/extension-icon-src";
import { useShellConfig } from "./shell-config";

const WINDOW_STATE_EVENT = "redrob:window:state";
const ICON_SRC = resolveExtensionIconSrc("/redrob-cowork-icon.svg");

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

/**
 * The window's title bar on Windows and Linux, in place of the OS title bar and menu bar: the product
 * icon, the app name and the window buttons. There are no File/Edit/View menus; the native menu stays
 * installed underneath (app-menu.mjs) only so its shortcuts keep working.
 *
 * 40px (`--control-height-md`), so it lines up with the Windows caption buttons main.mjs asks for. The bar
 * drags the window; the buttons in it opt out. On Windows the right end is left empty for the
 * caption buttons Windows draws (they keep Snap Layouts); on Linux the bar draws them itself.
 */
export function WindowTitleBar() {
  const platform = titleBarPlatform();
  if (!platform) return null;
  return <WindowTitleBarView platform={platform} />;
}

function WindowTitleBarView({ platform }: { platform: TitleBarPlatform }) {
  const { config } = useShellConfig();
  const state = useWindowState();
  return (
    // A double click on the bar maximises: the OS does that for a drag region, so there is no handler.
    <div className="window-titlebar titlebar-drag">
      <img src={ICON_SRC} alt="" width={16} height={16} className="window-titlebar__icon" aria-hidden="true" />
      <span className="window-titlebar__name">{config.appName}</span>
      {platform === "linux" ? (
        <div className="window-titlebar__controls titlebar-no-drag">
          <IconButton label={t("titlebar.minimize")} size="sm" onClick={() => control("minimize")}>
            {icons.minus({ width: 16, height: 16, "aria-hidden": true })}
          </IconButton>
          <IconButton
            label={state.maximized ? t("titlebar.restore") : t("titlebar.maximize")}
            size="sm"
            onClick={() => control("toggleMaximize")}
          >
            {(state.maximized ? icons.copy : icons.maximize)({ width: 16, height: 16, "aria-hidden": true })}
          </IconButton>
          <IconButton
            label={t("titlebar.close_window")}
            size="sm"
            className="window-titlebar__close"
            onClick={() => control("close")}
          >
            {icons.close({ width: 16, height: 16, "aria-hidden": true })}
          </IconButton>
        </div>
      ) : (
        <div className="window-titlebar__caption-space" aria-hidden="true" />
      )}
    </div>
  );
}
