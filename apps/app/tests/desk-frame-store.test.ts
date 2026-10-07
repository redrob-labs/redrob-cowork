import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

import { createFrameStore, DEVELOPER_MODE_KEY, TOAST_MS } from "../src/react-app/desk/store/frame-store";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("desk frame store: toast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("hides the toast after 3600ms", () => {
    const store = createFrameStore({ storage: () => null });
    store.getState().showToast("Project created", "Hansol is ready.");
    expect(store.getState().toast).toMatchObject({ title: "Project created", text: "Hansol is ready." });

    jest.advanceTimersByTime(TOAST_MS - 1);
    expect(store.getState().toast).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(store.getState().toast).toBeNull();
  });

  test("a new toast replaces the old one and restarts the timer", () => {
    const store = createFrameStore({ storage: () => null });
    store.getState().showToast("First");
    const firstId = store.getState().toast?.id;
    jest.advanceTimersByTime(3000);

    store.getState().showToast("Second");
    expect(store.getState().toast?.title).toBe("Second");
    expect(store.getState().toast?.id).not.toBe(firstId);

    jest.advanceTimersByTime(TOAST_MS - 1);
    expect(store.getState().toast?.title).toBe("Second");
    jest.advanceTimersByTime(1);
    expect(store.getState().toast).toBeNull();
  });

  test("hideToast clears the pending timer", () => {
    const store = createFrameStore({ storage: () => null });
    store.getState().showToast("First");
    store.getState().hideToast();
    store.getState().showToast("Second");
    jest.advanceTimersByTime(TOAST_MS - 1);
    expect(store.getState().toast?.title).toBe("Second");
  });
});

describe("desk frame store: panel", () => {
  test("first open shows Files, reopen returns to the last tab", () => {
    const store = createFrameStore({ storage: () => null });
    store.getState().openPanel();
    expect(store.getState().panel).toMatchObject({ open: true, tab: "files", lastTab: "files" });

    store.getState().openPanel("browser");
    store.getState().closePanel();
    expect(store.getState().panel.open).toBe(false);

    store.getState().openPanel();
    expect(store.getState().panel).toMatchObject({ open: true, tab: "browser", lastTab: "browser" });

    store.getState().togglePanel();
    expect(store.getState().panel.open).toBe(false);
    store.getState().togglePanel();
    expect(store.getState().panel).toMatchObject({ open: true, tab: "browser" });
  });

  test("toggleBrowser closes when on the browser, otherwise opens it", () => {
    const store = createFrameStore({ storage: () => null });
    store.getState().toggleBrowser();
    expect(store.getState().panel).toMatchObject({ open: true, tab: "browser" });
    store.getState().toggleBrowser();
    expect(store.getState().panel.open).toBe(false);

    store.getState().openPanel("files");
    store.getState().toggleBrowser();
    expect(store.getState().panel).toMatchObject({ open: true, tab: "browser" });
  });

  test("openFile opens Files on that file and becomes the last tab", () => {
    const store = createFrameStore({ storage: () => null });
    store.getState().openPanel("browser");
    store.getState().openFile("f-notice");
    expect(store.getState().panel).toEqual({ open: true, tab: "files", file: "f-notice", lastTab: "files" });
  });

  test("desk state, modal and voice", () => {
    const store = createFrameStore({ storage: () => null });
    expect(store.getState().browser.desk).toBe("done");
    store.getState().setDesk("reading");
    expect(store.getState().browser.desk).toBe("reading");
    store.getState().openModal({ kind: "project", chatId: "notice" });
    expect(store.getState().modal).toEqual({ kind: "project", chatId: "notice" });
    store.getState().closeModal();
    expect(store.getState().modal).toBeNull();
    store.getState().setVoice(true);
    expect(store.getState().voice).toBe(true);
  });
});

describe("desk frame store: developer mode", () => {
  test("reads redrob.developerMode on init", () => {
    expect(createFrameStore({ storage: () => memoryStorage({ [DEVELOPER_MODE_KEY]: "1" }) }).getState().developerMode).toBe(true);
    expect(createFrameStore({ storage: () => memoryStorage({ [DEVELOPER_MODE_KEY]: "0" }) }).getState().developerMode).toBe(false);
    expect(createFrameStore({ storage: () => memoryStorage() }).getState().developerMode).toBe(false);
  });

  test("writes 1/0 on change and both subscribers see the same value", () => {
    const storage = memoryStorage();
    const store = createFrameStore({ storage: () => storage });
    const seenBySession: boolean[] = [];
    const seenBySettings: boolean[] = [];
    store.subscribe((state) => seenBySession.push(state.developerMode));
    store.subscribe((state) => seenBySettings.push(state.developerMode));

    store.getState().setDeveloperMode(true);
    expect(storage.map.get(DEVELOPER_MODE_KEY)).toBe("1");
    store.getState().setDeveloperMode(false);
    expect(storage.map.get(DEVELOPER_MODE_KEY)).toBe("0");

    expect(seenBySession).toEqual([true, false]);
    expect(seenBySettings).toEqual([true, false]);
  });

  test("survives missing or throwing storage", () => {
    const missing = createFrameStore({ storage: () => null });
    missing.getState().setDeveloperMode(true);
    expect(missing.getState().developerMode).toBe(true);

    const throwing = createFrameStore({
      storage: () => {
        throw new Error("SecurityError");
      },
    });
    expect(throwing.getState().developerMode).toBe(false);
    throwing.getState().setDeveloperMode(true);
    expect(throwing.getState().developerMode).toBe(true);
  });

  test("the default store works without a window", async () => {
    expect(typeof window).toBe("undefined");
    const { useFrameStore } = await import("../src/react-app/desk/store/frame-store");
    expect(useFrameStore.getState().developerMode).toBe(false);
  });
});
