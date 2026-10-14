/**
 * Back/Forward reachability for a HASH router.
 *
 * The window title bar's Back and Forward buttons need to know whether there is
 * anywhere to go. A browser router keeps the entry index in `history.state.idx`,
 * but this app runs on a HASH router (`#/workspace/...`), where `idx` never
 * advances past 0 — so the old "read history.state.idx" logic left both buttons
 * permanently disabled.
 *
 * Instead we keep our OWN ordered stack of the location keys we have visited and
 * a pointer into it, updated from React Router's navigation type + the current
 * location key. This is pure and deterministic so it can be unit-tested without a
 * browser:
 *   - PUSH: a new entry. Discard anything after the pointer (a new navigation
 *     drops the forward entries, as browsers do), append the key, point at it.
 *   - POP: Back or Forward within the existing stack. Find the key and move the
 *     pointer to it; if it is somehow unknown, treat it as a fresh PUSH.
 *   - REPLACE: the current entry is swapped in place — overwrite the key at the
 *     pointer, stack length unchanged.
 */
export type HistoryReachState = {
  /** Ordered location keys this session has visited, oldest first. */
  readonly keys: readonly string[];
  /** Index into `keys` of the entry currently shown. */
  readonly pointer: number;
};

export type ReactRouterNavigationType = "POP" | "PUSH" | "REPLACE";

/** The empty history before any location has been seen. */
export const initialHistoryReach: HistoryReachState = { keys: [], pointer: -1 };

/** Fold one navigation into the reach state. Pure: same inputs, same output. */
export function reduceHistoryReach(
  state: HistoryReachState,
  navigationType: ReactRouterNavigationType,
  key: string,
): HistoryReachState {
  // The very first location is a PUSH of the initial entry regardless of the
  // reported type (a reload reports POP, but there is nothing to pop to yet).
  if (state.pointer < 0) return { keys: [key], pointer: 0 };

  if (navigationType === "REPLACE") {
    const keys = state.keys.slice();
    keys[state.pointer] = key;
    return { keys, pointer: state.pointer };
  }

  if (navigationType === "PUSH") {
    // Drop the forward entries, append, and point at the new tail.
    const keys = state.keys.slice(0, state.pointer + 1);
    keys.push(key);
    return { keys, pointer: keys.length - 1 };
  }

  // POP: a Back or Forward move within the stack. Locate the key.
  const found = state.keys.indexOf(key);
  if (found >= 0) return { keys: state.keys, pointer: found };
  // An unknown key on POP (e.g. a native history entry we never recorded):
  // treat it as a new entry appended after the current pointer.
  const keys = state.keys.slice(0, state.pointer + 1);
  keys.push(key);
  return { keys, pointer: keys.length - 1 };
}

/** Whether Back has anywhere to go. */
export function canGoBack(state: HistoryReachState): boolean {
  return state.pointer > 0;
}

/** Whether Forward has anywhere to go. */
export function canGoForward(state: HistoryReachState): boolean {
  return state.pointer >= 0 && state.pointer < state.keys.length - 1;
}
