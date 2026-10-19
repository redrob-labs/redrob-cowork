import { useRef } from "react";

import type { TodoItem } from "@/app/types";

/**
 * Round 7 C4: what the to-do dock above the composer shows.
 *
 * The dock used to read the session's todo cache directly, and that cache is written both by the
 * live `todo.updated` event and by every session snapshot - a snapshot taken a moment earlier can
 * put back an older or EMPTY list, so the dock flickered in and out mid-run. The rule now:
 * - a non-empty list from the agent always wins and is remembered for the session;
 * - while the run is busy an empty list does not hide the remembered one (it is a stale write);
 * - once the run is idle the dock hides when every item is completed or cancelled ("until the
 *   task is completed"), and an idle empty list clears it;
 * - switching sessions never carries one session's list into another.
 * Only what the agent itself reports is shown (calibration 3b: no plan-derived fallback).
 */
export type StickyTodoMemo = { sessionId: string; todos: TodoItem[] };

/** The inputs a render has: the session, its cached todos, and whether its run is busy. */
export type StickyTodoInput = { sessionId: string; todos: TodoItem[]; busy: boolean };

/** Whether a to-do no longer needs doing. */
function isSettled(todo: TodoItem): boolean {
  return todo.status === "completed" || todo.status === "cancelled";
}

/** Pure step: the next memo and the list the dock should draw (empty = no dock). */
export function nextStickyTodos(prev: StickyTodoMemo | null, input: StickyTodoInput): { memo: StickyTodoMemo; shown: TodoItem[] } {
  const visible = input.todos.filter((todo) => todo.content.trim());
  const carried = prev && prev.sessionId === input.sessionId ? prev.todos : [];
  const todos = visible.length > 0 ? visible : input.busy ? carried : [];
  const memo = { sessionId: input.sessionId, todos };
  const done = todos.length > 0 && todos.every(isSettled);
  const shown = !input.busy && done ? [] : todos;
  return { memo, shown };
}

/** The dock's list for this render, remembered across renders of the same surface. */
export function useStickyTodos(sessionId: string, todos: TodoItem[], busy: boolean): TodoItem[] {
  const memoRef = useRef<StickyTodoMemo | null>(null);
  const { memo, shown } = nextStickyTodos(memoRef.current, { sessionId, todos, busy });
  // Render-phase ref write is intentional and idempotent: the same inputs produce the same memo.
  memoRef.current = memo;
  return shown;
}
