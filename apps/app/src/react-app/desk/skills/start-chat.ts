import { create } from "zustand";

import type { ChatMode } from "../services/types";

/** A chat a Desk screen asked for, started by the chat route, which is where chats are made. */
export type PendingDeskChat = { workspaceId: string; prompt: string; mode: ChatMode };

type DeskStartState = {
  pending: PendingDeskChat | null;
  request(chat: PendingDeskChat): void;
  clear(): void;
};

export const useDeskStartStore = create<DeskStartState>()((set) => ({
  pending: null,
  request: (chat) => set({ pending: chat }),
  clear: () => set({ pending: null }),
}));
