import { useEffect, useRef } from "react";

import { unwrap } from "../../../app/lib/opencode";
import {
  cleanGeneratedTitle,
  isBlockMarkerTitle,
  isPromptDerivedTitle,
  shortTitleFromPrompt,
} from "../../../app/lib/session-title";
import type { Client } from "../../../app/types";
import { COWORK_CHECK_AGENT } from "./cross-check";
import { isPlanRunPrompt, isQuestionAnswerPrompt } from "./thread-logic";

/** The bits of a listed chat this pass reads. */
export type TitledSession = { id: string; title?: string | null; parentID?: string | null };

/** A message as the engine lists it, reduced to what naming a chat needs. */
export type ListedMessage = {
  info: { role: string; providerID?: string; modelID?: string; time?: { completed?: number } };
  parts: Array<{ type: string; text?: string; synthetic?: boolean }>;
};

/** Newest chats looked at per pass, so an old history is not renamed (or billed) all at once. */
export const TITLE_PASS_LIMIT = 12;
/** How long one hidden naming request may take before the rule-made title stays (ms). */
const NAME_TIMEOUT_MS = 45_000;
/** How often the naming request is checked for its answer (ms). */
export const NAME_POLL_MS = 1_500;
/** Chats already named, kept across app runs so each chat is named once. */
const TRIED_KEY = "redrob.cowork.chatTitles.v1";
/** Most chat ids kept in TRIED_KEY (oldest dropped first). */
const TRIED_MAX = 500;

/** Pure: the person's first real prompt in a chat's messages, or "" when there is none. The hidden
 *  sends the thread makes (question answers, plan runs) are not prompts. */
export function firstPromptText(messages: readonly ListedMessage[]): string {
  for (const message of messages) {
    if (message.info.role !== "user") continue;
    const text = message.parts
      .flatMap((part) => (part.type === "text" && !part.synthetic && part.text ? [part.text] : []))
      .join("\n")
      .trim();
    if (text && !isPlanRunPrompt(text) && !isQuestionAnswerPrompt(text)) return text;
  }
  return "";
}

/** Pure: the chats whose title is a Cowork block marker and that have not been tried yet. */
function sessionsNeedingTitle(sessions: readonly TitledSession[], tried: ReadonlySet<string>): string[] {
  return sessions.filter((session) => isBlockMarkerTitle(session.title) && !tried.has(session.id)).map((session) => session.id);
}

/**
 * The chats this pass looks at - every untried marker title first, then the newest
 * untried root chats (the list is newest first), at most `limit` in all. Whether a chat is
 * actually renamed is decided after reading its first prompt (isPromptDerivedTitle).
 */
export function sessionsToTitle(sessions: readonly TitledSession[], tried: ReadonlySet<string>, limit = TITLE_PASS_LIMIT): string[] {
  const ids = new Set(sessionsNeedingTitle(sessions, tried));
  for (const session of sessions) {
    if (ids.size >= limit) break;
    if (!session.parentID && !tried.has(session.id)) ids.add(session.id);
  }
  return [...ids].slice(0, limit);
}

/** What the hidden naming request asks. Plain words; the answer is one short line. */
export function namingPrompt(prompt: string): string {
  return [
    "Name this chat. Do not answer the request, do not research, do not use tools.",
    "Reply with ONLY the title on one line: 2 to 6 words, in the language of the request, sentence case,",
    "no quotes, no closing punctuation, no code block, no check block.",
    'Name the subject, not the task: "US-China AI race to 2035", not "Research and write a brief".',
    "",
    "Request:",
    prompt.slice(0, 1500),
  ].join("\n");
}

/** Pure: the newest finished assistant answer in a naming session, or null while it still runs. */
export function namingAnswer(messages: readonly ListedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.info.role !== "assistant") continue;
    if (typeof message.info.time?.completed !== "number") return null;
    return message.parts.flatMap((part) => (part.type === "text" && !part.synthetic && part.text ? [part.text] : [])).join("\n");
  }
  return null;
}

