/** @jsxImportSource react */
import { createContext, useCallback, use, useMemo, useState, type ReactNode } from "react";

import {
  ADVANCED_FLAGS,
  DEFAULT_SHELL_CONFIG,
  FRESH_SHELL_STATE,
  advanceExperience,
  migrateShellState,
  resolveShellConfig,
  type ExperienceLevel,
  type ShellConfig,
  type StoredShellState,
} from "./shell-disclosure";

export {
  ADVANCED_FLAGS,
  DEFAULT_SHELL_CONFIG,
  GRADUATE_AFTER_SESSIONS,
  migrateShellState,
  resolveShellConfig,
} from "./shell-disclosure";
export type { ExperienceLevel, ShellConfig } from "./shell-disclosure";

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "redrob.shell-config";

function readShellState(): StoredShellState {
  // No window means no stored history to judge by, and a server render is not a
  // first run, so show the full shell rather than guessing someone is new.
  if (typeof window === "undefined") return { ...FRESH_SHELL_STATE, level: "experienced" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return FRESH_SHELL_STATE;
    return migrateShellState(JSON.parse(raw));
  } catch {
    return FRESH_SHELL_STATE;
  }
}

function writeShellState(state: StoredShellState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors.
  }
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

type ShellConfigContextValue = {
  config: ShellConfig;
  update: (patch: Partial<ShellConfig>) => void;
  reset: () => void;
  /** How much of the shell this user is currently shown. */
  level: ExperienceLevel;
  /** Whether anything is still held back, so the UI can offer to reveal it. */
  hasHiddenFeatures: boolean;
  /** Show the advanced surfaces now, at the user's request. */
  revealAdvanced: () => void;
  /** Count a session being opened; reveals the advanced surfaces at the threshold. */
  recordSessionOpened: () => void;
};

const ShellConfigContext = createContext<ShellConfigContextValue | undefined>(undefined);

export function ShellConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredShellState>(readShellState);

  const commit = useCallback((next: StoredShellState) => {
    writeShellState(next);
    return next;
  }, []);

  const update = useCallback(
    (patch: Partial<ShellConfig>) => {
      // Recorded as the user's own choice, so graduating later cannot undo it.
      setState((prev) => commit({ ...prev, overrides: { ...prev.overrides, ...patch } }));
    },
    [commit],
  );

  const reset = useCallback(() => {
    // Reset means "give me the standard shell", not "treat me as new again" —
    // someone resetting from settings would not expect features to disappear.
    setState(() => commit({ version: 2, level: "experienced", sessions: 0, overrides: {} }));
  }, [commit]);

  const revealAdvanced = useCallback(() => {
    setState((prev) =>
      prev.level === "experienced" ? prev : commit({ ...prev, level: "experienced" }),
    );
  }, [commit]);

  const recordSessionOpened = useCallback(() => {
    setState((prev) => {
      const next = advanceExperience(prev);
      return next === prev ? prev : commit(next);
    });
  }, [commit]);

  const config = useMemo(() => resolveShellConfig(state), [state]);

  const value = useMemo<ShellConfigContextValue>(
    () => ({
      config,
      update,
      reset,
      level: state.level,
      hasHiddenFeatures: ADVANCED_FLAGS.some((flag) => !config[flag]),
      revealAdvanced,
      recordSessionOpened,
    }),
    [config, update, reset, state.level, revealAdvanced, recordSessionOpened],
  );

  return <ShellConfigContext.Provider value={value}>{children}</ShellConfigContext.Provider>;
}

export function useShellConfig(): ShellConfigContextValue {
  const ctx = use(ShellConfigContext);
  if (!ctx) {
    throw new Error("useShellConfig must be used within a ShellConfigProvider");
  }
  return ctx;
}
