/**
 * Desk frame store (Zustand).
 *
 * Holds the UI state that wraps every Desk screen but belongs to none of them: the right-hand side
 * panel, the in-app browser tab state, the active modal, the transient toast, voice-mode state, the
 * published chat header, and the developer-mode flag. Screens read and drive this store; the shell
 * chrome (top bar, panel, overlay) renders from it. Only developer mode is persisted — everything
 * else is session-lived by design.
 *
 * The store is created by {@link createFrameStore} so tests can inject fake timers and storage; the
 * app uses the shared {@link useFrameStore} singleton.
 */
import { create } from "zustand";

import { systemTimers, type DeskTimers, type TimerHandle } from "../timers";

/** Which tab the side panel shows: the in-app browser, or the workspace file list. */
export type PanelTab = "browser" | "files";
/** The in-app browser's hand-off state: Desk is reading, the person has taken over, or finished. */
export type BrowserDesk = "reading" | "you" | "done";
export type FrameModal =
  | null
  | { kind: "project"; chatId: string | null }
  | { kind: "feedback" }
  | { kind: "keys" }
  /** A skill to write: a new one, maybe from a message, or one of the person's own to change. */
  | { kind: "skill"; name?: string; instructions?: string }
  /** Search places and chats (title bar search box, Ctrl+K on Desk screens). */
  | { kind: "search" };
export type ToastTone = "success" | "danger";
/** The one thing a toast offers, usually Undo. */
export type ToastAction = { label: string; run: () => void };
export type FrameToast = { id: number; title: string; text?: string; tone?: ToastTone; action?: ToastAction } | null;

/**
 * The open chat's header content, published by the session page so the Desk shell's top bar can
 * render it on ONE row with the chat actions (Invite, side panel). Null while no chat is open or
 * the session page is not inside the Desk frame — then the shell top bar shows nothing for it.
 */
export type ChatHeader = { title: string; findSessionId: string | null } | null;

export type FrameState = {
  /** The side panel: whether it is open, which tab, the file it shows (Files tab), and the tab to reopen on. */
  panel: { open: boolean; tab: PanelTab; file: string | null; lastTab: PanelTab };
  /** The in-app browser: the active provider tab id and the Desk/you hand-off state. */
  browser: { tab: string | null; desk: BrowserDesk };
  /** The modal currently open over the frame, or null. */
  modal: FrameModal;
  /** The transient toast currently shown, or null. Auto-hides after {@link TOAST_MS}. */
  toast: FrameToast;
  /** True while voice mode is actively listening (mirrors `voiceMic === "recording"`). */
  voice: boolean;
  /** The dictation mic phase, published by the composer so the voice overlay can show listening/thinking. */
  voiceMic: "idle" | "recording" | "transcribing";
  /**
   * Round 14, item F: the composer owns the mic recorder (startRecording/transcribe), so it registers
   * a toggle here that the voice overlay's ORB can call to start/stop talking. null when no composer
   * is mounted. A click toggles: idle -> recording, recording -> stop+transcribe.
   */
  voiceMicToggle: (() => void) | null;
  /** Developer mode: reveals the full model list, debug panels and advanced settings. Persisted. */
  developerMode: boolean;
  /** The open chat's header, published by the session page; see {@link ChatHeader}. */
  chatHeader: ChatHeader;

  /** Opens on `tab`; without one, on whatever was last there (Files the first time). */
  openPanel(tab?: PanelTab): void;
  /** Closes the side panel, remembering its tab so {@link openPanel} can reopen there. */
  closePanel(): void;
  /** Toggles the side panel open/closed, reopening on its last tab. */
  togglePanel(): void;
  /** Ctrl+Shift+B: closes the panel when it shows the browser, otherwise opens it there. */
  toggleBrowser(): void;
  /** Opens a file in the panel; null goes back to the list. */
  openFile(id: string | null): void;
  /** Selects the active in-app browser tab (null = none). */
  setBrowserTab(tab: string | null): void;
  /** Sets the in-app browser hand-off state (Desk reading / person / done). */
  setDesk(desk: BrowserDesk): void;
  /** Opens a modal over the frame, replacing any current one. */
  openModal(modal: Exclude<FrameModal, null>): void;
  /** Closes the active modal. */
  closeModal(): void;
  /** Replaces any toast and hides it after TOAST_MS. A confirmation unless `tone` says otherwise. */
  showToast(title: string, text?: string, tone?: ToastTone, action?: ToastAction): void;
  /** Hides the current toast immediately and cancels its auto-hide timer. */
  hideToast(): void;
  /** Publishes the dictation mic phase; also flips {@link FrameState.voice} when recording. */
  setVoice(mic: "idle" | "recording" | "transcribing"): void;
  /** The composer registers (or clears with null) its mic start/stop toggle for the overlay orb. */
  setVoiceMicToggle(toggle: (() => void) | null): void;
  setDeveloperMode(on: boolean): void;
  /** Publish (or clear with null) the open chat's header for the Desk top bar to render. */
  setChatHeader(header: ChatHeader): void;
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
      voiceMic: "idle",
      voiceMicToggle: null,
      developerMode: readDeveloperMode(storage),
      chatHeader: null,

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
      showToast: (title, text, tone, action) => {
        clearToastTimer();
        toastId += 1;
        set({
          toast: {
            id: toastId,
            title,
            ...(text === undefined ? {} : { text }),
            ...(tone === undefined ? {} : { tone }),
            ...(action === undefined ? {} : { action }),
          },
        });
        toastTimer = timers.setTimeout(() => {
          toastTimer = null;
          set({ toast: null });
        }, TOAST_MS);
      },
      hideToast: () => {
        clearToastTimer();
        set({ toast: null });
      },
      setVoice: (mic) => set({ voiceMic: mic, voice: mic === "recording" }),
      setVoiceMicToggle: (toggle) => set({ voiceMicToggle: toggle }),
      setDeveloperMode: (on) => {
        writeDeveloperMode(storage, on);
        set({ developerMode: on });
      },
      setChatHeader: (header) => set({ chatHeader: header }),
    };
  });
}

export const useFrameStore = createFrameStore();
