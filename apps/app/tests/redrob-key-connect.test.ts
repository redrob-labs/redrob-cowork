import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createRedrobServerClient } from "../src/app/lib/redrob-server";
import { validateKey } from "../src/react-app/domains/settings/pages/environment-variable-provider";
import { connectRedrobKey } from "../src/react-app/domains/onboarding/redrob-key-connect";
import {
  REDROB_API_KEY_ENV,
  REDROB_BASE_URL,
  REDROB_MODEL_ID,
  REDROB_PROVIDER_ID,
  buildRedrobProviderConfig,
} from "../src/react-app/domains/settings/redrob-provider";

/**
 * The onboarding key step's production request sequence, driven through the
 * real `createRedrobServerClient` against a real local HTTP server so the wire
 * format is asserted rather than assumed.
 *
 * What this guards: storing `REDROB_API_KEY` alone leaves the engine
 * unauthenticated. The server only pushes a stored credential to the engine's
 * auth API for providers present in the *engine-global* runtime config, so the
 * key step must also seed the Redrob provider entry — including its
 * `env: ["REDROB_API_KEY"]` declaration, which is how the server finds the
 * stored value. If either call or the env-name declaration is dropped, a fresh
 * user gets "API key is missing" at first prompt.
 */

type RecordedRequest = {
  method: string;
  pathname: string;
  hostToken: string | null;
  body: unknown;
};

// Never the real credential; asserted on by value, so it must stay a fixture.
const FAKE_REDROB_KEY = "rk-test-not-a-real-key";
const HOST_TOKEN = "owt_test_host_token";

const stops: Array<() => void> = [];

afterEach(() => {
  while (stops.length) stops.pop()?.();
});

function startRecordingServer() {
  const requests: RecordedRequest[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const raw = await request.text().catch(() => "");
      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      requests.push({
        method: request.method,
        pathname: url.pathname,
        hostToken: request.headers.get("x-redrob-host-token"),
        body,
      });
      if (url.pathname === "/env") return Response.json({ ok: true, count: 1 });
      if (url.pathname === "/runtime-config/providers") {
        return Response.json({ ok: true, changed: true, provider: {}, reload: "reloaded" });
      }
      return Response.json({ code: "not_found", message: "Not found" }, { status: 404 });
    },
  });
  stops.push(() => void server.stop(true));
  return { baseUrl: `http://127.0.0.1:${server.port}`, requests };
}

function client(baseUrl: string) {
  return createRedrobServerClient({ baseUrl, hostToken: HOST_TOKEN });
}

describe("connectRedrobKey", () => {
  test("persists the key and seeds the Redrob provider, in that order", async () => {
    const { baseUrl, requests } = startRecordingServer();

    await connectRedrobKey(client(baseUrl), `  ${FAKE_REDROB_KEY}  `);

    expect(requests.map((request) => `${request.method} ${request.pathname}`)).toEqual([
      "PUT /env",
      "PATCH /runtime-config/providers",
    ]);

    // Step 1: the credential is stored under the exact name the provider entry
    // declares, with surrounding whitespace stripped.
    expect(requests[0]?.body).toEqual({
      entries: [{ key: REDROB_API_KEY_ENV, value: FAKE_REDROB_KEY }],
    });
    expect(REDROB_API_KEY_ENV).toBe("REDROB_API_KEY");

    // Step 2: the engine-global provider seed carries the real builder output,
    // so the server can match the stored key by env name.
    const seed = requests[1]?.body as { provider?: Record<string, { env?: string[] }> };
    expect(seed.provider?.[REDROB_PROVIDER_ID]).toEqual(buildRedrobProviderConfig());
    expect(seed.provider?.[REDROB_PROVIDER_ID]?.env).toEqual([REDROB_API_KEY_ENV]);

    // Both calls are host-token authenticated: these routes reject client tokens.
    expect(requests.map((request) => request.hostToken)).toEqual([HOST_TOKEN, HOST_TOKEN]);

    // The seeded entry must not carry the credential itself.
    expect(JSON.stringify(seed)).not.toContain(FAKE_REDROB_KEY);
  });

  test("seeds the canonical auto model against the console base URL", async () => {
    const { baseUrl, requests } = startRecordingServer();

    await connectRedrobKey(client(baseUrl), FAKE_REDROB_KEY);

    const seeded = (requests[1]?.body as {
      provider: Record<string, { options?: { baseURL?: string }; models?: Record<string, unknown> }>;
    }).provider[REDROB_PROVIDER_ID];
    expect(seeded?.options?.baseURL).toBe(REDROB_BASE_URL);
    expect(Object.keys(seeded?.models ?? {})).toEqual([REDROB_MODEL_ID]);
    expect(REDROB_MODEL_ID).toBe("auto");
  });

  test("does not seed the provider when storing the key fails", async () => {
    const requests: RecordedRequest[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        requests.push({
          method: request.method,
          pathname: url.pathname,
          hostToken: request.headers.get("x-redrob-host-token"),
          body: null,
        });
        return Response.json(
          { code: "reserved_env_key", message: "Environment variable name is reserved for Redrob Work internals" },
          { status: 400 },
        );
      },
    });
    stops.push(() => void server.stop(true));

    await expect(
      connectRedrobKey(client(`http://127.0.0.1:${server.port}`), FAKE_REDROB_KEY),
    ).rejects.toThrow();
    // A rejected store must surface on the key step, not leave a seeded
    // provider whose credential will never arrive.
    expect(requests.map((request) => request.pathname)).toEqual(["/env"]);
  });

  test("makes no request for an empty key", async () => {
    const { baseUrl, requests } = startRecordingServer();
    await connectRedrobKey(client(baseUrl), "   ");
    expect(requests).toEqual([]);
  });
});

/**
 * The helper above is only worth anything if onboarding actually goes through
 * it. The key step submits from a React route we do not render here, so the
 * wiring is pinned at the source level — the same technique the repo already
 * uses to ban bare fetch. Storing the key without the provider seed is exactly
 * the bug this change fixes, so a silent revert to `upsertUserEnv` must fail.
 */
describe("onboarding key step wiring", () => {
  const welcomeRoute = readFileSync(
    new URL("../src/react-app/shell/welcome-route.tsx", import.meta.url),
    "utf8",
  );

  test("the welcome route connects through connectRedrobKey and never stores the key alone", () => {
    expect(welcomeRoute).toContain("connectRedrobKey");
    expect(welcomeRoute).not.toContain("upsertUserEnv");
  });
});

/**
 * The Settings environment editor keeps its own copy of the server's
 * persistable-internal-key allowlist. If the two drift, the server accepts a
 * key the editor calls reserved and the user cannot rotate it after onboarding.
 */
describe("settings environment editor accepts the onboarding credential", () => {
  test("REDROB_API_KEY is editable while its neighbours stay reserved", () => {
    expect(validateKey(REDROB_API_KEY_ENV)).toBeNull();
    for (const key of ["REDROB_HOST_TOKEN", "REDROB_API_KEY_2", "OPENCODE_SERVER_PASSWORD"]) {
      expect(validateKey(key)).not.toBeNull();
    }
  });
});
