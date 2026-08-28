import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerTrustedOpencodeProcess, startServer } from "./server.js";
import { readGlobalRuntimeOpencodeConfig, runtimeProviderMap } from "./runtime-opencode-config-store.js";
import { resetManagedProviderAuthCache } from "./managed-provider-auth.js";
import type { ServerConfig } from "./types.js";

/**
 * The production Redrob key path, end to end across the server's own routes.
 *
 * A user issues a key at console.redrob.ai and pastes it on the onboarding key
 * step. That step performs exactly two authenticated host-token calls:
 *
 *   1. `PUT /env`                        — persist `REDROB_API_KEY`
 *   2. `PATCH /runtime-config/providers` — seed the `redrob` provider entry,
 *                                          which declares `env: ["REDROB_API_KEY"]`
 *
 * Neither call hands the value to the engine directly: the engine is spawned
 * with a fixed env allowlist and never reads the env store. Delivery happens
 * only because both routes run `syncManagedProviderAuth`, which matches the
 * provider's declared env names against the store and PUTs the value to the
 * engine's `/auth/{providerId}` API.
 *
 * These tests drive the real HTTP routes against a stub engine and assert on
 * what the engine actually received, so a regression in either route (or in the
 * reserved-key policy that used to reject `REDROB_API_KEY` outright) fails here
 * rather than silently leaving inference unauthenticated.
 */

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };

type EngineRequest = { method: string; pathname: string; body: unknown };

const HOST_TOKEN = "owt_redrob_key_host_token";
const CLIENT_TOKEN = "owt_redrob_key_client_token";
// Never the real credential. Asserted on by value, so it must stay a fixture.
const FAKE_REDROB_KEY = "rk-test-not-a-real-key";
const REDROB_PROVIDER_ID = "redrob";

/**
 * The provider entry the app's `buildRedrobProviderConfig()` produces. Only the
 * `env` array matters to credential delivery; the rest is carried verbatim so
 * the fixture stays recognisable as the real payload.
 */
const REDROB_PROVIDER_ENTRY = {
  npm: "@ai-sdk/openai-compatible",
  name: "Redrob",
  env: ["REDROB_API_KEY"],
  options: { baseURL: "https://console.redrob.ai/api/backend/v1" },
  models: { auto: { name: "Auto" } },
};

const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
const priorEnvStore = process.env.REDROB_ENV_STORE;
const priorTokenStore = process.env.REDROB_TOKEN_STORE;
const priorRuntimeDb = process.env.REDROB_RUNTIME_DB;
const priorStateDir = process.env.REDROB_STATE_DIR;
let nextEngineIdentity = 0;

function startStubEngine() {
  const requests: EngineRequest[] = [];
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

      if (url.pathname === "/instance/dispose") return Response.json({ disposed: true });
      if (url.pathname.startsWith("/auth/")) return Response.json({});
      return Response.json({});
    },
  }) as Served;
  stops.push(() => server.stop(true));
  return { baseUrl: `http://127.0.0.1:${server.port}`, requests };
}

async function boot(engineBaseUrl: string) {
  const dir = await mkdtemp(join(tmpdir(), "redrob-key-delivery-"));
  dirs.push(dir);
  const workspaceRoot = join(dir, "workspace");
  process.env.REDROB_ENV_STORE = join(dir, "env.json");
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
    identity: `redrob-key-delivery-${++nextEngineIdentity}`,
    isAlive: () => true,
  });

  const server = await startServer(config) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, config };
}

function hostAuth() {
  return { "x-redrob-host-token": HOST_TOKEN, "content-type": "application/json" };
}

/** `PUT /env` — onboarding step 1. */
function storeKey(base: string, key: string, value: string) {
  return fetch(`${base}/env`, {
    method: "PUT",
    headers: hostAuth(),
    body: JSON.stringify({ entries: [{ key, value }] }),
  });
}

/** `PATCH /runtime-config/providers` — onboarding step 2. */
function seedRedrobProvider(base: string) {
  return fetch(`${base}/runtime-config/providers`, {
    method: "PATCH",
    headers: hostAuth(),
    body: JSON.stringify({ provider: { [REDROB_PROVIDER_ID]: REDROB_PROVIDER_ENTRY } }),
  });
}

function authPuts(requests: EngineRequest[]) {
  return requests.filter(
    (request) => request.method === "PUT" && request.pathname.startsWith("/auth/"),
  );
}

