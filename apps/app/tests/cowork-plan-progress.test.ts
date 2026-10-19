import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { firstWritingStep, IDLE_PLAN_ACTIVITY, planRunActivities, planStepStates, samePlanActivities, type PlanRunActivity } from "../src/react-app/cowork/thread/plan-progress";
import { planRunPrompt } from "../src/react-app/cowork/thread/thread-logic";

// Round 9 (R9-7): the plan's checklist ticks from what the run is doing.

const PLAN_TEXT = '```redrob-plan\n{"title":"Research plan","summary":"A memo.","sections":[],"todo":[{"label":"Gather"},{"label":"Write"}]}\n```';

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
const assistant = (id: string, parts: UIMessage["parts"]): UIMessage => ({ id, role: "assistant", parts });
const text = (value: string) => ({ type: "text", text: value }) as UIMessage["parts"][number];
const tool = (toolName: string, state: string) => ({ type: "dynamic-tool", toolName, toolCallId: `${toolName}-${state}-${Math.random()}`, state, input: {} }) as unknown as UIMessage["parts"][number];

const LABELS = [
  "Gather the current picture on models, chips, power",
  "Rank the three forces",
  "Write the 2035 scenarios",
  "Save the private memo as a readable document",
];

const act = (patch: Partial<PlanRunActivity>): PlanRunActivity => ({ ...IDLE_PLAN_ACTIVITY, ...patch });

describe("planRunActivities", () => {
  test("a plan with no run send has not started", () => {
    const map = planRunActivities([user("u1", "ask"), assistant("p", [text(PLAN_TEXT)])], false);
    expect(map.get("p")).toEqual(IDLE_PLAN_ACTIVITY);
  });

  test("the run after the plan's run send counts web steps and writes; idle finishes it", () => {
    const messages = [
      user("u1", "ask"),
      assistant("p", [text(PLAN_TEXT)]),
      user("u2", planRunPrompt("plan")),
      assistant("r1", [tool("websearch", "output-available"), tool("webfetch", "output-available"), tool("write", "input-streaming")]),
    ];
    expect(planRunActivities(messages, true).get("p")).toEqual({ started: true, webSteps: 2, writing: "writing", writes: 0, finished: false });
    const done = [...messages.slice(0, 3), assistant("r1", [tool("websearch", "output-available"), tool("write", "output-available")])];
    expect(planRunActivities(done, false).get("p")).toEqual({ started: true, webSteps: 1, writing: "written", writes: 1, finished: true });
  });

  test("a later person's message finishes the run even while the session is busy", () => {
    const messages = [assistant("p", [text(PLAN_TEXT)]), user("u2", planRunPrompt("plan")), assistant("r1", [tool("websearch", "output-available")]), user("u3", "thanks")];
    expect(planRunActivities(messages, true).get("p")?.finished).toBe(true);
  });

  test("same-content maps compare equal", () => {
    const a = new Map([["p", act({ started: true, webSteps: 2 })]]);
    expect(samePlanActivities(a, new Map([["p", act({ started: true, webSteps: 2 })]]))).toBe(true);
    expect(samePlanActivities(a, new Map([["p", act({ started: true, webSteps: 3 })]]))).toBe(false);
  });
});

describe("planStepStates", () => {
  test("the first writing step is found by its words, else the last step", () => {
    expect(firstWritingStep(LABELS)).toBe(2);
    expect(firstWritingStep(["Look", "Compare"])).toBe(1);
  });

  test("not started: all to do; finished: all done", () => {
    expect(planStepStates(LABELS, IDLE_PLAN_ACTIVITY)).toEqual(["todo", "todo", "todo", "todo"]);
    expect(planStepStates(LABELS, act({ started: true, finished: true }))).toEqual(["done", "done", "done", "done"]);
  });

  test("research ticks about every three web steps but never reaches the writing steps", () => {
    expect(planStepStates(LABELS, act({ started: true }))).toEqual(["active", "todo", "todo", "todo"]);
    expect(planStepStates(LABELS, act({ started: true, webSteps: 3 }))).toEqual(["done", "active", "todo", "todo"]);
    expect(planStepStates(LABELS, act({ started: true, webSteps: 30 }))).toEqual(["done", "active", "todo", "todo"]);
  });

  test("writing finishes research; each finished write ticks a writing step; the last waits for the end", () => {
    expect(planStepStates(LABELS, act({ started: true, webSteps: 5, writing: "writing" }))).toEqual(["done", "done", "active", "todo"]);
    expect(planStepStates(LABELS, act({ started: true, writing: "writing", writes: 1 }))).toEqual(["done", "done", "done", "active"]);
    expect(planStepStates(LABELS, act({ started: true, writing: "written", writes: 1 }))).toEqual(["done", "done", "done", "active"]);
  });
});
