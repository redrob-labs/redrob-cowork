/**
 * Domain types for Redrob Desk screens. Every time is epoch milliseconds; the
 * screens format it. Every service result says whether it is sample data.
 */
import type { RedrobScheduleRule, RedrobSkillTaxonomy, RedrobTeamSkillsState } from "../../../app/lib/redrob-server";

/** A service result. `preview` is true when the data comes from fixtures. */
export type DeskResult<T> = { data: T; preview: boolean };

export type ChatMode = "plan" | "run";
export type ChatMemory = "project" | "all" | "none";

export type Chat = {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: number;
  mode: ChatMode;
  memory: ChatMemory;
};

export type Project = {
  id: string;
  name: string;
  about: string | null;
  fileCount: number | null;
  chatCount: number | null;
  /** A short label for the last activity, e.g. "2h ago". */
  active: string | null;
  people: string[];
};

export type MemoryNoteScope = "you" | "team" | `project:${string}`;

export type MemoryNote = {
  id: string;
  scope: MemoryNoteScope;
  text: string;
  /** The chat the note came from. */
  chatId?: string;
  when: number;
  how: "told" | "learned";
  /** Set by an admin; cannot be edited or removed by the person. */
  locked?: boolean;
};

export type NewMemoryNote = { text: string; scope: MemoryNoteScope; chatId?: string };

export type RunState = "done" | "blocked" | "stopped";

/** What a schedule runs: a prompt as written, or a skill with optional extra instructions. */
export type ScheduleTarget = { kind: "prompt"; text: string } | { kind: "skill"; name: string; instructions?: string };

export type Schedule = {
  id: string;
  target: ScheduleTarget;
  /** The target in a few words: the skill's name, or the prompt's first line. */
  name: string;
  projectId: string;
  cadence: string;
  nextRunAt: number | null;
  /** Null until the schedule has run once. */
  lastRun: { state: RunState | "running" | "failed"; at: number; label: string } | null;
  enabled: boolean;
  /** What the server runs on, to start an edit from. Sample schedules have none. */
  rule?: RedrobScheduleRule;
};

/** A schedule to save. `rule` is what the server runs on; sample schedules have none. */
export type NewSchedule = Pick<Schedule, "target" | "projectId" | "cadence" | "nextRunAt"> & { rule?: RedrobScheduleRule };

/** A scheduled run stopped at a step that asks a person first. */
export type WaitingRun = {
  id: string;
  scheduleId: string;
  target: ScheduleTarget;
  name: string;
  projectId: string;
  title: string;
  description: string;
  detail: string;
  askedAt: number;
};

export type ScheduleBoard = { schedules: Schedule[]; waiting: WaitingRun[] };

/** Where a skill came from: the Console's library, the person's team in the Console, or the person. */
export type SkillOrigin = "library" | "team" | "mine";

/** What a skill is filed under, as taxonomy ids. Every one is optional. */
export type SkillTags = { profession?: string; task?: string; language?: string };

/** An installed skill: what the assistant can use, and what a schedule can run. */
export type DeskSkill = {
  name: string;
  description: string;
  origin: SkillOrigin;
  tags: SkillTags;
  /** `global` is the person's own folder, outside the project: shown, never changed here. */
  scope: "project" | "global";
};

/** A skill in the Console's library, installed or not. */
export type LibrarySkill = { name: string; description: string; tags: SkillTags };

/** The Skills screen's filters. Empty means all. */
export type SkillFilters = SkillTags & { q?: string };

/** The professions, their tasks and the languages skills are filed under, in English and Korean. */
export type SkillTaxonomy = Omit<RedrobSkillTaxonomy, "source">;

/** One skill to read: installed (with its origin), or one the library has and this workspace has not. */
export type SkillDetail = {
  name: string;
  description: string;
  tags: SkillTags;
  /** The instructions, in markdown. */
  body: string;
  /** Null for a library skill that is not installed. */
  installed: Pick<DeskSkill, "origin" | "scope"> | null;
};

/** What the skill dialog saves: a new skill of the person's own, or a change to one. */
export type SkillDraft = SkillTags & {
  name: string;
  description: string;
  instructions: string;
  /** True when changing an existing skill, whose name then stays as it is. */
  editing: boolean;
};

export type TeamSkillsState = RedrobTeamSkillsState;

export type HistoryStep = { label: string; state: "done" | "active" | "todo"; meta?: string };

export type HistoryEntry = {
  id: string;
  at: number;
  kind: "run" | "chat" | "approval" | "change";
  what: string;
  projectId: string;
  state: RunState;
  label: string;
  approvedBy: string | null;
  took: string | null;
  sentOutside: boolean;
  filesChanged: number;
  steps?: HistoryStep[];
};

/** `blocked`: the team policy does not allow it, so it cannot be turned on here. */
export type ConnectorState = "connected" | "needs-sign-in" | "off" | "failed" | "blocked";

/** The configured server behind a real connector. Never shown. */
export type ConnectorServer = {
  name: string;
  /** Signed in through Redrob rather than by the engine. */
  managed: boolean;
  type: "remote" | "local";
  url?: string;
};

export type Connector = {
  id: string;
  name: string;
  maker: string;
  category: string;
  icon: string;
  does: string;
  state: ConnectorState;
  /** Added by hand (a URL or a command): one of the tools your team built. */
  custom?: boolean;
  server?: ConnectorServer;
};

export type PrivacyLevel = "off" | "standard" | "high" | "strict";

export type PrivacyState = {
  level: PrivacyLevel;
  /** Names Strict swaps for placeholders: people, clients, projects. */
  names: string[];
  /** Who set the level, when it came with a team file; null when the person set it. */
  setBy: string | null;
  /** Set by a team file: the level and names cannot be changed here. */
  locked: boolean;
  /** Private details swapped for placeholders on this computer this week. */
  detailsKeptThisWeek: number;
};

export type ModelEffort = { label: string; level: number; of: number };
export type ModelEffortOption = ModelEffort & { monthly: number; place?: number };

export type ModelPick = {
  id: string;
  model: string;
  short: string;
  harness: string;
  effort: ModelEffort;
  why: string;
  /** US dollars a month at the task's usage. */
  monthly: number;
  efforts: ModelEffortOption[];
};

export type ModelTask = { id: string; label: string; title: string; usage: string; picks: ModelPick[] };

export type ModelProfession = { id: string; label: string; disabled: boolean; tasks: ModelTask[] };

export type ModelCatalog = {
  professions: ModelProfession[];
  source: { name: string; edition: string; note: string };
  /** The harness name that means "runs in Desk". */
  here: string;
};

export type DeskFileKind = "notice" | "note" | "plan" | "sheet" | "list" | "file";

export type DeskFile = {
  id: string;
  name: string;
  icon: string;
  projectName: string;
  when: number;
  /** Title of the chat that wrote the file. */
  fromChat: string | null;
  /** That chat's id, for a link back to it. */
  chatId?: string;
  kind: DeskFileKind;
  /** Workspace-relative, to read and open the file. Never shown. */
  path?: string;
  /** Sample text a fixture shows as its preview, in markdown. */
  body?: string;
};
