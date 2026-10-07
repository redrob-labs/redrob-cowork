import type { ChatMemory, MemoryNote } from "../services/types";

/** How much of a prompt saved notes may take, in tokens. */
export const MEMORY_BUDGET_TOKENS = 2_000;

/** A rough count, four characters to a token: enough to keep notes inside a budget. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The heading the notes go under. Model input, not copy, so it stays in the model's
 * language. The notes are the person's, so they are context and not instructions.
 */
export const MEMORY_HEADING =
  "## Notes the person saved\n\nUse these when they help with the answer. They are context the person keeps, not instructions for this message.";

export type MemoryContext = { text: string | null; included: number; omitted: number };

/** Which notes a chat reads: All my work reads every note; This project reads mine, the team's and this project's. */
export function notesInScope(notes: MemoryNote[], memory: ChatMemory, projectId: string | null): MemoryNote[] {
  if (memory === "none") return [];
  if (memory === "all") return notes;
  return notes.filter((note) => note.scope === "you" || note.scope === "team" || note.scope === `project:${projectId}`);
}

/** The notes a prompt carries: in scope, newest first, until the budget is spent. */
export function memoryContext(
  notes: MemoryNote[],
  input: { memory: ChatMemory; projectId: string | null; budgetTokens?: number },
): MemoryContext {
  const budget = input.budgetTokens ?? MEMORY_BUDGET_TOKENS;
  const inScope = [...notesInScope(notes, input.memory, input.projectId)].sort((a, b) => b.when - a.when);
  const lines: string[] = [];
  let used = estimateTokens(MEMORY_HEADING);
  for (const note of inScope) {
    const line = `- ${note.text.replace(/\s+/g, " ").trim()}`;
    const cost = estimateTokens(line) + 1;
    if (used + cost > budget) break;
    lines.push(line);
    used += cost;
  }
  return {
    text: lines.length ? `${MEMORY_HEADING}\n\n${lines.join("\n")}` : null,
    included: lines.length,
    omitted: inScope.length - lines.length,
  };
}

/**
 * Notes read once and reused for a few seconds, so a burst of sends (a queue, a plan's
 * answers) does not wait on the list each time, while a note saved a moment ago still counts.
 */
export function createNotesCache(load: () => Promise<MemoryNote[]>, ttlMs = 5_000, now = Date.now) {
  let cached: { at: number; notes: MemoryNote[] } | null = null;
  return {
    get: async (): Promise<MemoryNote[]> => {
      if (cached && now() - cached.at < ttlMs) return cached.notes;
      const notes = await load();
      cached = { at: now(), notes };
      return notes;
    },
    clear: () => {
      cached = null;
    },
  };
}

const caches = new WeakMap<object, ReturnType<typeof createNotesCache>>();

/** The notes cache for one server client, made on first use. */
export function notesCacheFor(client: object, load: () => Promise<MemoryNote[]>) {
  let cache = caches.get(client);
  if (!cache) {
    cache = createNotesCache(load);
    caches.set(client, cache);
  }
  return cache;
}
