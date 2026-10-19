import type { Session, Todo } from "@redrob-labs/sdk/v2/client";

import { t } from "../../../i18n";
import { shownChatTitle } from "../../../app/lib/session-title";
import type { RedrobSessionSnapshot } from "../../../app/lib/redrob-server";
import type { ChatMode, HistoryEntry, HistoryStep } from "../services/types";

/** How many chats History lists, newest first, and how many of them it reads the steps of. */
export const HISTORY_LIMIT = 50;
export const HISTORY_STEPS_LIMIT = 20;

/** "3m 05s", "48s", "1h 02m": how long a chat ran, from its first message to its last. */
export function formatTook(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 1_000) return null;
  const seconds = Math.round(ms / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (hours) return `${hours}h ${pad(minutes)}m`;
  if (minutes) return `${minutes}m ${pad(rest)}s`;
  return `${rest}s`;
}

const HISTORY_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a History row last changed, in words (Claude-style): "just now", "5 minutes ago",
 * "3 hours ago", "Yesterday", "4 days ago", then the locale date for anything older than a
 * week. Pure and locale-aware; `now` is passed in so it is deterministic in tests.
 */
export function formatHistoryWhen(at: number, now: number, locale: string): string {
  const delta = now - at;
  if (delta < 60_000) return t("cowork.history_when_just_now");
  if (delta < 60 * 60_000) return t("cowork.history_when_minutes_ago", { count: Math.max(1, Math.round(delta / 60_000)) });
  if (delta < 24 * 60 * 60_000) return t("cowork.history_when_hours_ago", { count: Math.max(1, Math.round(delta / (60 * 60_000))) });
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (at < startOfToday) {
    const days = Math.floor((startOfToday - at) / HISTORY_DAY_MS) + 1;
    if (days === 1) return t("cowork.history_when_yesterday");
    if (days < 7) return t("cowork.history_when_days_ago", { count: days });
  }
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(at));
}

function todoStep(todo: Pick<Todo, "content" | "status">): HistoryStep {
  const state = todo.status === "completed" ? "done" : todo.status === "in_progress" ? "active" : "todo";
  return { label: todo.content, state };
}

/**
 * A chat as a History row. A chat in Run mode, or one a skill or a schedule started, is a
 * run; the rest are chats. Who approved what and whether anything left the computer are not
 * recorded, so they stay empty and the screen leaves them out.
 */
export function historyEntryFrom(input: {
  session: Pick<Session, "id" | "title" | "time"> & { summary?: { files?: number } };
  projectId: string;
  mode: ChatMode | null;
  snapshot?: Pick<RedrobSessionSnapshot, "todos" | "status"> | null;
}): HistoryEntry {
  const { session, snapshot } = input;
  const steps = snapshot?.todos.map(todoStep) ?? [];
  // Working means running or retrying; a blocked turn has ended, as an idle one has.
  const busy = snapshot ? snapshot.status.type === "busy" || snapshot.status.type === "retry" : false;
  const unfinished = steps.some((step) => step.state !== "done");
  const state = busy ? "blocked" : unfinished ? "stopped" : "done";
  const label = busy ? t("cowork.history_working") : unfinished ? t("cowork.history_unfinished") : t("cowork.history_done");
  return {
    id: session.id,
    at: session.time.updated,
    kind: input.mode === "run" || steps.length > 0 ? "run" : "chat",
    what: shownChatTitle(session.title).trim() || t("cowork.history_untitled"),
    projectId: input.projectId,
    state,
    label,
    approvedBy: null,
    took: formatTook(session.time.updated - session.time.created),
    sentOutside: false,
    filesChanged: session.summary?.files ?? 0,
    ...(steps.length ? { steps } : {}),
  };
}

/** The steps a run got through, as "4 of 5 steps". */
export function stepsDone(steps: readonly HistoryStep[] | undefined): string | null {
  if (!steps?.length) return null;
  return t("cowork.history_steps", { done: steps.filter((step) => step.state === "done").length, count: steps.length });
}
