import type { QueryClient } from "@tanstack/react-query";

import { t } from "../../../i18n";
import type { DeskServices } from "../services/desk-services";
import type { MemoryNote, MemoryNoteScope, Project } from "../services/types";
import type { ToastAction, ToastTone } from "../store/frame-store";

export const MEMORY_QUERY_KEY = "desk-memory";

/** What the Memory screen lists: every note, or the notes of one scope. */
export type MemoryFilter = "all" | MemoryNoteScope;

/** The notes query, per workspace ("preview" for sample data). */
export function memoryNotesKey(scope: string) {
  return [MEMORY_QUERY_KEY, scope, "notes"];
}

/** After a note is added, changed or forgotten: the screen's list and the menu's count. */
export async function invalidateNotes(queryClient: Pick<QueryClient, "invalidateQueries">, scope: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: memoryNotesKey(scope) }),
    queryClient.invalidateQueries({ queryKey: ["desk-nav", scope, "notes"] }),
  ]);
}

/** `/memory` is everything; `/memory/you`, `/memory/team`, `/memory/<project id>` one scope. */
export function memoryFilterFromParam(param: string | undefined): MemoryFilter {
  const value = param?.trim();
  if (!value) return "all";
  if (value === "you" || value === "team") return value;
  return `project:${value}`;
}

export function memoryFilterPath(filter: MemoryFilter): string {
  if (filter === "all") return "/memory";
  if (filter === "you" || filter === "team") return `/memory/${filter}`;
  return `/memory/${encodeURIComponent(filter.slice("project:".length))}`;
}

export function notesInFilter(notes: readonly MemoryNote[], filter: MemoryFilter): MemoryNote[] {
  return filter === "all" ? [...notes] : notes.filter((note) => note.scope === filter);
}

function projectName(scope: `project:${string}`, projects: readonly Project[]): string {
  const id = scope.slice("project:".length);
  return projects.find((project) => project.id === id)?.name ?? t("desk.memory_other_project");
}

export function scopeLabel(scope: MemoryNoteScope, projects: readonly Project[]): string {
  if (scope === "you") return t("desk.memory_about_you");
  if (scope === "team") return t("desk.memory_team");
  return projectName(scope, projects);
}

export type MemoryScopeLink = { id: MemoryFilter; label: string; count: number; href: string };

/** The project scopes that have notes: in the order of the project list, then any it does not know. */
function projectScopes(notes: readonly MemoryNote[], projects: readonly Project[]): Array<`project:${string}`> {
  const withNotes = new Set<`project:${string}`>();
  for (const note of notes) if (note.scope !== "you" && note.scope !== "team") withNotes.add(note.scope);
  const toScope = (id: string): `project:${string}` => `project:${id}`;
  const known = projects.map((project) => toScope(project.id)).filter((scope) => withNotes.has(scope));
  return [...known, ...[...withNotes].filter((scope) => !known.includes(scope))];
}

/** The scope picker: All my work, About you, each project with notes, Your team; each with its count. */
export function memoryScopes(notes: readonly MemoryNote[], projects: readonly Project[]): MemoryScopeLink[] {
  const scopes: MemoryFilter[] = ["all", "you", ...projectScopes(notes, projects), "team"];
  return scopes.map((id) => ({
    id,
    label: id === "all" ? t("desk.memory_all") : scopeLabel(id, projects),
    count: notesInFilter(notes, id).length,
    href: memoryFilterPath(id),
  }));
}

export type MemorySection = { scope: MemoryNoteScope; title: string; lede: string; notes: MemoryNote[] };

function scopeLede(scope: MemoryNoteScope, projects: readonly Project[]): string {
  if (scope === "you") return t("desk.memory_you_lede");
  if (scope === "team") return t("desk.memory_team_lede");
  return t("desk.memory_project_lede", { name: projectName(scope, projects) });
}

/** The notes on screen, one section per scope that has any. */
export function memorySections(
  notes: readonly MemoryNote[],
  filter: MemoryFilter,
  projects: readonly Project[],
): MemorySection[] {
  const scopes = filter === "all" ? memoryScopes(notes, projects).map((scope) => scope.id) : [filter];
  return scopes.flatMap((scope) => {
    if (scope === "all") return [];
    const inScope = notesInFilter(notes, scope).sort((a, b) => b.when - a.when);
    return inScope.length
      ? [{ scope, title: scopeLabel(scope, projects), lede: scopeLede(scope, projects), notes: inScope }]
      : [];
  });
}

export function formatNoteDate(when: number, locale: string): string | null {
  if (!Number.isFinite(when)) return null;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(when));
}

/** Where a note came from, in a sentence: told or learned, in which chat if known, and when. */
export function noteSource(note: MemoryNote, chatTitle: string | null, locale: string): string {
  const when = formatNoteDate(note.when, locale);
  const chat = chatTitle ?? "";
  if (note.how === "told") {
    if (chat && when) return t("desk.memory_told_in_when", { chat, when });
    if (chat) return t("desk.memory_told_in", { chat });
    return when ? t("desk.memory_told_when", { when }) : t("desk.memory_told");
  }
  if (chat && when) return t("desk.memory_learned_in_when", { chat, when });
  if (chat) return t("desk.memory_learned_in", { chat });
  return when ? t("desk.memory_learned_when", { when }) : t("desk.memory_learned");
}

export function memoryMeta(count: number): string {
  return t("desk.memory_meta", { count });
}

/** Save is offered once the text is new and not empty, and never on a locked note. */
export function canSaveEdit(note: MemoryNote, text: string): boolean {
  const next = text.trim();
  return !note.locked && next.length > 0 && next !== note.text;
}

export type MemoryActionDeps = {
  notes: Pick<DeskServices["notes"], "add" | "remove" | "edit">;
  /** Refetch the notes and the menu's count. */
  invalidate: () => Promise<void> | void;
  showToast: (title: string, text?: string, tone?: ToastTone, action?: ToastAction) => void;
};

function failed(deps: MemoryActionDeps) {
  deps.showToast(t("desk.memory_failed"), t("desk.settings_try_again"), "danger");
}

/** Changes a note's text. With no update call, the service saves the new note and drops the old. */
export async function saveNoteEdit(deps: MemoryActionDeps, note: MemoryNote, text: string): Promise<boolean> {
  if (!canSaveEdit(note, text)) return false;
  try {
    await deps.notes.edit(note.id, text.trim());
  } catch {
    failed(deps);
    return false;
  }
  await deps.invalidate();
  deps.showToast(t("desk.memory_saved"));
  return true;
}

/** Saves a forgotten note back, in its scope and with its chat. */
export async function undoForget(deps: MemoryActionDeps, note: MemoryNote): Promise<boolean> {
  try {
    await deps.notes.add({ text: note.text, scope: note.scope, ...(note.chatId ? { chatId: note.chatId } : {}) });
  } catch {
    failed(deps);
    return false;
  }
  await deps.invalidate();
  return true;
}

/** Forgets a note, with Undo in the toast. A note your admin set cannot be forgotten here. */
export async function forgetNote(deps: MemoryActionDeps, note: MemoryNote): Promise<boolean> {
  if (note.locked) return false;
  try {
    await deps.notes.remove(note.id);
  } catch {
    failed(deps);
    return false;
  }
  await deps.invalidate();
  deps.showToast(t("desk.memory_forgot"), note.text, undefined, {
    label: t("desk.memory_undo"),
    run: () => void undoForget(deps, note),
  });
  return true;
}
