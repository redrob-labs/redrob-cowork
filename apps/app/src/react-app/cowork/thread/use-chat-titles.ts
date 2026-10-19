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
type ListedMessage = {
  info: { role: string; providerID?: string; modelID?: string; time?: { completed?: number } };
  parts: Array<{ type: string; text?: string; synthetic?: boolean }>;
};

/** Newest chats looked at per pass, so an old history is not renamed (or billed) all at once. */
export const TITLE_PASS_LIMIT = 12;
/** How long one hidden naming request may take before the rule-made title stays (ms). */
const NAME_TIMEOUT_MS = 45_000;
/** How often the naming request is checked for its answer (ms). */
const NAME_POLL_MS = 1_500;
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
  const running = useRef(false);
  const latestSessions = useRef(input.sessions);
  latestSessions.current = input.sessions;
  const onRenamed = useRef(input.onRenamed);
  onRenamed.current = input.onRenamed;
  const { enabled, client, directory, sessions } = input;
  // Only an unmount stops a pass in flight; a refreshed session list must not cancel it.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !client || running.current) return;
    tried.current ??= readTried();
    const done = tried.current;
    if (sessionsToTitle(sessions, done).length === 0) return;
    running.current = true;

    const rename = async (id: string, title: string) => {
      await client.session.update({ sessionID: id, title, directory });
      if (mounted.current) onRenamed.current();
    };

    const nameOne = async (id: string, before: string) => {
      // No limit: the engine's limit keeps the NEWEST messages, and the first prompt is the oldest.
      const messages = unwrap(await client.session.messages({ sessionID: id, directory })) as unknown as ListedMessage[];
      const prompt = firstPromptText(messages);
      // No prompt yet (a brand-new chat): not marked tried, so a later list refresh looks again.
      if (!prompt) return;
      done.add(id);
      writeTried(done);
      if (!isPromptDerivedTitle(before, prompt)) return;
      const ruled = shortTitleFromPrompt(prompt);
      if (ruled && ruled !== before) await rename(id, ruled);
      const expected = (ruled || before).trim();

      const child = unwrap(await client.session.create({ directory, parentID: id, ...(expected ? { title: expected } : {}) })) as { id: string };
      try {
        const model = chatModel(messages);
        const sent = await client.session.promptAsync({
          sessionID: child.id,
          directory,
          agent: COWORK_CHECK_AGENT,
          parts: [{ type: "text", text: namingPrompt(prompt) }],
          ...(model ? { model } : {}),
        });
        if (sent.error) return;
        const deadline = Date.now() + NAME_TIMEOUT_MS;
        while (Date.now() < deadline && mounted.current) {
          await new Promise((resolve) => setTimeout(resolve, NAME_POLL_MS));
          const answer = namingAnswer(unwrap(await client.session.messages({ sessionID: child.id, directory })) as unknown as ListedMessage[]);
          if (answer === null) continue;
          const named = cleanGeneratedTitle(answer);
          if (!named) return;
          // A Rename while the request ran wins: only replace the title this pass set.
          const current = (unwrap(await client.session.get({ sessionID: id, directory })) as { title?: string }).title ?? "";
          if (current.trim() === expected && named !== current.trim()) await rename(id, named);
          return;
        }
      } finally {
        // The naming session is machinery: never leave it behind in the engine.
        await client.session.delete({ sessionID: child.id, directory }).catch(() => undefined);
      }
    };

    // One chat at a time; chats that arrive while the pass runs are picked up from the latest list.
    void (async () => {
      const looked = new Set<string>();
      try {
        while (mounted.current && looked.size < TITLE_PASS_LIMIT) {
          const list = latestSessions.current;
          const next = sessionsToTitle(list, done).find((id) => !looked.has(id));
          if (!next) break;
          looked.add(next);
          const before = list.find((session) => session.id === next)?.title ?? "";
          await nameOne(next, before).catch(() => {
            // Leave it: the display already hides a marker title, and the rule title may have landed.
          });
        }
      } finally {
        running.current = false;
      }
    })();
  }, [enabled, client, directory, sessions]);
}
