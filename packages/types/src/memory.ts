/**
 * Wire types for the local memory bank.
 *
 * These replace the Den-hosted `DenMemory` shapes. The field names are kept
 * identical so the settings view and the agent-facing prompt injection did not
 * have to be rewritten when storage moved from the control plane to the local
 * SQLite database.
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
   * Locally there is only one scope, so this is always `MEMORY_SCOPE_LOCAL`.
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

/**
 * The memory bank is deliberately global rather than per-workspace: the hosted
 * version was organization-scoped and followed the user across projects, and
 * workspace-scoping it during the move would have quietly changed the feature.
 */
export const MEMORY_SCOPE_LOCAL = "local";

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
