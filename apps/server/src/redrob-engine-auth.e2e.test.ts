import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerTrustedOpencodeProcess, startServer } from "./server.js";
import { resetManagedProviderAuthCache } from "./managed-provider-auth.js";
import { resetLegacyRedrobKeyMigrationState } from "./redrob-auth.js";
import type { ServerConfig } from "./types.js";

/**
 * The production Redrob Key path, end to end across the server's own routes.
 *
 * Redrob Code owns this credential. Work collects it during onboarding and hands
 * it to the engine over one narrow host-token route; Work never persists it. The
 * assertions are on what the *engine* received and on what Work's env store does
 * not contain, because both halves of that ownership claim can regress
 * independently:
 *
 * - onboarding quietly going back to `PUT /env` would recreate the second copy;
 * - the engine never receiving `PUT /auth/redrob` would leave inference
 *   unauthenticated while the UI reported success;
 * - a disconnect that does not reach `DELETE /auth/redrob`, or that reports
 *   success while the engine still authenticates, would leave a live credential
 *   behind while telling the user it was revoked.
 *
 * The stub engine reproduces the two behaviours status derivation depends on: an
 * unauthenticated `redrob` entry is published with `options.apiKey = "public"`,
 * and provider state is recomputed only when the instance is disposed.
 */

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };

type EngineRequest = { method: string; pathname: string; body: unknown };

const HOST_TOKEN = "owt_redrob_auth_host_token";
const CLIENT_TOKEN = "owt_redrob_auth_client_token";
// Never a real credential. Asserted on by value, so these must stay fixtures.
const FAKE_REDROB_KEY = "rk-test-not-a-real-key";
const ROTATED_REDROB_KEY = "rk-test-rotated-not-a-real-key";
const LEGACY_REDROB_KEY = "rk-test-legacy-not-a-real-key";

const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
const priorEnvStore = process.env.REDROB_ENV_STORE;
const priorTokenStore = process.env.REDROB_TOKEN_STORE;
const priorRuntimeDb = process.env.REDROB_RUNTIME_DB;
const priorStateDir = process.env.REDROB_STATE_DIR;
let nextEngineIdentity = 0;

type StubEngineOptions = {
  /**
   * When false the engine accepts auth writes but never publishes them into
   * provider state — what a Work route that skipped the reload, or an engine that
   * silently failed to pick the credential up, looks like from outside.
   */
  publishOnDispose?: boolean;
  /** Report a live credential no matter what the auth store holds. */
  alwaysConnected?: boolean;
};

/**
 * Stands in for Redrob Code's auth + provider surface.
 *
 * `auth.json` is modelled as a single stored value, and the published provider
 * entry is a snapshot of it taken at the last dispose — mirroring the real
 * engine, which resolves the credential once when it builds provider state and
 * never invalidates that on an auth write.
 */
function startStubEngine(options: StubEngineOptions = {}) {
  const publishOnDispose = options.publishOnDispose !== false;
  const requests: EngineRequest[] = [];
  let stored: string | null = null;
  let published: string | null = null;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const raw = request.method === "GET" ? "" : await request.text().catch(() => "");
      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      requests.push({ method: request.method, pathname: url.pathname, body });

      if (url.pathname === "/instance/dispose") {
        if (publishOnDispose) published = stored;
        return Response.json({ disposed: true });
      }
      if (url.pathname === "/auth/redrob") {
        if (request.method === "PUT") {
          const key = body !== null && typeof body === "object" ? (body as { key?: unknown }).key : undefined;
          stored = typeof key === "string" ? key : null;
          return Response.json(true);
        }
        if (request.method === "DELETE") {
          stored = null;
          return Response.json(true);
        }
      }
      if (url.pathname === "/provider" && request.method === "GET") {
        // Work registers a `redrob` provider entry for the model picker, so the
        // engine's config pass stamps source "config" either way and the id is
        // always present in `connected`. Only the credential gate differs.
        const entry: Record<string, unknown> = {
          id: "redrob",
          name: "Redrob",
          source: "config",
          env: ["REDROB_API_KEY"],
          options: { baseURL: "https://console.redrob.ai/api/backend/v1" },
          models: { auto: { name: "Auto" } },
        };
        if (options.alwaysConnected) entry.key = "rk-test-stale-not-a-real-key";
        else if (published) entry.key = published;
        else entry.options = { baseURL: "https://console.redrob.ai/api/backend/v1", apiKey: "public" };
        return Response.json({ all: [entry], default: { redrob: "auto" }, connected: ["redrob"] });
      }
      return Response.json({});
    },
  }) as Served;

  const stop = () => server.stop(true);
  stops.push(stop);
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    requests,
    /** What the engine's auth store holds right now. */
    storedKey: () => stored,
    stop,
  };
}

