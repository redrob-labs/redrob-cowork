import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createRedrobServerClient } from "../src/app/lib/redrob-server";
import {
  connectRedrobKey,
  disconnectRedrobKey,
  readRedrobKeyStatus,
  replaceRedrobKey,
} from "../src/react-app/domains/onboarding/redrob-key-connect";
import { validateKey } from "../src/react-app/domains/settings/pages/environment-variable-provider";

/**
 * The onboarding key step, driven through the real client against a recording
 * server so the wire format is asserted rather than assumed.
 *
 * What this guards: the Redrob Key belongs to Redrob Code. Work collects it and
 * hands it to the engine through one narrow authenticated route, and keeps no
 * copy. The specific regression these cases catch is onboarding going back to
 * `PUT /env` — that put the credential in a second place, and it only ever
 * reached the engine as a side effect of seeding a provider entry so a
 * server-side env-name match could find it.
 */

type RecordedRequest = {
  method: string;
  pathname: string;
  hostToken: string | null;
  body: unknown;
};

// Never the real credential; asserted on by value, so these must stay fixtures.
const FAKE_REDROB_KEY = "rk-test-not-a-real-key";
const ROTATED_REDROB_KEY = "rk-test-rotated-not-a-real-key";
const HOST_TOKEN = "owt_test_host_token";

const stops: Array<() => void> = [];

afterEach(() => {
  while (stops.length) stops.pop()?.();
});

function startRecordingServer(options: { failConnect?: boolean } = {}) {
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
      if (url.pathname === "/redrob-auth") {
        if (request.method === "GET") {
          return Response.json({ connected: true, source: "config", legacyMigration: "none" });
        }
        if (request.method === "PUT") {
          if (options.failConnect) {
            return Response.json(
              { code: "engine_auth_unconfirmed", message: "not connected" },
              { status: 502 },
            );
          }
          return Response.json({ ok: true, connected: true, source: "config" });
        }
        if (request.method === "DELETE") {
          return Response.json({ ok: true, connected: false, source: "none" });
        }
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
  test("delivers the key to the engine auth route and never to the env store", async () => {
    const { baseUrl, requests } = startRecordingServer();

    await connectRedrobKey(client(baseUrl), `  ${FAKE_REDROB_KEY}  `);

    // Exactly one call, on the narrow engine-auth route.
    expect(requests.map((entry) => `${entry.method} ${entry.pathname}`)).toEqual(["PUT /redrob-auth"]);
    // Trimmed, under the key the route reads.
    expect(requests[0]?.body).toEqual({ key: FAKE_REDROB_KEY });
    expect(requests[0]?.hostToken).toBe(HOST_TOKEN);
  });

  test("never touches the env store or the engine provider config", async () => {
    const { baseUrl, requests } = startRecordingServer();

    await connectRedrobKey(client(baseUrl), FAKE_REDROB_KEY);

    // Both of these were the old path: a persisted copy in Work, and a provider
    // seed whose only purpose was to make server-side env-name matching fire.
    expect(requests.some((entry) => entry.pathname.startsWith("/env"))).toBe(false);
    expect(requests.some((entry) => entry.pathname === "/runtime-config/providers")).toBe(false);
  });

  test("propagates a connect the engine did not confirm", async () => {
    const { baseUrl, requests } = startRecordingServer({ failConnect: true });

    // A half-connected state has to surface on the key step. Swallowing this
    // looks like success and then fails at the user's first prompt.
    await expect(connectRedrobKey(client(baseUrl), FAKE_REDROB_KEY)).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });

  test("makes no request for an empty key", async () => {
    const { baseUrl, requests } = startRecordingServer();
    await connectRedrobKey(client(baseUrl), "   ");
    expect(requests).toHaveLength(0);
  });
});

describe("replaceRedrobKey", () => {
  test("rotates through the same single write, with no intervening disconnect", async () => {
    const { baseUrl, requests } = startRecordingServer();

    await connectRedrobKey(client(baseUrl), FAKE_REDROB_KEY);
    await replaceRedrobKey(client(baseUrl), ROTATED_REDROB_KEY);

    expect(requests.map((entry) => `${entry.method} ${entry.pathname}`)).toEqual([
      "PUT /redrob-auth",
      "PUT /redrob-auth",
    ]);
    expect(requests[1]?.body).toEqual({ key: ROTATED_REDROB_KEY });
    // A rotation must never leave the engine unauthenticated in between.
    expect(requests.some((entry) => entry.method === "DELETE")).toBe(false);
  });
});

describe("disconnectRedrobKey", () => {
  test("reaches the engine-auth route with DELETE", async () => {
    const { baseUrl, requests } = startRecordingServer();

    await disconnectRedrobKey(client(baseUrl));

    expect(requests.map((entry) => `${entry.method} ${entry.pathname}`)).toEqual(["DELETE /redrob-auth"]);
    expect(requests[0]?.hostToken).toBe(HOST_TOKEN);
  });
});

describe("readRedrobKeyStatus", () => {
  test("reports the engine's answer and nothing else", async () => {
    const { baseUrl, requests } = startRecordingServer();

    // Status is observed from the engine; Work holds no connection state of its
    // own that could drift from it.
    expect(await readRedrobKeyStatus(client(baseUrl))).toEqual({ connected: true, source: "config" });
    expect(requests.map((entry) => `${entry.method} ${entry.pathname}`)).toEqual(["GET /redrob-auth"]);
  });
});

describe("onboarding key step wiring", () => {
  test("the welcome route connects through the engine-auth path, not the env store", () => {
    // Source-level guard: reverting the key step to a bare `upsertUserEnv` would
    // silently restore the second copy of the credential.
    const source = readFileSync(
      join(import.meta.dir, "..", "src", "react-app", "shell", "welcome-route.tsx"),
      "utf8",
    );
    expect(source).toContain("connectRedrobKey");
    expect(source).not.toContain("upsertUserEnv");
    expect(source).not.toContain("patchEngineRuntimeProviders");
  });
});

describe("settings environment editor rejects the engine-owned credential", () => {
  test("REDROB_API_KEY is not editable as an environment variable", () => {
    // It lives in Redrob Code's auth store, so offering it here would create a
    // copy the engine never reads. Mirrors PERSISTABLE_INTERNAL_KEYS on the
    // server, which is the actual enforcer.
    expect(validateKey("REDROB_API_KEY")).not.toBeNull();
    for (const key of ["REDROB_HOST_TOKEN", "REDROB_API_KEY_2", "OPENCODE_SERVER_PASSWORD"]) {
      expect(validateKey(key)).not.toBeNull();
    }
    // Unrelated service credentials still work.
    expect(validateKey("ANTHROPIC_API_KEY")).toBeNull();
    expect(validateKey("REDROB_CLOUD_API_KEY")).toBeNull();
  });
});
