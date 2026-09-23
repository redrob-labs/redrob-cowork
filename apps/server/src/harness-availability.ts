/**
 * What local AI runtimes this machine has, for the onboarding choice screen.
 *
 * Kept as its own module so the answer is computed in one place and tested without a
 * server. The app calls `GET /harness/availability` and renders from this shape.
 *
 * CREDENTIAL RULE: signed-in state is learned by ASKING the runtime, never by reading
 * its credential store. Codex caches under CODEX_HOME and Claude Code in the OS keychain
 * or a 0600 file; reading either would cross the line Anthropic's compliance page draws
 * ("developers may not collect, store, or intermediate Claude.ai credentials or session
 * tokens"). `claude auth status` exits 0 when signed in and 1 when not, which is the
 * documented contract — its JSON field names are not documented, so the EXIT CODE is what
 * we depend on.
 */
import { spawn } from "node:child_process";
import { discoverCodexBinary } from "./codex-runtime.js";
import { discoverClaudeBinary } from "./claude-runtime.js";

export type RuntimeAvailability = {
  installed: boolean;
  /** Null when not installed, or when the probe could not decide. */
  signedIn: boolean | null;
};

export type HarnessAvailability = {
  codex: RuntimeAvailability;
  claude: RuntimeAvailability;
};

/** Injection point so the probe is testable without either binary present. */
export type ProbeRunner = (binary: string, args: string[]) => Promise<{ code: number | null }>;

const defaultRunner: ProbeRunner = (binary, args) =>
  new Promise((resolve) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
    // A probe that hangs must not hang onboarding. Five seconds is generous for a
    // status check and still short enough that the screen stays responsive; a timeout
    // resolves as "unknown" rather than as "signed out", because telling a signed-in
    // user to log in again is worse than showing an indeterminate state.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null });
    }, 5000);
    child.once("error", () => {
      clearTimeout(timer);
      resolve({ code: null });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code });
    });
  });

/**
 * Ask Claude Code whether it is signed in.
 *
 * `claude auth status` exits 0 when logged in, 1 when not. Anything else — a spawn
 * failure, a timeout, a version without the subcommand — is `null`, not `false`.
 */
export async function probeClaudeSignedIn(binary: string, run: ProbeRunner = defaultRunner): Promise<boolean | null> {
  const { code } = await run(binary, ["auth", "status"]);
  if (code === 0) return true;
  if (code === 1) return false;
  return null;
}

/**
 * Ask Codex whether it is signed in.
 *
 * `codex login status` is the cheap check. As above, only a clean 0 or 1 is treated as an
 * answer — an unrecognised exit code from a newer or older CLI must not be reported as
 * signed out.
 */
export async function probeCodexSignedIn(binary: string, run: ProbeRunner = defaultRunner): Promise<boolean | null> {
  const { code } = await run(binary, ["login", "status"]);
  if (code === 0) return true;
  if (code === 1) return false;
  return null;
}

export async function readHarnessAvailability(
  deps: {
    findCodex?: () => string | null;
    findClaude?: () => string | null;
    run?: ProbeRunner;
  } = {},
): Promise<HarnessAvailability> {
  const codexBinary = (deps.findCodex ?? discoverCodexBinary)();
  const claudeBinary = (deps.findClaude ?? discoverClaudeBinary)();
  const run = deps.run ?? defaultRunner;

  // Probed in parallel: two sequential 5s worst cases would make onboarding feel broken.
  const [codexSignedIn, claudeSignedIn] = await Promise.all([
    codexBinary ? probeCodexSignedIn(codexBinary, run) : Promise.resolve(null),
    claudeBinary ? probeClaudeSignedIn(claudeBinary, run) : Promise.resolve(null),
  ]);

  return {
    codex: { installed: Boolean(codexBinary), signedIn: codexSignedIn },
    claude: { installed: Boolean(claudeBinary), signedIn: claudeSignedIn },
  };
}
