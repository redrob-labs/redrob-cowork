import { create } from "zustand";

import type { ChatMode } from "../services/types";

/** A chat a Cowork screen asked for, started by the chat route, which is where chats are made. */
export type PendingCoworkChat = { workspaceId: string; prompt: string; mode: ChatMode };

type CoworkStartState = {
  pending: PendingCoworkChat | null;
  request(chat: PendingCoworkChat): void;
  clear(): void;
};

export const useCoworkStartStore = create<CoworkStartState>()((set) => ({
  pending: null,
  request: (chat) => set({ pending: chat }),
  clear: () => set({ pending: null }),
}));
