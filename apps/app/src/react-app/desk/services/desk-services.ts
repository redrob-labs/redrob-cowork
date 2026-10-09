import type {
  Chat,
  Connector,
  DeskFile,
  DeskSkill,
  LibrarySkill,
  DeskResult,
  HistoryEntry,
  MemoryNote,
  ModelCatalog,
  NewMemoryNote,
  NewSchedule,
  PrivacyLevel,
  PrivacyState,
  Project,
  ScheduleBoard,
  SkillDetail,
  SkillDraft,
  SkillFilters,
  SkillTaxonomy,
  TeamSkillsState,
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
  skills: {
    /** The installed skills: the workspace's, then the person's own folder's. */
    list(): Async<DeskSkill[]>;
    /** The Console's library, filtered; the copy that ships with the app when the Console cannot answer. */
    library(filters?: SkillFilters): Async<LibrarySkill[]>;
    taxonomy(): Async<SkillTaxonomy>;
    /** An installed skill, or else the library's. Null when neither has it. */
    get(name: string): Async<SkillDetail | null>;
    /** Adds a library skill to the workspace. */
    install(name: string): Async<null>;
    /** Creates a skill of the person's own, or changes one. */
    save(draft: SkillDraft): Async<DeskSkill>;
    /** Removes the person's own skill or an added library skill. Team skills are the Console's to remove. */
    remove(name: string): Async<null>;
    /** What the last check of the team's skills found; null where there is no server to ask. */
    teamState(): Async<TeamSkillsState | null>;
  };
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
