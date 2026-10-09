/** @jsxImportSource react */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { IconButton, Menu, icons, type MenuItem } from "@redrob-labs/ui";
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

/** The native menu's own actions reach the renderer as window events; the title bar raises the same ones. */
function raise(name: string, detail?: string) {
  window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail }));
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

type MenuSpec = { id: string; label: string; items: MenuItem[] };

/**
 * The File, Edit, View, Window and Help menus the native menu bar used to show, with the same actions and
 * shortcuts (app-menu.mjs). The native menu stays installed underneath, so the shortcuts keep working; these
 * show them and make every action reachable with the mouse.
 */
export function titleBarMenus(platform: TitleBarPlatform, state: WindowState, edit: (action: WindowControlAction) => void): MenuSpec[] {
  const item = (id: string, label: string, onSelect: () => void, shortcut?: string): MenuItem => ({
    id,
    label,
    shortcut,
    onSelect,
  });
  const separator: MenuItem = { type: "separator" };
  return [
    {
      id: "file",
      label: t("titlebar.file"),
      items: [
        item("settings", t("titlebar.settings"), () => raise("redrob:native-menu:open-settings"), "Ctrl+,"),
        separator,
        item("close", t("titlebar.close_window"), () => control("close"), "Ctrl+W"),
      ],
    },
    {
      id: "edit",
      label: t("titlebar.edit"),
      items: [
        item("undo", t("titlebar.undo"), () => edit("undo"), "Ctrl+Z"),
        item("redo", t("titlebar.redo"), () => edit("redo"), platform === "windows" ? "Ctrl+Y" : "Ctrl+Shift+Z"),
        separator,
        item("cut", t("titlebar.cut"), () => edit("cut"), "Ctrl+X"),
        item("copy", t("titlebar.copy"), () => edit("copy"), "Ctrl+C"),
        item("paste", t("titlebar.paste"), () => edit("paste"), "Ctrl+V"),
        item("delete", t("titlebar.delete"), () => edit("delete")),
        separator,
        item("select-all", t("titlebar.select_all"), () => edit("selectAll"), "Ctrl+A"),
      ],
    },
    {
      id: "view",
      label: t("titlebar.view"),
      items: [
        item("sidebar", t("titlebar.toggle_sidebar"), () => raise("redrob:native-menu:toggle-sidebar"), "Ctrl+B"),
        separator,
        item("zoom-reset", t("titlebar.actual_size"), () => raise("redrob:native-menu:zoom", "reset"), "Ctrl+0"),
        item("zoom-in", t("titlebar.zoom_in"), () => raise("redrob:native-menu:zoom", "in"), "Ctrl++"),
        item("zoom-out", t("titlebar.zoom_out"), () => raise("redrob:native-menu:zoom", "out"), "Ctrl+-"),
        item("fullscreen", t("titlebar.full_screen"), () => control("toggleFullScreen"), "F11"),
        separator,
        item("reload", t("titlebar.reload"), () => control("reload"), "Ctrl+R"),
        item("force-reload", t("titlebar.force_reload"), () => control("forceReload"), "Ctrl+Shift+R"),
        item("devtools", t("titlebar.developer_tools"), () => control("toggleDevTools"), "Ctrl+Shift+I"),
      ],
    },
    {
      id: "window",
      label: t("titlebar.window"),
      items: [
        item("minimize", t("titlebar.minimize"), () => control("minimize")),
        item("maximize", state.maximized ? t("titlebar.restore") : t("titlebar.maximize"), () => control("toggleMaximize")),
        separator,
        item("close-window", t("titlebar.close_window"), () => control("close")),
      ],
    },
    {
      id: "help",
      label: t("titlebar.help"),
      items: [
        item("updates", t("titlebar.check_updates"), () => raise("redrob:native-menu:check-updates")),
        separator,
        item("docs", t("titlebar.docs"), () => control("openDocs")),
      ],
    },
  ];
}

/**
 * The window's title bar on Windows and Linux, in place of the OS title bar and menu bar.
 *
 * 40px (`--control-height-md`), so it lines up with the Windows caption buttons main.mjs asks for. The bar
 * drags the window; the menus and buttons in it opt out. On Windows the right end is left empty for the
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
  // Opening a menu moves focus into it. Edit actions must act on what had focus before, so it is noted when
  // a menu is pressed and handed back before the action runs.
  const focusBeforeMenu = useRef<HTMLElement | null>(null);
  const noteFocus = (event: PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !event.currentTarget.contains(active)) focusBeforeMenu.current = active;
  };
  const edit = (action: WindowControlAction) => {
    focusBeforeMenu.current?.focus();
    control(action);
  };
  const menus = titleBarMenus(platform, state, edit);

  return (
    // A double click on the bar maximises: the OS does that for a drag region, so there is no handler.
    <div className="window-titlebar titlebar-drag">
      <img src={ICON_SRC} alt="" width={16} height={16} className="window-titlebar__icon" aria-hidden="true" />
      <span className="window-titlebar__name">{config.appName}</span>
      <nav
        className="window-titlebar__menus titlebar-no-drag"
        aria-label={t("titlebar.menu_bar")}
        onPointerDownCapture={noteFocus}
        onKeyDownCapture={noteFocus}
      >
        {menus.map((menu) => (
          <Menu key={menu.id} label={menu.label} items={menu.items} variant="ghost" size="sm" />
        ))}
      </nav>
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
