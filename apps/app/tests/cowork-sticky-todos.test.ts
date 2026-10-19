import { describe, expect, test } from "bun:test";

import type { TodoItem } from "../src/app/types";
import { nextStickyTodos, type StickyTodoMemo } from "../src/react-app/domains/session/surface/sticky-todos";
import { shouldSeedSnapshotTodos } from "../src/react-app/domains/session/sync/session-sync";

// Round 7 C4: the to-do dock stays up until the task is completed, without flicker.

const todo = (id: string, status: string, content = `Step ${id}`): TodoItem => ({ id, content, status, priority: "medium" });
const plan = [todo("1", "completed"), todo("2", "in_progress"), todo("3", "pending")];

function run(steps: { todos: TodoItem[]; busy: boolean; sessionId?: string }[]): TodoItem[][] {
  let memo: StickyTodoMemo | null = null;
  return steps.map((step) => {
    const next = nextStickyTodos(memo, { sessionId: step.sessionId ?? "s1", todos: step.todos, busy: step.busy });
    memo = next.memo;
    return next.shown;
  });
}

describe("nextStickyTodos", () => {
  test("a stale empty write mid-run does not hide the dock", () => {
    const [first, second] = run([{ todos: plan, busy: true }, { todos: [], busy: true }]);
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
  });

  test("the newest non-empty list always wins", () => {
    const updated = [todo("1", "completed"), todo("2", "completed"), todo("3", "in_progress")];
    const [, second] = run([{ todos: plan, busy: true }, { todos: updated, busy: true }]);
    expect(second.map((item) => item.status)).toEqual(["completed", "completed", "in_progress"]);
  });

  test("hides once the run is idle and every item is done", () => {
    const done = plan.map((item) => ({ ...item, status: "completed" }));
    const [whileBusy, afterIdle] = run([{ todos: done, busy: true }, { todos: done, busy: false }]);
    expect(whileBusy).toHaveLength(3);
    expect(afterIdle).toEqual([]);
  });

  test("stays when the run stops with work left (stopped or failed)", () => {
    const [, idle] = run([{ todos: plan, busy: true }, { todos: plan, busy: false }]);
    expect(idle).toHaveLength(3);
  });

  test("an idle empty list clears it, and blank items never count", () => {
    expect(run([{ todos: plan, busy: true }, { todos: [], busy: false }])[1]).toEqual([]);
    expect(run([{ todos: [todo("1", "pending", "   ")], busy: true }])[0]).toEqual([]);
  });

  test("never carries one session's list into another", () => {
    const [, other] = run([{ todos: plan, busy: true }, { todos: [], busy: true, sessionId: "s2" }]);
    expect(other).toEqual([]);
  });
});

describe("snapshot vs live to-do writes (C4 review)", () => {
  test("a snapshot fetched before the latest live event does not overwrite the list", () => {
    expect(shouldSeedSnapshotTodos(1_000, 2_000)).toBe(false);
    expect(shouldSeedSnapshotTodos(2_000, 2_000)).toBe(true);
    expect(shouldSeedSnapshotTodos(3_000, 2_000)).toBe(true);
  });

  test("with no event yet, or no recorded fetch start, the snapshot seeds as before", () => {
    expect(shouldSeedSnapshotTodos(1_000, undefined)).toBe(true);
    expect(shouldSeedSnapshotTodos(undefined, 2_000)).toBe(true);
  });
});