async function boot(engineBaseUrl: string, options: { legacyKey?: string } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "redrob-engine-auth-"));
  dirs.push(dir);
  const workspaceRoot = join(dir, "workspace");
  const envStorePath = join(dir, "env.json");
  // Seeded before the server starts, the way a real pre-ownership install looks
  // on disk. Also keeps the store's in-memory load from racing the seed.
  if (options.legacyKey) await seedLegacyEnvStore(envStorePath, options.legacyKey);
  process.env.REDROB_ENV_STORE = envStorePath;
  process.env.REDROB_TOKEN_STORE = join(dir, "tokens.json");
  process.env.REDROB_RUNTIME_DB = join(dir, "runtime.sqlite");
  process.env.REDROB_STATE_DIR = join(dir, "state");

  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: CLIENT_TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [
      {
        id: "ws_1",
        name: "Workspace",
        path: workspaceRoot,
        preset: "starter",
        workspaceType: "local",
        baseUrl: engineBaseUrl,
        opencodeUsername: "engine-user",
        opencodePassword: "engine-pass",
      },
    ],
    authorizedRoots: [workspaceRoot],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;

  registerTrustedOpencodeProcess(config, {
    baseUrl: engineBaseUrl,
    identity: `redrob-engine-auth-${++nextEngineIdentity}`,
    isAlive: () => true,
  });

  const server = await startServer(config) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, config, envStorePath };
}

function hostAuth() {
  return { "x-redrob-host-token": HOST_TOKEN, "content-type": "application/json" };
}

/** The single call the onboarding key step makes. */
function connect(base: string, key: string) {
  return fetch(`${base}/redrob-auth`, { method: "PUT", headers: hostAuth(), body: JSON.stringify({ key }) });
}

function disconnect(base: string) {
  return fetch(`${base}/redrob-auth`, { method: "DELETE", headers: hostAuth() });
}

function status(base: string) {
  return fetch(`${base}/redrob-auth`, { headers: hostAuth() });
}

function authWrites(requests: EngineRequest[], method: string) {
  return requests.filter((entry) => entry.method === method && entry.pathname === "/auth/redrob");
}

/** Write the env store the way an install from before this ownership change looks. */
async function seedLegacyEnvStore(path: string, value: string) {
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: Date.now(),
      variables: [{ key: "REDROB_API_KEY", value, updatedAt: Date.now() }],
    }),
    "utf8",
  );
}

async function readEnvStoreKeys(path: string): Promise<string[]> {
  const raw = await readFile(path, "utf8").catch(() => "");
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { variables?: Array<{ key?: unknown }> };
  return (parsed.variables ?? []).map((entry) => String(entry.key));
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  resetManagedProviderAuthCache();
  resetLegacyRedrobKeyMigrationState();
});

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
  resetManagedProviderAuthCache();
  resetLegacyRedrobKeyMigrationState();
  restore("REDROB_ENV_STORE", priorEnvStore);
  restore("REDROB_TOKEN_STORE", priorTokenStore);
  restore("REDROB_RUNTIME_DB", priorRuntimeDb);
  restore("REDROB_STATE_DIR", priorStateDir);
});

