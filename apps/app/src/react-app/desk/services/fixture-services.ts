import { systemTimers, type DeskTimers } from "../timers";
import type { DeskServices } from "./desk-services";
import { MODEL_CATALOG } from "./fixtures/catalog";
import { CHATS } from "./fixtures/chats";
import { CONNECTORS } from "./fixtures/connectors";
import { FILES } from "./fixtures/files";
import { HISTORY } from "./fixtures/history";
import { NOTES } from "./fixtures/notes";
import { PLAYBOOKS } from "./fixtures/playbooks";
import { PRIVACY } from "./fixtures/privacy";
import { PROJECTS } from "./fixtures/projects";
import { SCHEDULE_BOARD } from "./fixtures/schedules";
import type { DeskResult, MemoryNote, Schedule, ScheduleBoard } from "./types";

/** The prototype's pace: one step every 650ms. */
export const SCRIPTED_STEP_MS = 650;

export type ScriptedHandlers<T> = {
  onStep: (step: T, index: number) => void;
  onAnswer?: () => void;
};

/**
 * Plays steps the way the prototype does: step i lands at `stepMs * (i + 1)`,
 * the answer at `stepMs * (steps.length + 1)`. Returns a cancel function.
 */
export function runScripted<T>(
  steps: readonly T[],
  handlers: ScriptedHandlers<T>,
  options: { stepMs?: number; timers?: DeskTimers } = {},
): () => void {
  const stepMs = options.stepMs ?? SCRIPTED_STEP_MS;
  const timers = options.timers ?? systemTimers;
  const handles = steps.map((step, index) => timers.setTimeout(() => handlers.onStep(step, index), stepMs * (index + 1)));
  const { onAnswer } = handlers;
  if (onAnswer) handles.push(timers.setTimeout(onAnswer, stepMs * (steps.length + 1)));
  return () => handles.forEach((handle) => timers.clearTimeout(handle));
}

export type FixtureDeskServices = DeskServices & {
  runScripted<T>(steps: readonly T[], handlers: ScriptedHandlers<T>): () => void;
};

const preview = <T>(data: T): Promise<DeskResult<T>> => Promise.resolve({ data, preview: true });

const copyBoard = (board: ScheduleBoard): ScheduleBoard => ({
  schedules: board.schedules.map((schedule) => ({ ...schedule })),
  waiting: [...board.waiting],
});

// One board for every instance, unlike the notes: the menu's count of runs waiting and the
// Scheduled screen each make their own services and must read the same runs.
let sampleBoard = copyBoard(SCHEDULE_BOARD);

/** Puts the shared sample schedules back as they started. For tests and stories. */
export function resetSampleBoard() {
  sampleBoard = copyBoard(SCHEDULE_BOARD);
}

/** Sample data behind the service interface. Every result carries `preview: true`. */
export function createFixtureDeskServices(
  options: { stepMs?: number; timers?: DeskTimers; now?: () => number } = {},
): FixtureDeskServices {
  const { stepMs = SCRIPTED_STEP_MS, timers = systemTimers, now = Date.now } = options;
  // Per instance, so one screen's edits never leak into another test or story.
  let notes: MemoryNote[] = NOTES.map((note) => ({ ...note }));
  let privacy = { ...PRIVACY };
  let nextNote = notes.length + 1;

  const editable = (id: string) => {
    const note = notes.find((entry) => entry.id === id);
    if (!note) throw new Error(`No memory note ${id}`);
    if (note.locked) throw new Error(`Memory note ${id} is set by an admin`);
    return note;
  };

  return {
    chats: {
      list: (query) =>
        preview(
          CHATS.filter((chat) => !query?.projectId || chat.projectId === query.projectId).sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        ),
      get: (id) => preview(CHATS.find((chat) => chat.id === id) ?? null),
    },
    projects: { list: () => preview([...PROJECTS]) },
    notes: {
      list: () => preview([...notes]),
      add: async (input) => {
        const note: MemoryNote = { id: `n${nextNote++}`, ...input, when: now(), how: "told" };
        notes = [note, ...notes];
        return { data: note, preview: true };
      },
      remove: async (id) => {
        editable(id);
        notes = notes.filter((note) => note.id !== id);
        return { data: null, preview: true };
      },
      edit: async (id, text) => {
        const note = { ...editable(id), text };
        notes = notes.map((entry) => (entry.id === id ? note : entry));
        return { data: note, preview: true };
      },
    },
    playbooks: {
      list: () => preview([...PLAYBOOKS]),
      get: (id) => preview(PLAYBOOKS.find((playbook) => playbook.id === id) ?? null),
    },
    schedules: {
      list: () => preview(copyBoard(sampleBoard)),
      answer: (waitingId, approved) => {
        const run = sampleBoard.waiting.find((entry) => entry.id === waitingId);
        if (!run) return Promise.reject(new Error(`No waiting run ${waitingId}`));
        const lastRun: Schedule["lastRun"] = approved
          ? { state: "done", at: now(), label: "Answered" }
          : { state: "stopped", at: now(), label: "Not now" };
        sampleBoard = {
          waiting: sampleBoard.waiting.filter((entry) => entry.id !== waitingId),
          schedules: sampleBoard.schedules.map((schedule) =>
            schedule.playbookId === run.playbookId && schedule.projectId === run.projectId ? { ...schedule, lastRun } : schedule,
          ),
        };
        return preview(copyBoard(sampleBoard));
      },
      setEnabled: (scheduleId, enabled) => {
        sampleBoard = {
          ...sampleBoard,
          schedules: sampleBoard.schedules.map((schedule) => (schedule.id === scheduleId ? { ...schedule, enabled } : schedule)),
        };
        return preview(copyBoard(sampleBoard));
      },
      save: (input) => {
        const same = (schedule: Schedule) => schedule.playbookId === input.playbookId && schedule.projectId === input.projectId;
        const existing = sampleBoard.schedules.find(same);
        const schedule: Schedule = existing
          ? { ...existing, ...input, enabled: true }
          : { id: `s${sampleBoard.schedules.length + 1}`, ...input, lastRun: null, enabled: true };
        sampleBoard = {
          ...sampleBoard,
          schedules: existing
            ? sampleBoard.schedules.map((entry) => (same(entry) ? schedule : entry))
            : [...sampleBoard.schedules, schedule],
        };
        return preview(copyBoard(sampleBoard));
      },
    },
    history: { list: () => preview([...HISTORY]) },
    connectors: { list: () => preview([...CONNECTORS]) },
    privacy: {
      get: () => preview({ ...privacy }),
      setLevel: (level) => {
        privacy = { ...privacy, level };
        return preview({ ...privacy });
      },
      setNames: (names) => {
        privacy = { ...privacy, names: [...names] };
        return preview({ ...privacy });
      },
    },
    catalog: { get: () => preview(MODEL_CATALOG) },
    files: {
      list: (query) => {
        const project = PROJECTS.find((entry) => entry.id === query?.projectId);
        return preview(FILES.filter((file) => !query?.projectId || file.projectName === project?.name));
      },
    },
    runScripted: (steps, handlers) => runScripted(steps, handlers, { stepMs, timers }),
  };
}
