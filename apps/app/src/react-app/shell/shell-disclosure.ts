/**
 * Which parts of the shell a given user is shown, and how that widens over time.
 *
 * Kept apart from the React provider in `shell-config.tsx` so the rules can be
 * tested directly — importing the provider pulls in the JSX runtime.
 */

export type ShellConfig = {
  /** Display name shown in the title bar, sidebar, and welcome page. */
  appName: string;
  /** Show live connection status inside the sidebar account menu. */
  statusBar: boolean;
  /** Show the left sidebar with workspace/session list. */
  sidebar: boolean;
  /** Show the Docs entry in the account menu. */
  docsButton: boolean;
  /** Show the Feedback entry in the account menu. */
  feedbackButton: boolean;
  /** Show starter task cards in empty sessions. */
  starterCards: boolean;
  /** Show the notification bell in the header. */
  notifications: boolean;
};

export const DEFAULT_SHELL_CONFIG: ShellConfig = {
  appName: "Redrob Work",
  statusBar: true,
  sidebar: true,
  docsButton: true,
  feedbackButton: true,
  starterCards: true,
  notifications: true,
};

/**
 * Flags that were declared here but that nothing ever read.
 *
 * `cloudSignin`, `welcomePage`, `modelPicker`, `browser` and `addWorkspace` had
 * no consumer anywhere in the app, so setting any of them changed nothing on
 * screen — a settings surface that silently does nothing is worse than no
 * setting. Named rather than merely deleted so a stored value for one is dropped
 * on read instead of lingering in the persisted overrides forever.
 */
export const REMOVED_SHELL_FLAGS = [
  "cloudSignin",
  "welcomePage",
  "modelPicker",
  "browser",
  "addWorkspace",
] as const;

/**
 * How much of the UI this user has been shown.
 *
 * `new` starts with the advanced surfaces hidden and reveals them as the user
 * settles in, so a first run is not the whole product at once. `experienced` is
 * the full shell. An existing install is always `experienced`: an upgrade must
 * never take features away from someone who was already using them.
 */
export type ExperienceLevel = "new" | "experienced";

/**
 * The flags a first-run user does not start with.
 *
 * Deliberately short. Everything else defaults on because a beginner needs it
 * MORE than an experienced user does — hiding the starter cards, the docs entry
 * or the sidebar would be the opposite of helpful. What is left is the surfaces
 * that only report on internals: connection status and an empty notification
 * bell.
 *
 * Note that most of `ShellConfig` cannot participate: `cloudSignin`,
 * `welcomePage`, `modelPicker` and `addWorkspace` have no consumer reading them,
 * so switching them off changes nothing on screen.
 */
export const ADVANCED_FLAGS = ["statusBar", "notifications"] as const satisfies readonly (keyof ShellConfig)[];

/** Sessions a `new` user opens before the advanced surfaces appear on their own. */
export const GRADUATE_AFTER_SESSIONS = 5;

/**
 * Only the flags the user changed themselves are stored.
 *
 * Keeping overrides separate from the derived values is what lets disclosure and
 * user intent coexist: graduating turns on the advanced flags the user never
 * touched, and leaves alone any they deliberately switched off.
 */
export type StoredShellState = {
  version: 2;
  level: ExperienceLevel;
  sessions: number;
  overrides: Partial<ShellConfig>;
};

export const FRESH_SHELL_STATE: StoredShellState = {
  version: 2,
  level: "new",
  sessions: 0,
  overrides: {},
};

export function resolveShellConfig(state: StoredShellState): ShellConfig {
  const base = { ...DEFAULT_SHELL_CONFIG };
  if (state.level === "new") {
    for (const flag of ADVANCED_FLAGS) base[flag] = false;
  }
  return { ...base, ...state.overrides };
}

/**
 * Keep only keys that are still real flags.
 *
 * Persisted state outlives the code that wrote it, so an override for a flag we
 * have since removed would otherwise sit in localStorage forever and get spread
 * back over the resolved config. Filtering on read also hardens what was an
 * unchecked cast: whatever is in storage, only known keys survive it.
 */
function knownOverrides(raw: unknown): Partial<ShellConfig> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const kept: Partial<ShellConfig> = {};
  for (const key of Object.keys(DEFAULT_SHELL_CONFIG) as (keyof ShellConfig)[]) {
    if (key in source) kept[key] = source[key] as never;
  }
  return kept;
}

export function migrateShellState(raw: unknown): StoredShellState {
  if (!raw || typeof raw !== "object") return FRESH_SHELL_STATE;
  const value = raw as Record<string, unknown>;

  if (value.version === 2) {
    return {
      version: 2,
      // An unreadable level widens rather than narrows: showing too much is a
      // worse first run, but hiding a feature someone relies on is a bug report.
      level: value.level === "new" ? "new" : "experienced",
      sessions: typeof value.sessions === "number" ? value.sessions : 0,
      overrides: knownOverrides(value.overrides),
    };
  }

  // v1 stored a whole ShellConfig. Whatever it holds is what this user has been
  // seeing, so carry it forward verbatim and mark them experienced rather than
  // hiding surfaces they already use.
  return {
    version: 2,
    level: "experienced",
    sessions: GRADUATE_AFTER_SESSIONS,
    overrides: knownOverrides(value),
  };
}

/** Whether the next opened session should widen what this user sees. */
export function advanceExperience(state: StoredShellState): StoredShellState {
  if (state.level === "experienced") return state;
  const sessions = state.sessions + 1;
  return {
    ...state,
    sessions,
    level: sessions >= GRADUATE_AFTER_SESSIONS ? "experienced" : "new",
  };
}
