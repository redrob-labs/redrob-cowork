import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every route refresh step must be bounded by a timeout.
 *
 * A pending await is the worst shape of this bug: the route keeps `loading`
 * true, the session pane renders that as "loading the latest messages", and
 * because the promise never settles the `finally` that clears the in-flight
 * guard never runs either -- so retrying does nothing and the only way out is
 * restarting the app. That is what a user reported as a permanent loading
 * state, and no test could see it because nothing throws and nothing fails.
 *
 * `withRouteRefreshTimeout` exists for this. The assertion is simply that the
 * calls which reach the server or the desktop bridge go through it, so a future
 * edit cannot quietly reintroduce an unbounded await.
 */
const SHELL_DIR = join(import.meta.dir, "..", "src", "react-app", "shell");

const read = (name: string) => readFileSync(join(SHELL_DIR, name), "utf8");

/** Calls that cross a process boundary and can therefore hang indefinitely. */
const MUST_BE_BOUNDED = [
  { file: "use-workspace-route-state.ts", call: "workspaceBootstrap()" },
  { file: "use-workspace-route-state.ts", call: ".getSession(" },
  { file: "use-workspace-route-state.ts", call: ".listWorkspaces()" },
  { file: "settings-route.tsx", call: "workspaceBootstrap()" },
  { file: "settings-route.tsx", call: "resolveRedrobConnection()" },
  { file: "settings-route.tsx", call: ".listWorkspaces()" },
  { file: "settings-route.tsx", call: ".listSessions(" },
];

describe("route refresh steps are bounded", () => {
  for (const { file, call } of MUST_BE_BOUNDED) {
    test(`${file}: ${call} is wrapped in withRouteRefreshTimeout`, () => {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      const index = code.indexOf(call);
      expect(index).toBeGreaterThan(-1);

      // The wrapper opens before the call and within a short window: either on
      // the same expression or across the line break a formatter introduces.
      const preceding = code.slice(Math.max(0, index - 400), index);
      expect(preceding).toContain("withRouteRefreshTimeout");
    });
  }

  test("the shared helper is exported once and reused, not copied", () => {
    const owner = read("use-workspace-route-state.ts");
    expect(owner).toContain("export function withRouteRefreshTimeout");
    // A second definition would drift from the first.
    expect(read("settings-route.tsx")).not.toContain("function withRouteRefreshTimeout");
  });
});
