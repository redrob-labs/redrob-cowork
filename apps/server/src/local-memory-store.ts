import { randomUUID } from "node:crypto";
import type { Memory, MemoryContext, MemoryDraft } from "@redrob/types/memory";
import type { ServerConfig } from "./types.js";
import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";

/**
 * Kept here rather than in `@redrob/types` because the packaged desktop app runs
 * `server/dist` on plain Node: that package resolves its production export
 * condition to TypeScript source, so a *value* imported from it survives
 * compilation as a runtime import Node cannot load, and the app dies with
 * "Redrob Cowork server did not finish starting". The store is the only consumer,
 * so the constant belongs with it while the shared package keeps the types,
 * which are erased at emit.
 */
export const MEMORY_SCOPE_LOCAL = "local";

/**
 * The memory bank replaced an organization-scoped hosted store, so it is global
 * rather than per-workspace: a memory saved while working in one repository is
 * still available in the next. The underlying table is keyed by workspace id,
 * so a single reserved key holds the whole bank.
 */
const GLOBAL_MEMORY_KEY = "__global__";

/**
 * Newest first. The settings list renders in store order and callers expect the
 * most recent memory at the top.
 */
function sortNewestFirst(memories: Memory[]): Memory[] {
  return [...memories].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function readTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const tags = value.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
  return tags.length > 0 ? tags : null;
}

function readContexts(value: unknown): MemoryContext[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const snippet = typeof entry.snippet === "string" ? entry.snippet : "";
    if (!snippet.trim()) return [];
    return [{
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id : randomUUID(),
      snippet,
      citation: isRecord(entry.citation) ? entry.citation : null,
      origin: typeof entry.origin === "string" && entry.origin.trim() ? entry.origin : null,
      createdAt: typeof entry.createdAt === "string" && entry.createdAt.trim()
        ? entry.createdAt
        : new Date().toISOString(),
    }];
  });
}

/**
 * Rows are parsed defensively rather than trusted: the file is user-writable
 * and a hand-edited or partially written row must degrade to "this memory is
 * missing" instead of breaking the whole list.
 */
function readMemory(value: unknown): Memory | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const content = typeof value.content === "string" ? value.content : "";
  if (!id || !content.trim()) return null;

  const createdAt = typeof value.createdAt === "string" && value.createdAt.trim()
    ? value.createdAt
    : new Date(0).toISOString();

  return {
    id,
    content,
    tags: readTags(value.tags),
    source: typeof value.source === "string" && value.source.trim() ? value.source : "agent",
    scope: typeof value.scope === "string" && value.scope.trim() ? value.scope : MEMORY_SCOPE_LOCAL,
    createdAt,
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt : createdAt,
    contexts: readContexts(value.contexts),
  };
}

function parseMemories(json: string): Memory[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const memory = readMemory(entry);
      return memory ? [memory] : [];
    });
  } catch {
    return [];
  }
}

const memoryStore = createWorkspaceKvStore<Memory[]>({
  tableName: "local_memories",
  valueColumn: "memories_json",
  parse: parseMemories,
  serialize: (value) => JSON.stringify(value),
});

export async function listMemories(config: ServerConfig): Promise<Memory[]> {
  return sortNewestFirst(await memoryStore.get(config, GLOBAL_MEMORY_KEY) ?? []);
}

export async function saveMemory(config: ServerConfig, draft: MemoryDraft): Promise<Memory> {
  const content = draft.content.trim();
  if (!content) throw new Error("A memory needs content.");

  const now = new Date().toISOString();
  const memory: Memory = {
    id: randomUUID(),
    content,
    tags: readTags(draft.tags),
    source: draft.source?.trim() || "agent",
    scope: MEMORY_SCOPE_LOCAL,
    createdAt: now,
    updatedAt: now,
    contexts: readContexts(
      (draft.contexts ?? []).map((context) => ({ ...context, id: randomUUID(), createdAt: now })),
    ),
  };

  const existing = await memoryStore.get(config, GLOBAL_MEMORY_KEY) ?? [];
  await memoryStore.set(config, GLOBAL_MEMORY_KEY, [memory, ...existing]);
  return memory;
}

/** Returns false when no memory carried that id, so the route can answer 404. */
export async function deleteMemory(config: ServerConfig, id: string): Promise<boolean> {
  const existing = await memoryStore.get(config, GLOBAL_MEMORY_KEY) ?? [];
  const remaining = existing.filter((memory) => memory.id !== id);
  if (remaining.length === existing.length) return false;
  await memoryStore.set(config, GLOBAL_MEMORY_KEY, remaining);
  return true;
}

export const localMemoryStoreInternals = { GLOBAL_MEMORY_KEY, parseMemories, sortNewestFirst };