/** The model the chat answered on, so the naming request does not fall to the engine default. */
function chatModel(messages: readonly ListedMessage[]): { providerID: string; modelID: string } | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index]?.info;
    if (info?.role === "assistant" && info.providerID && info.modelID) return { providerID: info.providerID, modelID: info.modelID };
  }
  return undefined;
}

/** The chat ids already named, from local storage (empty when unreadable). */
function readTried(): Set<string> {
  try {
    const raw = window.localStorage.getItem(TRIED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string") : []);
  } catch {
    return new Set();
  }
}

/** Saves the named chat ids, newest TRIED_MAX only. */
function writeTried(tried: Set<string>) {
  try {
    window.localStorage.setItem(TRIED_KEY, JSON.stringify([...tried].slice(-TRIED_MAX)));
  } catch {
    // Storage full or blocked: a chat is only looked at again next run.
  }
}

/** The engine calls a title pass makes, injected so the pass can be tested without an engine. */
export type TitlePassDeps = {
  /** The latest chat list (re-read each step, so chats that arrive mid-pass are picked up). */
  sessions(): readonly TitledSession[];
  messages(sessionId: string): Promise<ListedMessage[]>;
  /** The chat's title as the engine has it now. */
  title(sessionId: string): Promise<string>;
  rename(sessionId: string, title: string): Promise<void>;
  /** A hidden child session for the naming request; returns its id. */
  createChild(parentId: string, title: string): Promise<string>;
  /** Sends the naming request; false when the engine refused it. */
  prompt(sessionId: string, text: string, model: { providerID: string; modelID: string } | undefined): Promise<boolean>;
  deleteChild(sessionId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  /** Chats already settled; `remember` persists an id once its chat needs no more work. */
  tried: ReadonlySet<string>;
  remember(sessionId: string): void;
};

/** Names one chat: the rule title first, then the AI title if no Rename happened in between. */
async function nameOne(deps: TitlePassDeps, signal: AbortSignal, id: string, before: string): Promise<void> {
  // No limit: the engine's limit keeps the NEWEST messages, and the first prompt is the oldest.
  const messages = await deps.messages(id);
  const prompt = firstPromptText(messages);
  // No prompt yet (a brand-new chat): not settled, so a later list refresh looks again.
  if (!prompt || signal.aborted) return;
  // A title the person chose is never touched.
  if (!isPromptDerivedTitle(before, prompt)) return deps.remember(id);
  const ruled = shortTitleFromPrompt(prompt);
  // A failed rename throws before the chat is settled, so the next pass tries again.
  if (ruled && ruled !== before) await deps.rename(id, ruled);
  deps.remember(id);
  const expected = (ruled || before).trim();
  if (signal.aborted) return;

  const child = await deps.createChild(id, expected);
  try {
    if (!(await deps.prompt(child, namingPrompt(prompt), chatModel(messages)))) return;
    for (let waited = 0; waited < NAME_TIMEOUT_MS && !signal.aborted; waited += NAME_POLL_MS) {
      await deps.sleep(NAME_POLL_MS);
      if (signal.aborted) return;
      const answer = namingAnswer(await deps.messages(child));
      if (answer === null) continue;
      const named = cleanGeneratedTitle(answer);
      if (!named) return;
      // A Rename while the request ran wins: only replace the title this pass set.
      const current = (await deps.title(id)).trim();
      if (current === expected && named !== current && !signal.aborted) await deps.rename(id, named);
      return;
    }
  } finally {
    // The naming session is machinery: never leave it behind in the engine.
    await deps.deleteChild(child).catch(() => undefined);
  }
}

/**
 * One title pass: names chats one at a time from the latest list, at most TITLE_PASS_LIMIT,
 * until none is left or `signal` aborts (Cowork left, client or workspace changed, unmount).
 * A failing chat is left for a later pass. Never throws.
 */
export async function runTitlePass(deps: TitlePassDeps, signal: AbortSignal): Promise<void> {
  const looked = new Set<string>();
  while (!signal.aborted && looked.size < TITLE_PASS_LIMIT) {
    const list = deps.sessions();
    const next = sessionsToTitle(list, deps.tried).find((id) => !looked.has(id));
    if (!next) return;
    looked.add(next);
    const before = list.find((session) => session.id === next)?.title ?? "";
    await nameOne(deps, signal, next, before).catch(() => {
      // Leave it: the display already hides a marker title, and the rule title may have landed.
    });
  }
}

/** The engine-backed deps for a title pass in one workspace. */
function titlePassDeps(client: Client, directory: string | undefined, sessions: () => readonly TitledSession[], tried: Set<string>, onRenamed: () => void): TitlePassDeps {
  return {
    sessions,
    messages: async (sessionId) => unwrap(await client.session.messages({ sessionID: sessionId, directory })) as unknown as ListedMessage[],
    title: async (sessionId) => (unwrap(await client.session.get({ sessionID: sessionId, directory })) as { title?: string }).title ?? "",
    rename: async (sessionId, title) => {
      await client.session.update({ sessionID: sessionId, title, directory });
      onRenamed();
    },
    createChild: async (parentId, title) =>
      (unwrap(await client.session.create({ directory, parentID: parentId, ...(title ? { title } : {}) })) as { id: string }).id,
    prompt: async (sessionId, text, model) => {
      const sent = await client.session.promptAsync({
        sessionID: sessionId,
        directory,
        agent: COWORK_CHECK_AGENT,
        parts: [{ type: "text", text }],
        ...(model ? { model } : {}),
      });
      return !sent.error;
    },
    deleteChild: async (sessionId) => {
      await client.session.delete({ sessionID: sessionId, directory });
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    tried,
    remember: (sessionId) => {
      tried.add(sessionId);
      writeTried(tried);
    },
  };
}

/**
 * Names Cowork chats whose title was made from the prompt itself, once and for good, in two steps:
 *   1. at once, by rule (shortTitleFromPrompt: filler dropped, at most 6 words);
 *   2. then by a hidden one-shot request in a child session (kept out of the chat list, like the
 *      checks, and deleted when done), on the chat's own model. Its answer replaces the rule title
 *      only while the title is still the rule title, so a Rename in between always wins.
 * Chats are named one at a time, and only while `enabled` (inside the Cowork frame); a title the
 * person chose is never touched. Uses the same session.update call as Rename.
 */
export function useChatTitles(input: {
  /** Only the Cowork frame names chats; the bare surface keeps the engine's titles. */
  enabled: boolean;
  client: Client | null | undefined;
  directory: string | undefined;
  sessions: readonly TitledSession[];
  onRenamed: () => void;
}) {
  const tried = useRef<Set<string> | null>(null);
  const latestSessions = useRef(input.sessions);
  latestSessions.current = input.sessions;
  const onRenamed = useRef(input.onRenamed);
  onRenamed.current = input.onRenamed;
  const { enabled, client, directory, sessions } = input;
  // One generation per enabled client + workspace: leaving Cowork, a client or workspace switch,
  // or unmount aborts the pass in flight. A refreshed session list does not.
  const generation = useRef<{ controller: AbortController; running: boolean } | null>(null);

  useEffect(() => {
    if (!enabled || !client) return;
    const current = { controller: new AbortController(), running: false };
    generation.current = current;
    return () => {
      current.controller.abort();
      if (generation.current === current) generation.current = null;
    };
  }, [enabled, client, directory]);

  useEffect(() => {
    const current = generation.current;
    if (!client || !current || current.running || current.controller.signal.aborted) return;
    tried.current ??= readTried();
    if (sessionsToTitle(sessions, tried.current).length === 0) return;
    current.running = true;
    const deps = titlePassDeps(client, directory, () => latestSessions.current, tried.current, () => {
      if (!current.controller.signal.aborted) onRenamed.current();
    });
    void runTitlePass(deps, current.controller.signal).finally(() => {
      current.running = false;
    });
  }, [enabled, client, directory, sessions]);
}
