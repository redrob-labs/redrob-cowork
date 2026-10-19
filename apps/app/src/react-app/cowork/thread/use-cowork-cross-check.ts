import { useEffect, useEffectEvent } from "react";
import type { Message, Part } from "@redrob-labs/sdk/v2/client";

import { unwrap } from "../../../app/lib/opencode";
import type { Client, OpencodeEvent } from "../../../app/types";
import { t } from "../../../i18n";
import { subscribeSessionSyncEvents } from "../../domains/session/sync/session-sync";
import type { CoworkCrossCheck } from "../composer/composer-state";
import { EMPTY_RUN_EVENTS, reduceRunEvent } from "../run/run-events";
import { useCheckStore } from "./check-store";
import { retryPlan, runCrossCheck, type CheckedDocument, type CrossCheckDeps, type TranscriptMessage } from "./cross-check";

/** A session's messages as the cross-check reads them: who said it, whether it is done, the text. */
export function toTranscript(entries: Array<{ info: Message; parts: Part[] }>): TranscriptMessage[] {
  return entries.map(({ info, parts }) => {
    const document = writtenDocument(parts);
    return {
      id: info.id,
      role: info.role,
      completed: info.role === "assistant" && typeof info.time.completed === "number",
      finish: info.role === "assistant" ? info.finish : undefined,
      text: parts.flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : [])).join("\n"),
      ...(document ? { document } : {}),
    };
  });
}

/**
 * Round 8 (M3): the newest file a message wrote in FULL - a `write` tool call carrying the whole body
 * (edits and patches carry diffs, so they are not documents). Engine part shape:
 * { type: "tool", tool, state: { status, input: { filePath, content } } }.
 */
export function writtenDocument(parts: readonly Part[]): CheckedDocument | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index] as { type?: string; tool?: unknown; state?: { status?: unknown; input?: unknown } } | undefined;
    if (part?.type !== "tool" || typeof part.tool !== "string" || !/(^|[._:/-])write$/i.test(part.tool)) continue;
    if (part.state?.status === "error") continue;
    const input = part.state?.input as { filePath?: unknown; content?: unknown } | undefined;
    if (typeof input?.filePath === "string" && typeof input.content === "string" && input.content.trim()) {
      return { path: input.filePath, content: input.content };
    }
  }
  return null;
}

/** A permission ask in an engine event: which session asked, and the id to answer it by. */
export function permissionAsk(event: Pick<OpencodeEvent, "type"> & { properties?: unknown }): { sessionId: string; requestId: string; v2: boolean } | null {
  if (event.type !== "permission.asked" && event.type !== "permission.v2.asked") return null;
  const props: unknown = event.properties;
  if (typeof props !== "object" || props === null) return null;
  const sessionId = "sessionID" in props && typeof props.sessionID === "string" ? props.sessionID : "";
  const requestId = "id" in props && typeof props.id === "string" ? props.id : "";
  return sessionId && requestId ? { sessionId, requestId, v2: event.type === "permission.v2.asked" } : null;
}

function crossCheckDeps(client: Client, directory: string | undefined): CrossCheckDeps {
  const store = useCheckStore.getState();
  return {
    messages: async (sessionId) => toTranscript(unwrap(await client.session.messages({ sessionID: sessionId, directory }))),
    // A child session: the engine keeps it out of the chat's transcript and the chat list
    // (lists ask for root sessions only).
    createCheckSession: async (parentId) =>
      unwrap(await client.session.create({ directory, parentID: parentId, title: t("cowork.thread_fact_title") })).id,
    // On the model the chat used, not the engine's default.
    prompt: async (sessionId, text, agent, model) => {
      const result = await client.session.promptAsync({
        sessionID: sessionId,
        directory,
        agent,
        parts: [{ type: "text", text }],
        ...(model.model ? { model: model.model } : {}),
        ...(model.variant ? { variant: model.variant } : {}),
      });
      if (result.error) throw new Error(t("cowork.thread_receipt_fact_failed"));
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    start: store.start,
    settle: store.settle,
    track: store.track,
    untrack: store.untrack,
    stopped: (checkSessionId) => Boolean(useCheckStore.getState().stopped[checkSessionId]),
  };
}

/**
 * A check has no one to ask: its session is hidden. Anything it asks for is refused at
 * once, so the check stops and reads as failed rather than waiting out the timeout.
 */
async function refuseCheckAsk(client: Client, directory: string | undefined, ask: { sessionId: string; requestId: string; v2: boolean }) {
  useCheckStore.getState().stop(ask.sessionId);
  try {
    if (ask.v2) {
      await client.v2.session.permission.reply({ sessionID: ask.sessionId, requestID: ask.requestId, reply: "reject" });
    } else {
      await client.permission.reply({ requestID: ask.requestId, reply: "reject", directory });
    }
  } catch {
    // The check is already marked stopped; it settles as failed either way.
  }
}

/**
 * Runs Cross-check after an answer to a Run prompt sent inside the Cowork frame: the send path
 * marks the session pending, and when the run answers its answer is checked as the person's
 * levels say. Mounted once, by the session route. It also answers Retry on a failed check.
 */
export function useCoworkCrossCheck(input: { client: Client | null; directory: string | undefined; levels: CoworkCrossCheck }) {
  const onAnswered = useEffectEvent((sessionId: string) => {
    const pending = useCheckStore.getState().take(sessionId);
    if (!pending || !input.client) return;
    void runCrossCheck(crossCheckDeps(input.client, input.directory), { sessionId, ...pending, levels: input.levels });
  });

  const onAsk = useEffectEvent((ask: { sessionId: string; requestId: string; v2: boolean }) => {
    if (!input.client || !useCheckStore.getState().checking[ask.sessionId]) return;
    void refuseCheckAsk(input.client, input.directory, ask);
  });

  const onRetry = useEffectEvent((messageId: string) => {
    const checks = useCheckStore.getState().answers[messageId];
    if (!checks?.request || !input.client) return;
    void runCrossCheck(crossCheckDeps(input.client, input.directory), {
      ...checks.request,
      levels: input.levels,
      plan: retryPlan(checks),
    });
  });

  useEffect(() => {
    useCheckStore.getState().setRetryHandler((messageId) => onRetry(messageId));
    let state = EMPTY_RUN_EVENTS;
    const unsubscribe = subscribeSessionSyncEvents((_workspaceId, event) => {
      const ask = permissionAsk(event);
      if (ask) onAsk(ask);
      const result = reduceRunEvent(state, event);
      state = result.state;
      for (const emitted of result.emitted) {
        if (emitted.type === "run.answered") onAnswered(emitted.runId);
      }
    });
    return () => {
      unsubscribe();
      useCheckStore.getState().setRetryHandler(null);
    };
  }, []);
}