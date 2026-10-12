import { create, type StateCreator } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { CrossCheckLevel } from "@redrob-labs/ui";

import type { ChatMemory, ChatMode } from "../services/types";

/** The agents behind Plan and Run (apps/server/src/redrob-desk-agents.ts). */
export const DESK_PLAN_AGENT = "redrob-plan";
export const DESK_RUN_AGENT = "redrob-run";

/** What new chats start in until Settings says otherwise. */
export const DEFAULT_NEW_CHAT_MODE: ChatMode = "run";

/** The two checks Cross-check is made of, each Off, When it matters or Always. */
export type DeskCrossCheck = { factCheck: CrossCheckLevel; challenge: CrossCheckLevel };
export const DEFAULT_CROSS_CHECK: DeskCrossCheck = { factCheck: "auto", challenge: "auto" };

/** The key the new chat screen's composer keeps its choices under until a session exists. */
export const NEW_CHAT_KEY = "new";

export function agentForMode(mode: ChatMode): string {
  return mode === "plan" ? DESK_PLAN_AGENT : DESK_RUN_AGENT;
}

/**
 * The agent a prompt is sent with. Inside the Desk frame Plan or Run decides; outside it
 * the agent picked in the composer does, as before.
 */
export function resolvePromptAgent(input: { inFrame: boolean; mode: ChatMode; selectedAgent: string | null }): string | null {
  return input.inFrame ? agentForMode(input.mode) : input.selectedAgent;
}

/** What was said, added to the end of the draft. Nothing else changes and nothing is sent. */
export function appendTranscript(draft: string, text: string): string {
  const said = text.trim();
  if (!said) return draft;
  if (!draft.trim()) return said;
  return /\s$/.test(draft) ? `${draft}${said}` : `${draft} ${said}`;
}

/** The mic's only effect: each transcript goes into the draft. */
export function transcriptHandler(getDraft: () => string, setDraft: (draft: string) => void): (text: string) => void {
  return (text) => {
    const next = appendTranscript(getDraft(), text);
    if (next !== getDraft()) setDraft(next);
  };
}

/**
 * Plan or Run, which memory it reads, and whether it is a voice conversation, per chat. Chats with
 * no entry use the defaults.
 */
export type ChatSettings = { mode?: ChatMode; memory?: ChatMemory; talk?: boolean };

/** In a voice conversation, what is said is sent, and the answer is read aloud. Off by default. */
export function talkFor(chats: Record<string, ChatSettings>, key: string): boolean {
  return chats[key]?.talk ?? false;
}

export function modeFor(chats: Record<string, ChatSettings>, key: string, preference: ChatMode): ChatMode {
  return chats[key]?.mode ?? preference;
}

/** "This project" only exists inside a project; elsewhere it reads as All my work. */
export function memoryFor(chats: Record<string, ChatSettings>, key: string, inProject: boolean): ChatMemory {
  const memory = chats[key]?.memory ?? (inProject ? "project" : "all");
  return memory === "project" && !inProject ? "all" : memory;
}

export type DeskComposerState = {
  chats: Record<string, ChatSettings>;
  setMode(key: string, mode: ChatMode): void;
  setMemory(key: string, memory: ChatMemory): void;
  setTalk(key: string, talk: boolean): void;
  /**
   * The chat whose spoken message is waiting for its answer to be read aloud, or null. Never
   * kept: an answer that arrives after a restart is not one anybody is listening for.
   */
  awaitingReply: string | null;
  awaitReply(key: string): void;
  /** True once, when `sessionId` was waiting for its answer; the wait is over either way. */
  takeReply(sessionId: string): boolean;
  /** Hands what was chosen on the new chat screen to the session it created. */
  claimNewChat(sessionId: string): void;
};

export const DESK_COMPOSER_STORE_KEY = "redrob.desk.composer.v1";

/**
 * Per-chat choices, not preferences. With a storage they outlive a restart, so a chat
 * stays in Plan or Run and keeps its memory setting. The new chat screen's pending
 * choice is never kept: it belongs to a chat that does not exist yet.
 */
export function createDeskComposerStore(options: { storage?: () => StateStorage } = {}) {
  const initializer: StateCreator<DeskComposerState> = (set, get) => {
    const patch = (key: string, next: ChatSettings) =>
      set((state) => ({ chats: { ...state.chats, [key]: { ...state.chats[key], ...next } } }));
    return {
      chats: {},
      setMode: (key, mode) => patch(key, { mode }),
      setMemory: (key, memory) => patch(key, { memory }),
      setTalk: (key, talk) => patch(key, { talk }),
      awaitingReply: null,
      awaitReply: (key) => set({ awaitingReply: key }),
      takeReply: (sessionId) => {
        if (get().awaitingReply !== sessionId) return false;
        set({ awaitingReply: null });
        return true;
      },
      claimNewChat: (sessionId) =>
        set((state) => {
          const awaitingReply = state.awaitingReply === NEW_CHAT_KEY ? sessionId : state.awaitingReply;
          const { [NEW_CHAT_KEY]: pending, ...rest } = state.chats;
          if (!pending) return { awaitingReply };
          return { awaitingReply, chats: { ...rest, [sessionId]: { ...pending, ...rest[sessionId] } } };
        }),
    };
  };
  if (!options.storage) return create<DeskComposerState>()(initializer);
  return create<DeskComposerState>()(
    persist(initializer, {
      name: DESK_COMPOSER_STORE_KEY,
      storage: createJSONStorage(options.storage),
      partialize: (state) => {
        const { [NEW_CHAT_KEY]: _pending, ...chats } = state.chats;
        return { chats };
      },
    }),
  );
}

export const useDeskComposerStore = createDeskComposerStore({ storage: () => localStorage });
