import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The server's error surface must name OUR product in prose and keep upstream's names in identifiers.
 *
 * A user hitting a half-reset workspace saw:
 *
 *     {"code":"opencode_unconfigured","message":"OpenCode base URL is missing for this workspace"}
 *
 * The `message` is prose a user reads, and it named someone else's product. The `code` is a contract:
 * session-route.tsx and engine-reload-escalation.ts both branch on `opencode_unconfigured` by string,
 * so renaming it would silently break that branching while looking like a tidy-up.
 *
 * These tests hold both halves of that line at once, because the tempting fix -- a blanket rename --
 * gets exactly one of them wrong.
 */

const source = readFileSync(
  path.join(import.meta.dir, "..", "src", "server.ts"),
  "utf8",
);

/** Double-quoted string literals whose body contains a space, i.e. prose rather than an identifier. */
function proseLiterals(text: string): string[] {
  return [...text.matchAll(/"([^"\n]*)"/g)]
    .map((match) => match[1])
    .filter((body) => body.includes(" "));
}

/** Template-literal bodies, which is where the audit-summary strings live. */
function templateLiterals(text: string): string[] {
  return [...text.matchAll(/`([^`\n]*)`/g)].map((match) => match[1]);
}

describe("server error surface branding", () => {
  it("names no other product in prose a user reads", () => {
    const offenders = proseLiterals(source).filter((body) => /\bOpenCode\b/.test(body));
    expect(offenders).toEqual([]);
  });

  it("names no other product in template-literal summaries", () => {
    // The first pass missed these: the regex only covered double-quoted strings, so
    // `Write ${scope} OpenCode config` survived a sweep that reported itself clean.
    const offenders = templateLiterals(source).filter(
      (body) => /\bOpenCode\b/.test(body) && body.includes("${"),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the opencode_ error codes exactly as clients branch on them", () => {
    // These are a contract with the renderer, not labels. If a rename ever removes one, this fails
    // loudly instead of the client's branch quietly never matching again.
    for (const code of ["opencode_unconfigured", "opencode_engine_unreachable"]) {
      expect(source).toContain(`"${code}"`);
    }
  });

  it("still raises opencode_unconfigured with a Redrob-branded message", () => {
    // Both halves on the same line, which is the thing that was wrong.
    expect(source).toContain(
      '"opencode_unconfigured", "Redrob Code base URL is missing for this workspace"',
    );
  });
});
