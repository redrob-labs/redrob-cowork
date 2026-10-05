/**
 * Domain types for Redrob Desk screens. Every time is epoch milliseconds; the
 * screens format it. Every service result says whether it is sample data.
 */

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
  playbookIds: string[];
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

export type PlaybookStep = {
  label: string;
  detail?: string;
  /** Set when the step stops for a person; the label says who approves what. */
  approval?: string;
};

export type Playbook = {
  id: string;
  name: string;
  icon: string;
  profession: string;
  highStakes: boolean;
  purpose: string;
  summary: string;
  gets: string;
  needs: string;
  impact: { figure: string; label: string };
  stake: string;
  sources: Array<{ label: string; url: string }>;
  steps: PlaybookStep[];
  owner: string;
  runCount: number;
  lastRunAt: number;
  team: boolean;
  cadence: string;
};

export type RunState = "done" | "blocked" | "stopped";

export type Schedule = {
  id: string;
  playbookId: string;
  projectId: string;
  cadence: string;
  nextRunAt: number | null;
  /** Null until the schedule has run once. */
  lastRun: { state: RunState; at: number; label: string } | null;
  enabled: boolean;
};

export type NewSchedule = Pick<Schedule, "playbookId" | "projectId" | "cadence" | "nextRunAt">;

/** A scheduled run stopped at a step that asks a person first. */
export type WaitingRun = {
  id: string;
  playbookId: string;
  projectId: string;
  title: string;
  description: string;
  detail: string;
  askedAt: number;
};

export type ScheduleBoard = { schedules: Schedule[]; waiting: WaitingRun[] };

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

export type ConnectorState = "connected" | "needs-sign-in" | "off" | "failed";

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
