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
import { SCHEDULE_BOARD, SKILLS } from "./fixtures/schedules";
import type { DeskResult, MemoryNote, Schedule, ScheduleBoard } from "./types";
import { playbookFromCommand, playbookSlug, playbookTemplate } from "../playbooks/playbooks";
import { scheduleName } from "../scheduled/schedules";

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
  let playbooks = [...PLAYBOOKS];
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
      list: () => preview([...playbooks]),
      get: (id) => preview(playbooks.find((playbook) => playbook.id === id) ?? null),
      save: async (input) => {
        const saved = playbookFromCommand({
          name: input.id ?? playbookSlug(input.name, now()),
          description: input.description,
          template: playbookTemplate(input),
          scope: "workspace",
        });
        playbooks = [saved, ...playbooks.filter((playbook) => playbook.id !== saved.id)];
        return { data: saved, preview: true };
      },
      remove: async (id) => {
        playbooks = playbooks.filter((playbook) => playbook.id !== id);
        return { data: null, preview: true };
      },
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
          schedules: sampleBoard.schedules.map((schedule) => (schedule.id === run.scheduleId ? { ...schedule, lastRun } : schedule)),
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
        const id = `s${Math.max(0, ...sampleBoard.schedules.map((entry) => Number(entry.id.slice(1)) || 0)) + 1}`;
        const schedule: Schedule = { id, ...input, name: scheduleName(input.target), lastRun: null, enabled: true };
        sampleBoard = { ...sampleBoard, schedules: [...sampleBoard.schedules, schedule] };
        return preview(copyBoard(sampleBoard));
      },
      update: (scheduleId, patch) => {
        if (!sampleBoard.schedules.some((entry) => entry.id === scheduleId)) return Promise.reject(new Error(`No schedule ${scheduleId}`));
        sampleBoard = {
          ...sampleBoard,
          schedules: sampleBoard.schedules.map((schedule) => {
            if (schedule.id !== scheduleId) return schedule;
            const target = patch.target ?? schedule.target;
            return { ...schedule, ...patch, target, name: scheduleName(target) };
          }),
        };
        return preview(copyBoard(sampleBoard));
      },
      remove: (scheduleId) => {
        sampleBoard = {
          schedules: sampleBoard.schedules.filter((schedule) => schedule.id !== scheduleId),
          waiting: sampleBoard.waiting.filter((run) => run.scheduleId !== scheduleId),
        };
        return preview(copyBoard(sampleBoard));
      },
    },
    skills: { list: () => preview(SKILLS.map((skill) => ({ ...skill }))) },
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
