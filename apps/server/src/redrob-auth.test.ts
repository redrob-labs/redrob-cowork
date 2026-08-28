import { describe, expect, test } from "bun:test";

import { deriveRedrobAuthStatus, REDROB_PROVIDER_ID } from "./redrob-auth.js";

/**
 * Status derivation is the one piece of real logic in the Redrob Key path, and
 * every obvious signal on the engine's provider report is unusable:
 *
 * - `connected: ["redrob", ...]` is always true. The engine seeds the console
 *   provider unconditionally and every console model costs 0, so its loader
 *   always autoloads and the id is always listed.
 * - `source` is confounded. Work registers a `redrob` provider entry for the
 *   model picker and the engine's config pass runs last, stamping
 *   `source: "config"` over the `"api"` the auth pass set.
 *
 * What is left is the engine's own credential gate: it publishes
 * `options.apiKey = "public"` exactly when it could not resolve a Redrob
 * credential. These cases pin that reading down, and pin down that the raw key
 * is never part of the answer.
 */

const CONSOLE_BASE_URL = "https://console.redrob.ai/api/backend/v1";
// Never a real credential.
const FAKE_KEY = "rk-test-not-a-real-key";

function providerList(entry: Record<string, unknown>) {
  return { all: [entry], default: { redrob: "auto" }, connected: [REDROB_PROVIDER_ID] };
}

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: REDROB_PROVIDER_ID,
    name: "Redrob",
    source: "config",
    env: ["REDROB_API_KEY"],
    options: { baseURL: CONSOLE_BASE_URL },
    models: { auto: { name: "Auto" } },
    ...overrides,
  };
}

describe("deriveRedrobAuthStatus", () => {
  test("reports disconnected on the engine's public-credential sentinel, even though the id is listed as connected", () => {
    const list = providerList(baseEntry({ options: { baseURL: CONSOLE_BASE_URL, apiKey: "public" } }));
    // The id *is* in `connected`; trusting that array is the bug this guards.
    expect(list.connected).toContain(REDROB_PROVIDER_ID);
    expect(deriveRedrobAuthStatus(list)).toEqual({ connected: false, source: "none" });
  });

  test("reports connected from a resolved key even when the config pass overwrote the source", () => {
    // The real shape after Work registers the provider entry: source "config",
    // no public sentinel, and the key the auth pass resolved still in place.
    const status = deriveRedrobAuthStatus(providerList(baseEntry({ key: FAKE_KEY })));
    expect(status).toEqual({ connected: true, source: "config" });
    // The credential must not travel in the status.
    expect(JSON.stringify(status)).not.toContain(FAKE_KEY);
  });

  test("reports the engine-side origin when the auth or env pass survives", () => {
    expect(deriveRedrobAuthStatus(providerList(baseEntry({ source: "api", key: FAKE_KEY })))).toEqual({
      connected: true,
      source: "api",
    });
    expect(deriveRedrobAuthStatus(providerList(baseEntry({ source: "env", key: FAKE_KEY })))).toEqual({
      connected: true,
      source: "env",
    });
  });

  test("fails closed when the sentinel is gone but nothing positive says a credential exists", () => {
    // Both signals have to agree, so a future engine dropping the sentinel
    // cannot make Work claim a credential it never saw evidence of.
    expect(deriveRedrobAuthStatus(providerList(baseEntry()))).toEqual({ connected: false, source: "none" });
    expect(deriveRedrobAuthStatus(providerList(baseEntry({ key: "   " })))).toEqual({
      connected: false,
      source: "none",
    });
  });

  test("reports disconnected when the report has no redrob entry or is not a provider list", () => {
    expect(deriveRedrobAuthStatus(providerList(baseEntry({ id: "anthropic" })))).toEqual({
      connected: false,
      source: "none",
    });
    for (const value of [null, undefined, {}, { all: {} }, "nope", 3]) {
      expect(deriveRedrobAuthStatus(value)).toEqual({ connected: false, source: "none" });
    }
  });
});
