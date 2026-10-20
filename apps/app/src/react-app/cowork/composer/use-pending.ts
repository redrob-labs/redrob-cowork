import { useState } from "react";

/**
 * Keys with work in flight (a skill installing, a connector switching), so a second press on the
 * same row is ignored and the row can show it is busy. Shared by the composer's skill picks and its
 * Connectors flyout, which had each grown the same add-then-delete Set dance.
 */
export function usePending() {
  // The in-flight keys; a fresh Set on every change so React sees a new value.
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  // Marks `key` busy (true) or idle (false), copying the Set rather than mutating it.
  const mark = (key: string, busy: boolean) =>
    setPending((current) => {
      // Copy first: the previous Set may still be read by the render in progress.
      const next = new Set(current);
      // Add or drop the key in the copy.
      if (busy) next.add(key);
      else next.delete(key);
      // Hand React the new Set.
      return next;
    });
  return {
    // Whether `key` has work in flight.
    has: (key: string) => pending.has(key),
    /** Runs `work` for `key` unless it is already running; the key is idle again once it settles. */
    run: (key: string, work: () => Promise<unknown>) => {
      // A second press while the first is in flight does nothing.
      if (pending.has(key)) return;
      // Show the row as busy before the work starts.
      mark(key, true);
      // Idle again on success or failure; the work reports its own errors.
      void work().finally(() => mark(key, false));
    },
  };
}
