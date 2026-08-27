import type { Memory } from "@redrob/types/memory";

/**
 * Memories the panel should show = the stored list minus any pending optimistic
 * deletes. Keeping the stored list untouched in the query cache and filtering
 * through this "veil" means a background refetch can never resurrect a row that
 * is mid-delete (it stays hidden until the delete confirms or is undone).
 */
export function visibleMemories(memories: Memory[], pendingDeleteIds: ReadonlySet<string>): Memory[] {
  return memories.filter((memory) => !pendingDeleteIds.has(memory.id));
}
