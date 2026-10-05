import { useEffect, useEffectEvent } from "react";
import type { Message, Part } from "@redrob-labs/sdk/v2/client";

import { unwrap } from "../../../app/lib/opencode";
import type { Client } from "../../../app/types";
import { t } from "../../../i18n";
import { subscribeSessionSyncEvents } from "../../domains/session/sync/session-sync";
import type { DeskCrossCheck } from "../composer/composer-state";
import { EMPTY_RUN_EVENTS, reduceRunEvent } from "../run/run-events";
import { useCheckStore } from "./check-store";
import { runCrossCheck, type CrossCheckDeps, type TranscriptMessage } from "./cross-check";

/** A session's messages as the cross-check reads them: who said it, whether it is done, the text. */
export function toTranscript(entries: Array<{ info: Message; parts: Part[] }>): TranscriptMessage[] {
  return entries.map(({ info, parts }) => ({
    id: info.id,
    role: info.role,
    completed: info.role === "assistant" && typeof info.time.completed === "number",
    finish: info.role === "assistant" ? info.finish : undefined,
    text: parts.flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : [])).join("\n"),
  }));
}

function crossCheckDeps(client: Client, directory: string | undefined): CrossCheckDeps {
  const store = useCheckStore.getState();
  return {
    messages: async (sessionId) => toTranscript(unwrap(await client.session.messages({ sessionID: sessionId, directory }))),
    // A child session: the engine keeps it out of the chat's transcript and the chat list
    // (lists ask for root sessions only).
    createCheckSession: async (parentId) =>
      unwrap(await client.session.create({ directory, parentID: parentId, title: t("desk.thread_fact_title") })).id,
    prompt: async (sessionId, text, agent) => {
      const result = await client.session.promptAsync({ sessionID: sessionId, directory, agent, parts: [{ type: "text", text }] });
      if (result.error) throw new Error(t("desk.thread_receipt_fact_failed"));
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    start: store.start,
    settle: store.settle,
  };
}

/**
 * Runs Cross-check after an answer to a Run prompt sent inside the Desk frame: the send path
 * marks the session pending, and when the run answers its answer is checked as the person's
 * levels say. Mounted once, by the session route.
 */
export function useDeskCrossCheck(input: { client: Client | null; directory: string | undefined; levels: DeskCrossCheck }) {
  const onAnswered = useEffectEvent((sessionId: string) => {
    const pending = useCheckStore.getState().take(sessionId);
    if (!pending || !input.client) return;
    void runCrossCheck(crossCheckDeps(input.client, input.directory), {
      sessionId,
      question: pending.question,
      planned: pending.planned,
      levels: input.levels,
    });
  });

  useEffect(() => {
    let state = EMPTY_RUN_EVENTS;
    return subscribeSessionSyncEvents((_workspaceId, event) => {
      const result = reduceRunEvent(state, event);
      state = result.state;
      for (const emitted of result.emitted) {
        if (emitted.type === "run.answered") onAnswered(emitted.runId);
      }
    });
  }, []);
}
