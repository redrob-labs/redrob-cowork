import type { ChatMemory } from "../services/types";

/**
 * Sent as the prompt's system text when a chat's memory is off. Model input, not copy, so it
 * stays in the model's language.
 */
export const MEMORY_OFF_INSTRUCTION =
  "Memory is off for this chat. Do not read or save memory for this chat. Do not search, list, read or save memories, and do not use any memory capability.";

/**
 * The system text a prompt goes with: what was there already, then the saved notes the
 * chat reads, or the memory rule when memory is off.
 */
export function deskSystemText(memory: ChatMemory | null, system: string | undefined, notes: string | null = null): string | undefined {
  const added = memory === "none" ? MEMORY_OFF_INSTRUCTION : notes;
  if (!added) return system;
  return system ? `${system}\n\n${added}` : added;
}
