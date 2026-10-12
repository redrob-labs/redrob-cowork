import type { DeskServices } from "./desk-services";
import { MODEL_CATALOG } from "./fixtures/catalog";
import { CHATS } from "./fixtures/chats";
import { CONNECTORS } from "./fixtures/connectors";
import { FILES } from "./fixtures/files";
import { HISTORY } from "./fixtures/history";
import { NOTES } from "./fixtures/notes";
import { PRIVACY } from "./fixtures/privacy";
import { PROJECTS } from "./fixtures/projects";
import { SCHEDULE_BOARD } from "./fixtures/schedules";
import { LIBRARY, SKILL_BODIES, SKILLS, TAXONOMY } from "./fixtures/skills";
import type { DeskResult, DeskSkill, MemoryNote, Schedule, ScheduleBoard } from "./types";
import { matchesFilters } from "../skills/skills";
import { scheduleName } from "../scheduled/schedules";

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

const copySkills = (list: readonly DeskSkill[]) => list.map((skill) => ({ ...skill, tags: { ...skill.tags } }));

// Shared like the board: the Skills screen, a skill's page and the skill dialog each make their own
// services and must read the same sample skills.
let sampleSkills = copySkills(SKILLS);
let sampleBodies: Record<string, string> = { ...SKILL_BODIES };

/** Puts the shared sample skills back as they started. For tests and stories. */
export function resetSampleSkills() {
  sampleSkills = copySkills(SKILLS);
  sampleBodies = { ...SKILL_BODIES };
}

/** Sample data behind the service interface. Every result carries `preview: true`. */
export function createFixtureDeskServices(options: { now?: () => number } = {}): DeskServices {
  const { now = Date.now } = options;
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
    skills: {
      list: () => preview(copySkills(sampleSkills)),
      library: (filters = {}) => preview(LIBRARY.filter((skill) => matchesFilters(skill, filters))),
      taxonomy: () => preview(TAXONOMY),
      get: (name) => {
        const installed = sampleSkills.find((skill) => skill.name === name);
        const known = installed ?? LIBRARY.find((skill) => skill.name === name);
        if (!known) return preview(null);
        return preview({
          name,
          description: known.description,
          tags: { ...known.tags },
          body: sampleBodies[name] ?? "",
          installed: installed ? { origin: installed.origin, scope: installed.scope } : null,
        });
      },
      install: async (name) => {
        const skill = LIBRARY.find((entry) => entry.name === name);
        if (!skill) throw new Error(`No library skill ${name}`);
        if (sampleSkills.some((entry) => entry.name === name)) throw new Error(`A skill named ${name} is already installed`);
        sampleSkills = [...sampleSkills, { ...skill, origin: "library", scope: "project" }];
        return { data: null, preview: true };
      },
      save: async (draft) => {
        const existing = sampleSkills.find((entry) => entry.name === draft.name);
        if (draft.editing ? existing?.origin !== "mine" : existing) throw new Error(`Cannot save ${draft.name}`);
        const { profession, task, language } = draft;
        const saved: DeskSkill = {
          name: draft.name,
          description: draft.description.trim(),
          origin: "mine",
          tags: { ...(profession ? { profession } : {}), ...(task ? { task } : {}), ...(language ? { language } : {}) },
          scope: "project",
        };
        sampleSkills = [...sampleSkills.filter((entry) => entry.name !== saved.name), saved];
        sampleBodies[saved.name] = draft.instructions.trim();
        return { data: saved, preview: true };
      },
      remove: async (name) => {
        if (sampleSkills.find((entry) => entry.name === name)?.origin === "team") throw new Error(`${name} is managed in Redrob Console`);
        sampleSkills = sampleSkills.filter((entry) => entry.name !== name);
        return { data: null, preview: true };
      },
      teamState: () => preview(null),
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
  };
}
