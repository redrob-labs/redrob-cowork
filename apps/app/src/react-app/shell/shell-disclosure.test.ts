import { describe, expect, test } from "bun:test";

import {
  ADVANCED_FLAGS,
  advanceExperience,
  DEFAULT_SHELL_CONFIG,
  GRADUATE_AFTER_SESSIONS,
  migrateShellState,
  resolveShellConfig,
  type ShellConfig,
} from "./shell-disclosure";

/**
 * Progressive disclosure: a first-run user is not shown the whole shell at once.
 *
 * The property that matters most is the last one here. Disclosure derives flags
 * the user has never touched; a flag the user set themselves must survive
 * graduation, or the feature fights its own settings screen.
 */

const fresh = { version: 2, level: "new", sessions: 0, overrides: {} } as const;

describe("resolveShellConfig", () => {
  test("a new user does not start with the advanced surfaces", () => {
    const config = resolveShellConfig(fresh);
    for (const flag of ADVANCED_FLAGS) {
      expect(config[flag]).toBe(false);
    }
  });

  test("a new user still gets everything a beginner needs", () => {
    const config = resolveShellConfig(fresh);
    // Hiding these would be the opposite of helpful, so they must never be in
    // the advanced set.
    for (const flag of ["starterCards", "docsButton", "sidebar", "feedbackButton"] as const) {
      expect(config[flag]).toBe(true);
      expect(ADVANCED_FLAGS).not.toContain(flag);
    }
  });

  test("an experienced user gets the full shell", () => {
    const config = resolveShellConfig({ ...fresh, level: "experienced" });
    expect(config).toEqual(DEFAULT_SHELL_CONFIG);
  });

  test("a flag the user turned off stays off after graduating", () => {
    const overrides: Partial<ShellConfig> = { notifications: false };
    const graduated = resolveShellConfig({ ...fresh, level: "experienced", overrides });
    expect(graduated.notifications).toBe(false);
    // ...while an advanced flag they never touched does appear.
    expect(graduated.statusBar).toBe(true);
  });

  test("a flag the user turned on is on even while still new", () => {
    const config = resolveShellConfig({ ...fresh, overrides: { statusBar: true } });
    expect(config.statusBar).toBe(true);
  });
});

describe("migrateShellState", () => {
  test("an existing install keeps its settings and is treated as experienced", () => {
    // v1 stored a whole ShellConfig with no version field.
    const v1 = { ...DEFAULT_SHELL_CONFIG, starterCards: false };
    const migrated = migrateShellState(v1);

    expect(migrated.level).toBe("experienced");
    expect(migrated.overrides.starterCards).toBe(false);

    // The point of the migration: an upgrade must not hide surfaces from someone
    // who was already using them.
    const config = resolveShellConfig(migrated);
    for (const flag of ADVANCED_FLAGS) {
      expect(config[flag]).toBe(true);
    }
    expect(config.starterCards).toBe(false);
  });

  test("no stored state at all means a genuinely new user", () => {
    expect(migrateShellState(null).level).toBe("new");
    expect(migrateShellState(undefined).level).toBe("new");
    expect(migrateShellState("garbage").level).toBe("new");
  });

  test("v2 state round-trips", () => {
    const state = {
      version: 2 as const,
      level: "new" as const,
      sessions: 3,
      overrides: { notifications: true },
    };
    expect(migrateShellState(state)).toEqual(state);
  });

  test("a corrupt level falls back to experienced rather than hiding features", () => {
    const migrated = migrateShellState({ version: 2, level: "nonsense", sessions: 0, overrides: {} });
    expect(migrated.level).toBe("experienced");
  });
});

describe("graduation threshold", () => {
  test("counting sessions graduates the user exactly at the threshold", () => {
    let state: ReturnType<typeof advanceExperience> = fresh;
    for (let opened = 1; opened < GRADUATE_AFTER_SESSIONS; opened += 1) {
      state = advanceExperience(state);
      expect(state.level).toBe("new");
      expect(resolveShellConfig(state).statusBar).toBe(false);
    }

    state = advanceExperience(state);
    expect(state.sessions).toBe(GRADUATE_AFTER_SESSIONS);
    expect(state.level).toBe("experienced");
    expect(resolveShellConfig(state).statusBar).toBe(true);
  });

  test("counting stops once the user is experienced, so the number cannot run away", () => {
    const graduated = { ...fresh, level: "experienced" as const, sessions: 99 };
    // Returns the same object, which is also what lets the provider skip a write.
    expect(advanceExperience(graduated)).toBe(graduated);
  });

  test("the threshold is small enough to reach in ordinary use", () => {
    expect(GRADUATE_AFTER_SESSIONS).toBeGreaterThan(0);
    expect(GRADUATE_AFTER_SESSIONS).toBeLessThanOrEqual(10);
  });
});

describe("the advanced set", () => {
  test("names only real ShellConfig flags", () => {
    for (const flag of ADVANCED_FLAGS) {
      expect(Object.keys(DEFAULT_SHELL_CONFIG)).toContain(flag);
    }
  });

  test("every advanced flag defaults on, so hiding it is disclosure and not a new default", () => {
    for (const flag of ADVANCED_FLAGS) {
      expect(DEFAULT_SHELL_CONFIG[flag]).toBe(true);
    }
  });
});
