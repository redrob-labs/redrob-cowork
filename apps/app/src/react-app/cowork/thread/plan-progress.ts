import type { UIMessage } from "ai";

import { getMessagesText } from "../../../components/chat/utils";
import { parseCoworkBlocks } from "./cowork-blocks";
import { isPlanRunPrompt } from "./thread-logic";

/**
 * How far the run of a plan has got, guessed from what the run is doing (no agent instruction and
 * no to-do list is read).
 *
 * Activity is read from the RAW transcript: after a plan message, the hidden plan-run send starts its
 * run, and every assistant message up to the next user message belongs to that run.
 */
export type PlanRunActivity = {
  /** The plan-run send for this plan was made. */
  started: boolean;
  /** Web searches and page reads the run has made so far. */
  webSteps: number;
  /** Where the run's file writing stands: "writing" while a write is in flight. */
  writing: "none" | "writing" | "written";
  /** Writes (or edits) the run has finished. */
  writes: number;
  /** The run's turn is over (a later turn exists, or the session is idle). */
  finished: boolean;
};

/** A plan whose run has not started: nothing done yet. */
export const IDLE_PLAN_ACTIVITY: PlanRunActivity = { started: false, webSteps: 0, writing: "none", writes: 0, finished: false };

/** How each step of the checklist reads right now. */
export type PlanStepState = "done" | "active" | "todo";

/** The fields of a message part this module reads to classify a tool call. */
type ToolLike = { type: string; toolName?: string; state?: string };

/** A message's text, as the thread renders and parses it. */
const textOf = (message: UIMessage): string => getMessagesText([message]);

/** A tool part's name, for both `dynamic-tool` and typed `tool-<name>` parts. */
function toolName(part: ToolLike): string | null {
  if (part.type === "dynamic-tool") return part.toolName?.toLowerCase() ?? null;
  return part.type.startsWith("tool-") ? part.type.slice(5).toLowerCase() : null;
}

/** Tool names counted as a web step (search or page read), with or without an underscore. */
const WEB_TOOLS = new Set(["websearch", "webfetch", "web_search", "web_fetch"]);
/** Tool names counted as writing a file, including a server-prefixed name ("redrob_write"). */
const WRITE_TOOLS = /(^|[._:/-])(write|edit|multiedit|patch|apply_patch)$/;

/**
 * Pure: the run activity of every plan in a transcript, by the plan message's id. `busy` is whether
 * the session is working now, so the newest run is finished only once it goes idle.
 */
export function planRunActivities(messages: readonly UIMessage[], busy: boolean): Map<string, PlanRunActivity> {
  const result = new Map<string, PlanRunActivity>();
  let current: { id: string; activity: PlanRunActivity } | null = null;
  let inRun = false;
  const close = () => {
    if (current) result.set(current.id, current.activity);
  };
  messages.forEach((message) => {
    if (message.role === "user") {
      const runSend = isPlanRunPrompt(textOf(message));
      if (inRun && current) current.activity.finished = true;
      inRun = false;
      if (runSend && current && !current.activity.started) {
        current.activity.started = true;
        inRun = true;
      }
      return;
    }
    if (message.role !== "assistant") return;
    if (!inRun && parseCoworkBlocks(textOf(message)).plan) {
      close();
      current = { id: message.id, activity: { ...IDLE_PLAN_ACTIVITY } };
      return;
    }
    if (!inRun || !current) return;
    for (const part of message.parts as ToolLike[]) {
      const name = toolName(part);
      if (!name) continue;
      if (WEB_TOOLS.has(name)) current.activity.webSteps += 1;
      else if (WRITE_TOOLS.test(name)) {
        const settled = part.state === "output-available" || part.state === "output-error";
        if (settled) current.activity.writes += 1;
        // In flight anywhere wins over settled, so "writing" holds while any write still runs.
        if (!settled) current.activity.writing = "writing";
        else if (current.activity.writing === "none") current.activity.writing = "written";
      }
    }
    // A later message with no write in flight leaves "written" once every write has settled.
    if (current.activity.writing === "writing" && !(message.parts as ToolLike[]).some((part) => {
      const name = toolName(part);
      return name !== null && WRITE_TOOLS.test(name) && part.state !== "output-available" && part.state !== "output-error";
    })) {
      current.activity.writing = "written";
    }
  });
  if (current && inRun && !busy) (current as { activity: PlanRunActivity }).activity.finished = true;
  close();
  return result;
}

/** Whether two activity maps say the same thing (so a caller can keep the old object). */
export function samePlanActivities(a: ReadonlyMap<string, PlanRunActivity>, b: ReadonlyMap<string, PlanRunActivity>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, x] of a) {
    const y = b.get(id);
    if (!y || x.started !== y.started || x.webSteps !== y.webSteps || x.writing !== y.writing || x.writes !== y.writes || x.finished !== y.finished) return false;
  }
  return true;
}

/** A step that is about writing up the result rather than finding things out. */
const WRITE_STEP = /\b(write|writes|draft|save|saves|compile|produce|format|deliver|document|summari[sz]e|publish|export|finali[sz]e)\b|작성|저장|정리|문서/i;

/** Pure: the index of the first writing step (the last step when none reads as writing). */
export function firstWritingStep(labels: readonly string[]): number {
  if (labels.length === 0) return 0;
  const index = labels.findIndex((label) => WRITE_STEP.test(label));
  return index >= 0 ? index : labels.length - 1;
}

/**
 * Pure: each step's state from the run's activity. Research steps (before the first writing step)
 * tick as web steps accumulate, about three per step, never all of them before writing starts;
 * once a file is being written every research step is done and each finished write ticks a writing
 * step; a finished run ticks everything. One step is "active" while the run is going.
 */
export function planStepStates(labels: readonly string[], activity: PlanRunActivity): PlanStepState[] {
  const total = labels.length;
  if (total === 0) return [];
  if (activity.finished) return labels.map(() => "done");
  if (!activity.started) return labels.map(() => "todo");
  const writeAt = firstWritingStep(labels);
  let done: number;
  if (activity.writing === "none") {
    // Research: one step per ~3 web steps, capped below the writing steps (and below the last
    // research step, which ticks when writing starts).
    done = Math.min(Math.max(0, writeAt - 1), Math.floor(activity.webSteps / 3));
  } else if (activity.writing === "writing") {
    // Writing: every research step is done; each finished write ticks one writing step.
    done = writeAt + activity.writes;
  } else {
    // A file is written and the run is still going (a last pass): only the last step remains.
    done = total - 1;
  }
  done = Math.min(total - 1, Math.max(0, done));
  return labels.map((_, index) => (index < done ? "done" : index === done ? "active" : "todo"));
}
