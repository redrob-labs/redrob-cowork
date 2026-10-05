import { create } from "zustand";
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

/** Plan or Run, and which memory it reads, per chat. Chats with no entry use the defaults. */
export type ChatSettings = { mode?: ChatMode; memory?: ChatMemory };

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
  /** Hands what was chosen on the new chat screen to the session it created. */
  claimNewChat(sessionId: string): void;
};

/** In memory for the app session: per-chat choices, not preferences. */
export function createDeskComposerStore() {
  return create<DeskComposerState>()((set) => {
    const patch = (key: string, next: ChatSettings) =>
      set((state) => ({ chats: { ...state.chats, [key]: { ...state.chats[key], ...next } } }));
    return {
      chats: {},
      setMode: (key, mode) => patch(key, { mode }),
      setMemory: (key, memory) => patch(key, { memory }),
      claimNewChat: (sessionId) =>
        set((state) => {
          const { [NEW_CHAT_KEY]: pending, ...rest } = state.chats;
          if (!pending) return state;
          return { chats: { ...rest, [sessionId]: { ...pending, ...rest[sessionId] } } };
        }),
    };
  });
}

export const useDeskComposerStore = createDeskComposerStore();
