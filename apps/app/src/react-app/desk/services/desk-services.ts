import type {
  Chat,
  Connector,
  DeskFile,
  DeskSkill,
  DeskResult,
  HistoryEntry,
  MemoryNote,
  ModelCatalog,
  NewMemoryNote,
  NewSchedule,
  Playbook,
  PlaybookDraft,
  PrivacyLevel,
  PrivacyState,
  Project,
  ScheduleBoard,
} from "./types";

type Async<T> = Promise<DeskResult<T>>;

/** Everything the Desk screens read or change, one group per area. */
export interface DeskServices {
  chats: {
    /** Newest first. Without a project, the default scope of the implementation. */
    list(options?: { projectId?: string }): Async<Chat[]>;
    get(id: string): Async<Chat | null>;
  };
  projects: { list(): Async<Project[]> };
  notes: {
    list(): Async<MemoryNote[]>;
    add(note: NewMemoryNote): Async<MemoryNote>;
    remove(id: string): Async<null>;
    edit(id: string, text: string): Async<MemoryNote>;
  };
  playbooks: {
    list(): Async<Playbook[]>;
    get(id: string): Async<Playbook | null>;
    /** Creates a playbook, or replaces the one with this id. */
    save(input: PlaybookDraft): Async<Playbook>;
    remove(id: string): Async<null>;
  };
  schedules: {
    list(): Async<ScheduleBoard>;
    /** Answers a run waiting for a person; it leaves the waiting list either way. */
    answer(waitingId: string, approved: boolean): Async<ScheduleBoard>;
    setEnabled(scheduleId: string, enabled: boolean): Async<ScheduleBoard>;
    /** Puts a prompt or a skill on a new schedule. A target can have more than one. */
    save(schedule: NewSchedule): Async<ScheduleBoard>;
    /** Changes what a schedule runs, its name or when it runs. */
    update(scheduleId: string, patch: Partial<NewSchedule>): Async<ScheduleBoard>;
    remove(scheduleId: string): Async<ScheduleBoard>;
  };
  /** The installed skills, the workspace's and the person's own. */
  skills: { list(): Async<DeskSkill[]> };
  history: { list(): Async<HistoryEntry[]> };
  connectors: { list(): Async<Connector[]> };
  privacy: {
    get(): Async<PrivacyState>;
    setLevel(level: PrivacyLevel): Async<PrivacyState>;
    setNames(names: string[]): Async<PrivacyState>;
  };
  catalog: { get(): Async<ModelCatalog> };
  files: { list(options?: { projectId?: string }): Async<DeskFile[]> };
}

/** The prototype's rule: a chat in a project plans first and reads that project's memory. */
export function chatDefaults(projectId: string | null): Pick<Chat, "mode" | "memory"> {
  return projectId ? { mode: "plan", memory: "project" } : { mode: "run", memory: "all" };
}
