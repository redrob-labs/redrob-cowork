/**
 * The service contract every Cowork screen reads and writes through: `CoworkServices`,
 * grouped one area per screen, plus the small rules the screens share. Two
 * implementations satisfy it — real redrob-server calls and sample fixtures — so a
 * screen never knows which it has.
 */
import type {
  Chat,
  Connector,
  CoworkFile,
  CoworkSkill,
  LibrarySkill,
  CoworkResult,
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

/** Shorthand for a service call: a promise of a `CoworkResult` carrying the preview flag. */
type Async<T> = Promise<CoworkResult<T>>;

/** Everything the Cowork screens read or change, one group per area. */
export interface CoworkServices {
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
    list(): Async<CoworkSkill[]>;
    /** The Console's library, filtered; the copy that ships with the app when the Console cannot answer. */
    library(filters?: SkillFilters): Async<LibrarySkill[]>;
    taxonomy(): Async<SkillTaxonomy>;
    /** An installed skill, or else the library's. Null when neither has it. */
    get(name: string): Async<SkillDetail | null>;
    /** Adds a library skill to the workspace. */
    install(name: string): Async<null>;
    /** Creates a skill of the person's own, or changes one. */
    save(draft: SkillDraft): Async<CoworkSkill>;
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
  files: { list(options?: { projectId?: string }): Async<CoworkFile[]> };
}

/** The prototype's rule: a chat in a project plans first and reads that project's memory. */
export function chatDefaults(projectId: string | null): Pick<Chat, "mode" | "memory"> {
  return projectId ? { mode: "plan", memory: "project" } : { mode: "run", memory: "all" };
}