describe("Redrob Code owns the Redrob Key", () => {
  test("connect reaches the engine auth API and stores nothing in the Work env store", async () => {
    const engine = startStubEngine();
    const { base, envStorePath } = await boot(engine.baseUrl);

    const response = await connect(base, `  ${FAKE_REDROB_KEY}  `);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, connected: true, source: "config" });

    // The credential reached the engine's own auth API, trimmed.
    const puts = authWrites(engine.requests, "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({ type: "api", key: FAKE_REDROB_KEY });
    expect(engine.storedKey()).toBe(FAKE_REDROB_KEY);

    // Onboarding must not have gone through the env store. This is the
    // regression that would recreate a second source of truth.
    expect(await readEnvStoreKeys(envStorePath)).toEqual([]);
    expect(await (await fetch(`${base}/env/keys`, { headers: hostAuth() })).json()).toEqual({ keys: [] });
  });

  test("connect rejects an empty key without touching the engine", async () => {
    const engine = startStubEngine();
    const { base } = await boot(engine.baseUrl);

    const response = await connect(base, "   ");
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_redrob_key");
    expect(authWrites(engine.requests, "PUT")).toHaveLength(0);
  });

  test("connect fails when the engine does not report the credential as connected", async () => {
    // Auth writes are accepted but never take effect in provider state, which is
    // what a skipped reload looks like. Reporting success here would hand the
    // user a key that silently fails at their first prompt.
    const engine = startStubEngine({ publishOnDispose: false });
    const { base } = await boot(engine.baseUrl);

    const response = await connect(base, FAKE_REDROB_KEY);
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("engine_auth_unconfirmed");
    expect(authWrites(engine.requests, "PUT")).toHaveLength(1);
  });

  test("a second connect rotates the credential in place", async () => {
    const engine = startStubEngine();
    const { base } = await boot(engine.baseUrl);

    expect((await connect(base, FAKE_REDROB_KEY)).status).toBe(200);
    expect((await connect(base, ROTATED_REDROB_KEY)).status).toBe(200);

    const puts = authWrites(engine.requests, "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1]?.body).toEqual({ type: "api", key: ROTATED_REDROB_KEY });
    expect(engine.storedKey()).toBe(ROTATED_REDROB_KEY);
    // No remove-then-add: a rotation must never pass through an unauthenticated
    // window on the engine.
    expect(authWrites(engine.requests, "DELETE")).toHaveLength(0);
  });

  test("disconnect reaches DELETE /auth/redrob and verifies the engine no longer authenticates", async () => {
    const engine = startStubEngine();
    const { base } = await boot(engine.baseUrl);

    expect((await connect(base, FAKE_REDROB_KEY)).status).toBe(200);
    expect(await (await status(base)).json()).toEqual({
      connected: true,
      source: "config",
      legacyMigration: "none",
    });

    const response = await disconnect(base);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, connected: false, source: "none" });

    expect(authWrites(engine.requests, "DELETE")).toHaveLength(1);
    expect(engine.storedKey()).toBeNull();
    expect(await (await status(base)).json()).toEqual({
      connected: false,
      source: "none",
      legacyMigration: "none",
    });
  });

  test("disconnect fails loudly when the engine still reports a credential", async () => {
    // The removal is accepted but the engine keeps reporting a live credential —
    // exactly the stale-auth case that a reported success would hide, and the
    // reason disconnect verifies instead of trusting the DELETE.
    const engine = startStubEngine({ alwaysConnected: true });
    const { base } = await boot(engine.baseUrl);

    const response = await disconnect(base);
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("engine_auth_stale");
    // The removal was still attempted; the failure is the verification, not the call.
    expect(authWrites(engine.requests, "DELETE")).toHaveLength(1);
  });

  test("a legacy Work-stored key migrates to the engine exactly once, delivery before deletion", async () => {
    const engine = startStubEngine();
    const { base, envStorePath } = await boot(engine.baseUrl, { legacyKey: LEGACY_REDROB_KEY });
    expect(await readEnvStoreKeys(envStorePath)).toEqual(["REDROB_API_KEY"]);

    const first = await status(base);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.legacyMigration).toBe("migrated");
    expect(firstBody.connected).toBe(true);

    // Delivered to the engine, and only then removed from Work.
    const puts = authWrites(engine.requests, "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({ type: "api", key: LEGACY_REDROB_KEY });
    expect(engine.storedKey()).toBe(LEGACY_REDROB_KEY);
    expect(await readEnvStoreKeys(envStorePath)).toEqual([]);

    // Exactly once: a repeat poll must not re-deliver.
    const secondBody = await (await status(base)).json();
    expect(secondBody.legacyMigration).toBe("none");
    expect(authWrites(engine.requests, "PUT")).toHaveLength(1);

    // The value never appears in a response body.
    expect(JSON.stringify([firstBody, secondBody])).not.toContain(LEGACY_REDROB_KEY);
  });

  test("a failed migration keeps the credential so it can be retried", async () => {
    const engine = startStubEngine();
    const { base, envStorePath } = await boot(engine.baseUrl, { legacyKey: LEGACY_REDROB_KEY });
    // Take the engine down: delivery cannot succeed, so the only copy of the
    // user's credential must survive.
    await engine.stop();

    const response = await status(base);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.legacyMigration).toBe("failed");
    expect(body.connected).toBe(false);
    expect(await readEnvStoreKeys(envStorePath)).toEqual(["REDROB_API_KEY"]);
    expect(JSON.stringify(body)).not.toContain(LEGACY_REDROB_KEY);
  });

  test("REDROB_API_KEY and its neighbours are all rejected by the env store", async () => {
    const engine = startStubEngine();
    const { base } = await boot(engine.baseUrl);

    for (const key of [
      "REDROB_API_KEY",
      "REDROB_HOST_TOKEN",
      "REDROB_API_KEY_2",
      "REDROB_CODE_BIN",
      "OPENCODE_SERVER_PASSWORD",
    ]) {
      const response = await fetch(`${base}/env`, {
        method: "PUT",
        headers: hostAuth(),
        body: JSON.stringify({ key, value: "should-never-persist" }),
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("reserved_env_key");
      // The rejection must not echo the key name back.
      expect(JSON.stringify(body)).not.toContain(key);
    }

    expect(await (await fetch(`${base}/env/keys`, { headers: hostAuth() })).json()).toEqual({ keys: [] });
    expect(authWrites(engine.requests, "PUT")).toHaveLength(0);
  });
});
