/**
 * Helpers the onboarding connect step needs from the host app.
 *
 * Separated from the step so the step stays injectable and testable, and so the two
 * capabilities here — one HTTP read, one clipboard write — are the only host coupling
 * the whole feature has.
 */

export type HarnessAvailability = {
  codex: { installed: boolean; signedIn: boolean | null };
  claude: { installed: boolean; signedIn: boolean | null };
};

const UNKNOWN: HarnessAvailability = {
  codex: { installed: false, signedIn: null },
  claude: { installed: false, signedIn: null },
};

/**
 * Ask the server what local AI runtimes this machine has.
 *
 * Throws on a transport failure rather than returning UNKNOWN, so the step can tell
 * "nothing installed" from "we could not look" and say so — those need different
 * wording, and silently reporting the first would tell a user with Codex installed that
 * they have nothing.
 */
export async function fetchHarnessAvailability(): Promise<HarnessAvailability> {
  const response = await fetch("/harness/availability", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`availability check failed: ${response.status}`);
  const body = (await response.json()) as Partial<HarnessAvailability>;
  // Shape-checked rather than trusted: an older server that does not serve this route
  // could answer with an error envelope, and reading `.installed` off that would silently
  // report everything as absent.
  return {
    codex: normalizeRuntime(body.codex) ?? UNKNOWN.codex,
    claude: normalizeRuntime(body.claude) ?? UNKNOWN.claude,
  };
}

function normalizeRuntime(value: unknown): { installed: boolean; signedIn: boolean | null } | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as { installed?: unknown; signedIn?: unknown };
  if (typeof record.installed !== "boolean") return null;
  return {
    installed: record.installed,
    // Anything that is not an explicit boolean stays UNKNOWN. Coercing it to false would
    // tell a signed-in user to log in again.
    signedIn: typeof record.signedIn === "boolean" ? record.signedIn : null,
  };
}

/**
 * Put a command on the clipboard.
 *
 * We show commands rather than running them: spawning a visible terminal from Electron
 * needs a different incantation per platform and per emulator, and an install or a
 * vendor login is precisely the moment a user should be able to read what will run on
 * their machine.
 */
export async function copyOnboardingCommand(command: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(command);
    return;
  }
  // No clipboard permission is not a failure worth blocking on — the command is rendered
  // on screen and selectable either way, so the copy is a convenience.
}
