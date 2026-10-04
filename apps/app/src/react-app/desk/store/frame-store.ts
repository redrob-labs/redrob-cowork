import { create } from "zustand";

import { systemTimers, type DeskTimers, type TimerHandle } from "../timers";

export type PanelTab = "browser" | "files";
export type BrowserDesk = "reading" | "you" | "done";
export type FrameModal = null | { kind: "project"; chatId: string | null } | { kind: "feedback" } | { kind: "keys" };
export type FrameToast = { id: number; title: string; text?: string } | null;

export type FrameState = {
  panel: { open: boolean; tab: PanelTab; file: string | null; lastTab: PanelTab };
  browser: { tab: string | null; desk: BrowserDesk };
  modal: FrameModal;
  toast: FrameToast;
  voice: boolean;
  developerMode: boolean;

  /** Opens on `tab`; without one, on whatever was last there (Files the first time). */
  openPanel(tab?: PanelTab): void;
  closePanel(): void;
  togglePanel(): void;
  /** Ctrl+Shift+B: closes the panel when it shows the browser, otherwise opens it there. */
  toggleBrowser(): void;
  /** Opens a file in the panel; null goes back to the list. */
  openFile(id: string | null): void;
  setBrowserTab(tab: string | null): void;
  setDesk(desk: BrowserDesk): void;
  openModal(modal: Exclude<FrameModal, null>): void;
  closeModal(): void;
  /** Replaces any toast and hides it after TOAST_MS. */
  showToast(title: string, text?: string): void;
  hideToast(): void;
  setVoice(voice: boolean): void;
  setDeveloperMode(on: boolean): void;
};

export const TOAST_MS = 3600;
export const DEVELOPER_MODE_KEY = "redrob.developerMode";

type StorageAccess = () => Pick<Storage, "getItem" | "setItem"> | null;

const windowStorage: StorageAccess = () => (typeof window === "undefined" ? null : window.localStorage);

function readDeveloperMode(storage: StorageAccess): boolean {
  try {
    return storage()?.getItem(DEVELOPER_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDeveloperMode(storage: StorageAccess, on: boolean) {
  try {
    storage()?.setItem(DEVELOPER_MODE_KEY, on ? "1" : "0");
  } catch {
    // Storage can be unavailable (private mode, quota); the in-memory value still applies.
  }
}

/** The frame around every Desk screen: side panel, dialogs, toast. Only developer mode persists. */
export function createFrameStore(options: { timers?: DeskTimers; storage?: StorageAccess } = {}) {
  const { timers = systemTimers, storage = windowStorage } = options;
  let toastTimer: TimerHandle | null = null;
  let toastId = 0;
  const clearToastTimer = () => {
    if (toastTimer !== null) timers.clearTimeout(toastTimer);
    toastTimer = null;
  };

  return create<FrameState>()((set, get) => {
    const openOn = (tab: PanelTab, file: string | null = get().panel.file) =>
      set({ panel: { open: true, tab, file, lastTab: tab } });

    return {
      panel: { open: false, tab: "files", file: null, lastTab: "files" },
      browser: { tab: null, desk: "done" },
      modal: null,
      toast: null,
      voice: false,
      developerMode: readDeveloperMode(storage),

      openPanel: (tab) => openOn(tab ?? get().panel.lastTab),
      closePanel: () => set((state) => ({ panel: { ...state.panel, open: false } })),
      togglePanel: () => (get().panel.open ? get().closePanel() : get().openPanel()),
      toggleBrowser: () => {
        const { panel } = get();
        if (panel.open && panel.tab === "browser") get().closePanel();
        else openOn("browser");
      },
      openFile: (id) => openOn("files", id),
      setBrowserTab: (tab) => set((state) => ({ browser: { ...state.browser, tab } })),
      setDesk: (desk) => set((state) => ({ browser: { ...state.browser, desk } })),
      openModal: (modal) => set({ modal }),
      closeModal: () => set({ modal: null }),
      showToast: (title, text) => {
        clearToastTimer();
        toastId += 1;
        set({ toast: text === undefined ? { id: toastId, title } : { id: toastId, title, text } });
        toastTimer = timers.setTimeout(() => {
          toastTimer = null;
          set({ toast: null });
        }, TOAST_MS);
      },
      hideToast: () => {
        clearToastTimer();
        set({ toast: null });
      },
      setVoice: (voice) => set({ voice }),
      setDeveloperMode: (on) => {
        writeDeveloperMode(storage, on);
        set({ developerMode: on });
      },
    };
  });
}

export const useFrameStore = createFrameStore();
