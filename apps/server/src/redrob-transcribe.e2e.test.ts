import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeRedrobWorkspaceConfig } from "./redrob-workspace-config-store.js";
import { registerTrustedOpencodeProcess, startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

/**
 * Push-to-talk goes `app -> POST /voice/transcribe -> engine POST /redrob/transcribe -> gateway`.
 * The engine holds the Redrob key, so what this pins down is that Work relays the recording and the
 * transcript, never a credential, that a recording is never sent at High or Strict privacy, and that
 * the engine's refusals reach the app with their own status and message.
 */

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };
type EngineRequest = { pathname: string; authorization: string | null; body: unknown };

const HOST_TOKEN = "owt_transcribe_host_token";
const CLIP = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42]).toString("base64");
const TRANSCRIPT = { text: "회의 요약해 줘", seconds: 2.4, costUsd: 0.0003 };

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

/** A stand-in for the engine's transcription route. */
function startStubEngine(answer: (body: unknown) => Response) {
  const requests: EngineRequest[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const body: unknown = request.method === "POST" ? await request.json().catch(() => null) : null;
      requests.push({ pathname: url.pathname, authorization: request.headers.get("authorization"), body });
      if (url.pathname === "/redrob/transcribe") return answer(body);
      return Response.json({});
    },
  });
  stops.push(() => server.stop(true));
  const reached = () => requests.some((request) => request.pathname === "/redrob/transcribe");
  return { baseUrl: `http://127.0.0.1:${server.port}`, requests, reached };
}

async function boot(engineBaseUrl: string) {
  const dir = await mkdtemp(join(tmpdir(), "redrob-transcribe-"));
  dirs.push(dir);
  const workspaceRoot = join(dir, "workspace");
  process.env.REDROB_ENV_STORE = join(dir, "env.json");
  process.env.REDROB_TOKEN_STORE = join(dir, "tokens.json");
  process.env.REDROB_RUNTIME_DB = join(dir, "runtime.sqlite");
  process.env.REDROB_STATE_DIR = join(dir, "state");
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: "owt_transcribe_client_token",
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
  registerTrustedOpencodeProcess(config, { baseUrl: engineBaseUrl, identity: "redrob-transcribe", isAlive: () => true });
  const server = (await startServer(config)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, config };
}

function transcribe(
  base: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = { "x-redrob-host-token": HOST_TOKEN },
) {
  return fetch(`${base}/voice/transcribe`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ workspaceId: "ws_1", audio: CLIP, format: "webm", ...body }),
  });
}

describe("push-to-talk transcription relay", () => {
  test("relays the recording to the engine and the transcript back, carrying no Redrob key", async () => {
    const engine = startStubEngine(() => Response.json(TRANSCRIPT));
    const { base } = await boot(engine.baseUrl);

    const response = await transcribe(base, { language: "ko" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(TRANSCRIPT);

    const call = engine.requests.find((request) => request.pathname === "/redrob/transcribe");
    expect(call?.body).toEqual({ audio: CLIP, format: "webm", language: "ko" });
    // The engine's own basic auth, never a Redrob credential.
    expect(call?.authorization).toStartWith("Basic ");
    expect(JSON.stringify(call)).not.toMatch(/rk[-_]/);
  });

  test("needs the host token", async () => {
    const engine = startStubEngine(() => Response.json(TRANSCRIPT));
    const { base } = await boot(engine.baseUrl);
    expect((await transcribe(base, {}, {})).status).toBe(401);
    expect(engine.reached()).toBe(false);
  });

  test("refuses missing, over-size or unsupported audio without asking the engine", async () => {
    const engine = startStubEngine(() => Response.json(TRANSCRIPT));
    const { base } = await boot(engine.baseUrl);
    const oversize = "A".repeat(Math.ceil((10 * 1024 * 1024) / 3) * 4 + 4);
    expect((await transcribe(base, { audio: "" })).status).toBe(400);
    expect((await transcribe(base, { audio: oversize })).status).toBe(400);
    expect((await transcribe(base, { format: "opus" })).status).toBe(400);
    expect(engine.reached()).toBe(false);
  });

  test("passes the engine's refusals through with their status and message", async () => {
    const cases: Array<[number, string, number, string]> = [
      [400, "The audio must be base64: the raw bytes, not a data URL.", 400, "transcription_invalid"],
      [503, "Connect Redrob to transcribe speech", 503, "redrob_not_connected"],
      [502, "The Redrob gateway answered 402: Out of credit.", 502, "transcription_failed"],
      [504, "Transcription timed out.", 504, "transcription_failed"],
    ];
    for (const [status, message, expected, code] of cases) {
      const engine = startStubEngine(() => Response.json({ _tag: "Error", message }, { status }));
      const { base } = await boot(engine.baseUrl);
      const response = await transcribe(base, {});
      expect(response.status).toBe(expected);
      expect(await response.json()).toMatchObject({ code, message });
    }
  });

  test("is off at High and Strict privacy, without sending the recording, and back on at Standard", async () => {
    const engine = startStubEngine(() => Response.json(TRANSCRIPT));
    const { base, config } = await boot(engine.baseUrl);
    for (const level of ["high", "strict"]) {
      await writeRedrobWorkspaceConfig(config, "ws_1", (current) => ({ ...current, deskPrivacy: { level } }));
      const response = await transcribe(base, {});
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "voice_off_for_privacy" });
    }
    expect(engine.reached()).toBe(false);

    await writeRedrobWorkspaceConfig(config, "ws_1", (current) => ({ ...current, deskPrivacy: { level: "standard" } }));
    expect((await transcribe(base, {})).status).toBe(200);
  });

  test("needs a workspace, since privacy is per workspace", async () => {
    const engine = startStubEngine(() => Response.json(TRANSCRIPT));
    const { base } = await boot(engine.baseUrl);
    expect((await transcribe(base, { workspaceId: "" })).status).toBe(400);
    expect(engine.reached()).toBe(false);
  });

  test("an engine answer without a transcript is a 502", async () => {
    const engine = startStubEngine(() => Response.json({ ok: true }));
    const { base } = await boot(engine.baseUrl);
    const response = await transcribe(base, {});
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "transcription_failed" });
  });
});
