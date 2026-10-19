import { useEffect, useRef } from "react";

import { unwrap } from "../../../app/lib/opencode";
import { isBlockMarkerTitle, titleFromPrompt } from "../../../app/lib/session-title";
import type { Client } from "../../../app/types";
import { isPlanRunPrompt, isQuestionAnswerPrompt } from "./thread-logic";

/** The bits of a listed chat this repair reads. */
type TitledSession = { id: string; title?: string | null };

/** A message as the engine lists it, reduced to what finding the first prompt needs. */
type ListedMessage = { info: { role: string }; parts: Array<{ type: string; text?: string; synthetic?: boolean }> };

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
export function sessionsNeedingTitle(sessions: readonly TitledSession[], tried: ReadonlySet<string>): string[] {
  return sessions.filter((session) => isBlockMarkerTitle(session.title) && !tried.has(session.id)).map((session) => session.id);
}

/**
 * Round 9: rename any chat titled with a Cowork block marker ("```redrob-questions") after the
 * person's first prompt. Uses the same `session.update` call the Rename action uses; each chat is
 * tried once per app run, and a failure only leaves the display fallback ("New session") in place.
 */
export function useRepairMarkerTitles(input: {
  client: Client | null | undefined;
  directory: string | undefined;
  sessions: readonly TitledSession[];
  onRenamed: () => void;
}) {
  const tried = useRef(new Set<string>());
  const onRenamed = useRef(input.onRenamed);
  onRenamed.current = input.onRenamed;
  const { client, directory, sessions } = input;
  // Only an unmount stops a repair in flight; a refreshed session list must not cancel it (each
  // chat is tried once, so a cancelled try would never be retried).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!client) return;
    const ids = sessionsNeedingTitle(sessions, tried.current);
    if (ids.length === 0) return;
    for (const id of ids) tried.current.add(id);
    void (async () => {
      let renamed = false;
      for (const id of ids) {
        try {
          // No limit: the engine's limit keeps the NEWEST messages, and the first prompt is the oldest.
          const messages = unwrap(await client.session.messages({ sessionID: id, directory })) as unknown as ListedMessage[];
          const title = titleFromPrompt(firstPromptText(messages));
          if (!title || !mounted.current) continue;
          await client.session.update({ sessionID: id, title, directory });
          renamed = true;
        } catch {
          // Leave it: the display already hides a marker title.
        }
      }
      if (renamed && mounted.current) onRenamed.current();
    })();
  }, [client, directory, sessions]);
}
