import { create } from "zustand";

import { addressHost } from "../panel/desk-browser-state";

/** A page Desk read, for the chat it was read for. In memory only, never persisted. */
export type DeskPage = { url: string; host: string; chatId: string; chatTitle: string | null; at: number };

export const MAX_DESK_PAGES = 20;

/** The page first; the same address read again for the same chat moves up rather than repeating. */
export function addDeskPage(pages: readonly DeskPage[], page: DeskPage): DeskPage[] {
  const rest = pages.filter((entry) => entry.url !== page.url || entry.chatId !== page.chatId);
  return [page, ...rest].slice(0, MAX_DESK_PAGES);
}

/** The pages read on the same calendar day as `now`, on this computer's clock. */
export function pagesToday(pages: readonly DeskPage[], now: number): DeskPage[] {
  const today = new Date(now).toDateString();
  return pages.filter((page) => new Date(page.at).toDateString() === today);
}

/** A page for `url`, or null when it is not a web address. */
export function deskPage(input: { url: string; chatId: string; chatTitle?: string; at: number }): DeskPage | null {
  const host = addressHost(input.url);
  return host ? { url: input.url, host, chatId: input.chatId, chatTitle: input.chatTitle ?? null, at: input.at } : null;
}

export type DeskReading = { runId: string; url: string | null };

export type DeskPagesState = {
  pages: DeskPage[];
  /** The run that last used the browser, and the address it opened if it named one. */
  reading: DeskReading | null;
  record(page: DeskPage): void;
  setReading(reading: DeskReading): void;
};

export function createDeskPagesStore() {
  return create<DeskPagesState>()((set) => ({
    pages: [],
    reading: null,
    record: (page) => set((state) => ({ pages: addDeskPage(state.pages, page) })),
    setReading: (reading) => set({ reading }),
  }));
}

export const useDeskPages = createDeskPagesStore();
