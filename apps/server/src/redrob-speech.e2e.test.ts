import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerTrustedOpencodeProcess, startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

/**
 * Read-aloud goes `app -> POST /voice/speech -> engine POST /redrob/speech -> gateway`. The engine
 * holds the Redrob key, so what this pins down is that Work relays the text and the audio, never a
 * credential, and that the engine's refusals reach the app with their own status and message.
 */

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };
type EngineRequest = { pathname: string; authorization: string | null; body: unknown };

const HOST_TOKEN = "owt_speech_host_token";
const MP3 = new Uint8Array([0xff, 0xf3, 0x44, 0xc4, 0x09]);

const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
const prior = {
  env: process.env.REDROB_ENV_STORE,
  tokens: process.env.REDROB_TOKEN_STORE,
  db: process.env.REDROB_RUNTIME_DB,
  state: process.env.REDROB_STATE_DIR,
};

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
  for (const [name, value] of [
    ["REDROB_ENV_STORE", prior.env],
    ["REDROB_TOKEN_STORE", prior.tokens],
    ["REDROB_RUNTIME_DB", prior.db],
    ["REDROB_STATE_DIR", prior.state],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** A stand-in for the engine's speech route. */
function startStubEngine(answer: (body: unknown) => Response) {
  const requests: EngineRequest[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const body: unknown = request.method === "POST" ? await request.json().catch(() => null) : null;
      requests.push({ pathname: url.pathname, authorization: request.headers.get("authorization"), body });
      if (url.pathname === "/redrob/speech") return answer(body);
      return Response.json({});
    },
  });
  stops.push(() => server.stop(true));
  return { baseUrl: `http://127.0.0.1:${server.port}`, requests };
}

async function boot(engineBaseUrl: string) {
  const dir = await mkdtemp(join(tmpdir(), "redrob-speech-"));
  dirs.push(dir);
  const workspaceRoot = join(dir, "workspace");
  process.env.REDROB_ENV_STORE = join(dir, "env.json");
  process.env.REDROB_TOKEN_STORE = join(dir, "tokens.json");
  process.env.REDROB_RUNTIME_DB = join(dir, "runtime.sqlite");
  process.env.REDROB_STATE_DIR = join(dir, "state");
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: "owt_speech_client_token",
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
  };
  registerTrustedOpencodeProcess(config, { baseUrl: engineBaseUrl, identity: "redrob-speech", isAlive: () => true });
  const server = (await startServer(config)) as Served;
  stops.push(() => server.stop(true));
  return `http://127.0.0.1:${server.port}`;
}

function speak(base: string, body: unknown, headers: Record<string, string> = { "x-redrob-host-token": HOST_TOKEN }) {
  return fetch(`${base}/voice/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("read-aloud speech relay", () => {
  test("relays the text to the engine and the engine's mp3 back, carrying no Redrob key", async () => {
    const engine = startStubEngine(() => new Response(MP3, { headers: { "content-type": "audio/mpeg" } }));
    const base = await boot(engine.baseUrl);

    const response = await speak(base, { text: "  안녕하세요  ", voice: "sarah" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(MP3);

    const call = engine.requests.find((request) => request.pathname === "/redrob/speech");
    expect(call?.body).toEqual({ text: "안녕하세요", voice: "sarah" });
    // The engine's own basic auth, never a Redrob credential.
    expect(call?.authorization).toStartWith("Basic ");
    expect(JSON.stringify(call)).not.toMatch(/rk[-_]/);
  });

  test("needs the host token", async () => {
    const engine = startStubEngine(() => new Response(MP3, { headers: { "content-type": "audio/mpeg" } }));
    const base = await boot(engine.baseUrl);
    expect((await speak(base, { text: "Hello" }, {})).status).toBe(401);
    expect(engine.requests.some((request) => request.pathname === "/redrob/speech")).toBe(false);
  });

  test("refuses empty or over-long text without asking the engine", async () => {
    const engine = startStubEngine(() => new Response(MP3, { headers: { "content-type": "audio/mpeg" } }));
    const base = await boot(engine.baseUrl);
    expect((await speak(base, { text: "   " })).status).toBe(400);
    expect((await speak(base, { text: "가".repeat(4097) })).status).toBe(400);
    expect(engine.requests.some((request) => request.pathname === "/redrob/speech")).toBe(false);
  });

  test("passes the engine's refusals through with their status and message", async () => {
    const cases: Array<[number, string, number, string]> = [
      [503, "Connect Redrob to generate speech", 503, "redrob_not_connected"],
      [502, "The Redrob gateway answered 402: Out of credit.", 502, "speech_failed"],
      [504, "Speech generation timed out.", 504, "speech_failed"],
    ];
    for (const [status, message, expected, code] of cases) {
      const engine = startStubEngine(() => Response.json({ _tag: "Error", message }, { status }));
      const base = await boot(engine.baseUrl);
      const response = await speak(base, { text: "Hello" });
      expect(response.status).toBe(expected);
      expect(await response.json()).toMatchObject({ code, message });
    }
  });

  test("an engine answer that is not audio is a 502, never handed to the app as audio", async () => {
    const engine = startStubEngine(() => Response.json({ ok: true }));
    const base = await boot(engine.baseUrl);
    const response = await speak(base, { text: "Hello" });
    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).not.toStartWith("audio/");
  });
});
