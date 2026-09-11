/**
 * Wire types for the local memory bank.
 *
 * These replace the Den-hosted `DenMemory` shapes. The field names are kept
 * identical so the settings view and the agent-facing prompt injection did not
 * have to be rewritten when storage moved from the control plane to the local
 * SQLite database.
 *
 * This module's *values* are for bundler consumers only. This package resolves
 * its production export condition to TypeScript source, which every bundler
 * compiles happily -- but the packaged desktop app runs `server/dist` on plain
 * Node, where a value the server imports from here survives compilation as a
 * runtime import Node cannot load. `MEMORY_SCOPE_LOCAL` therefore lives with
 * its only consumer, `apps/server/src/local-memory-store.ts`; keep the server's
 * use of this module type-only.
 */

/** Provenance for a memory: the conversation snippet it was distilled from. */
export type MemoryContext = {
  id: string;
  snippet: string;
  citation: Record<string, unknown> | null;
  origin: string | null;
  createdAt: string;
};

export type Memory = {
  id: string;
  content: string;
  tags: string[] | null;
  /** How the memory was created, e.g. "agent" or "user". */
  source: string;
  /**
   * Retained from the hosted schema so stored rows round-trip unchanged.
   * Locally there is only one scope, so this is always the server's
   * `MEMORY_SCOPE_LOCAL`.
   */
  scope: string;
  createdAt: string;
  updatedAt: string;
  contexts: MemoryContext[];
};

/** Fields a caller may supply when saving; the store assigns the rest. */
export type MemoryDraft = {
  content: string;
  tags?: string[] | null;
  source?: string;
  contexts?: Array<Omit<MemoryContext, "id" | "createdAt">>;
};

export function isMemoryContext(value: unknown): value is MemoryContext {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.snippet === "string";
}

export function isMemory(value: unknown): value is Memory {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.content === "string" &&
    typeof record.createdAt === "string"
  );
}
