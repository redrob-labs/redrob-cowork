/**
 * Tests for harness availability probing.
 *
 * The behaviour that matters is the three-way answer: installed, signed in, or UNKNOWN.
 * Collapsing unknown into "signed out" would tell a signed-in user to log in again,
 * which is worse than showing an indeterminate state.
 */
import { describe, expect, test } from "bun:test";
import {
  probeClaudeSignedIn,
  probeCodexSignedIn,
  readHarnessAvailability,
  type ProbeRunner,
} from "./harness-availability.js";

const exits = (code: number | null): ProbeRunner => async () => ({ code });

describe("probeClaudeSignedIn", () => {
  test("exit 0 is signed in, exit 1 is signed out", async () => {
    // The documented contract: claude auth status exits 0 when logged in, 1 when not.
    // Its JSON field names are undocumented, so the exit code is what we depend on.
    expect(await probeClaudeSignedIn("/bin/claude", exits(0))).toBe(true);
    expect(await probeClaudeSignedIn("/bin/claude", exits(1))).toBe(false);
  });

  test("any other exit is UNKNOWN, not signed out", async () => {
    // A spawn failure, a timeout, or a CLI version without the subcommand must not be
    // reported as signed out.
    expect(await probeClaudeSignedIn("/bin/claude", exits(127))).toBeNull();
    expect(await probeClaudeSignedIn("/bin/claude", exits(null))).toBeNull();
  });

  test("asks the runtime rather than reading a credential file", async () => {
    // The compliance line: we may not collect, store or intermediate vendor credentials.
    let seen: string[] = [];
    await probeClaudeSignedIn("/bin/claude", async (_binary, args) => {
      seen = args;
      return { code: 0 };
    });
    expect(seen).toEqual(["auth", "status"]);
  });
});

describe("probeCodexSignedIn", () => {
  test("maps 0 and 1, and nothing else", async () => {
    expect(await probeCodexSignedIn("/bin/codex", exits(0))).toBe(true);
    expect(await probeCodexSignedIn("/bin/codex", exits(1))).toBe(false);
    expect(await probeCodexSignedIn("/bin/codex", exits(2))).toBeNull();
  });
});

describe("readHarnessAvailability", () => {
  test("reports not installed without probing", async () => {
    let probed = false;
    const availability = await readHarnessAvailability({
      findCodex: () => null,
      findClaude: () => null,
      run: async () => {
        probed = true;
        return { code: 0 };
      },
    });

    expect(availability).toEqual({
      codex: { installed: false, signedIn: null },
      claude: { installed: false, signedIn: null },
    });
    // Probing a binary that is not there would just be a spawn failure read as unknown.
    expect(probed).toBe(false);
  });

  test("reports each runtime independently", async () => {
    const availability = await readHarnessAvailability({
      findCodex: () => "/bin/codex",
      findClaude: () => null,
      run: exits(0),
    });
    expect(availability.codex).toEqual({ installed: true, signedIn: true });
    expect(availability.claude).toEqual({ installed: false, signedIn: null });
  });

  test("probes both in parallel", async () => {
    // Two sequential worst cases would make onboarding feel broken.
    let concurrent = 0;
    let peak = 0;
    const availability = await readHarnessAvailability({
      findCodex: () => "/bin/codex",
      findClaude: () => "/bin/claude",
      run: async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent -= 1;
        return { code: 0 };
      },
    });
    expect(peak).toBe(2);
    expect(availability.codex.signedIn).toBe(true);
    expect(availability.claude.signedIn).toBe(true);
  });
});