beforeEach(() => {
  resetManagedProviderAuthCache();
});

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
  for (const [name, prior] of [
    ["REDROB_ENV_STORE", priorEnvStore],
    ["REDROB_TOKEN_STORE", priorTokenStore],
    ["REDROB_RUNTIME_DB", priorRuntimeDb],
    ["REDROB_STATE_DIR", priorStateDir],
  ] as const) {
    if (prior === undefined) delete process.env[name];
    else process.env[name] = prior;
  }
});

describe("Redrob key onboarding delivers the credential to the engine", () => {
  test("PUT /env accepts REDROB_API_KEY and the provider seed delivers it to /auth/redrob", async () => {
    const engine = startStubEngine();
    const { base, config } = await boot(engine.baseUrl);

    // Step 1: the key step persists the console credential. This is the write
    // that the reserved-key policy used to reject with 400 reserved_env_key.
    const stored = await storeKey(base, "REDROB_API_KEY", FAKE_REDROB_KEY);
    expect(stored.status).toBe(200);
    expect(await stored.json()).toEqual({ ok: true, count: 1 });

    // Step 2: seeding the provider is what lets the sync discover the stored
    // key, because the entry is where the `REDROB_API_KEY` name is declared.
    const seeded = await seedRedrobProvider(base);
    expect(seeded.status).toBe(200);
    expect((await seeded.json()) as { changed: boolean }).toMatchObject({ ok: true, changed: true });

    // The provider landed in the engine-global map — the only map the
    // credential sync reads.
    const globalProviders = runtimeProviderMap(await readGlobalRuntimeOpencodeConfig(config));
    expect(Object.keys(globalProviders)).toEqual([REDROB_PROVIDER_ID]);
    expect(globalProviders[REDROB_PROVIDER_ID]?.env).toEqual(["REDROB_API_KEY"]);

    // The engine received the credential over its authenticated auth API.
    const puts = authPuts(engine.requests);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.pathname).toBe(`/auth/${REDROB_PROVIDER_ID}`);
    expect(puts[0]?.body).toEqual({ type: "api", key: FAKE_REDROB_KEY });
  });

  test("a later PUT /env rotation re-delivers the new key to the engine", async () => {
    const engine = startStubEngine();
    const { base } = await boot(engine.baseUrl);

    expect((await storeKey(base, "REDROB_API_KEY", FAKE_REDROB_KEY)).status).toBe(200);
    expect((await seedRedrobProvider(base)).status).toBe(200);
    expect(authPuts(engine.requests)).toHaveLength(1);

    // Re-pasting the same key must not re-write engine auth.
    expect((await storeKey(base, "REDROB_API_KEY", FAKE_REDROB_KEY)).status).toBe(200);
    expect(authPuts(engine.requests)).toHaveLength(1);

    // A genuinely rotated key must reach the engine through /env alone: the
    // provider entry is already seeded, so /env is the only call made.
    const rotated = `${FAKE_REDROB_KEY}-rotated`;
    expect((await storeKey(base, "REDROB_API_KEY", rotated)).status).toBe(200);
    const puts = authPuts(engine.requests);
    expect(puts).toHaveLength(2);
    expect(puts[1]?.body).toEqual({ type: "api", key: rotated });
  });

  test("unrelated REDROB_* keys stay reserved and never reach the engine", async () => {
    const engine = startStubEngine();
    const { base } = await boot(engine.baseUrl);
    expect((await seedRedrobProvider(base)).status).toBe(200);

    for (const key of ["REDROB_HOST_TOKEN", "REDROB_API_KEY_2", "REDROB_CODE_BIN", "OPENCODE_SERVER_PASSWORD"]) {
      const rejected = await storeKey(base, key, "should-never-persist");
      expect(rejected.status).toBe(400);
      const body = (await rejected.json()) as { code: string; message: string };
      expect(body.code).toBe("reserved_env_key");
      // The rejection must not echo the attempted name or value.
      expect(body.message).toBe("Environment variable name is reserved for Redrob Work internals");
      expect(body.message).not.toContain(key);
    }

    const list = await fetch(`${base}/env/keys`, { headers: hostAuth() });
    expect(await list.json()).toEqual({ keys: [] });
    expect(authPuts(engine.requests)).toHaveLength(0);
    expect(JSON.stringify(engine.requests)).not.toContain("should-never-persist");
  });
});
