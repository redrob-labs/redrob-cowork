export type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

/** Injectable timers so stores and scripted runs can be driven by a fake clock in tests. */
export type DeskTimers = {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

// Resolved on each call so a test that patches the globals after import still wins.
export const systemTimers: DeskTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};
