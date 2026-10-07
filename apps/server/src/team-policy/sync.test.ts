import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRedrobWorkspaceConfig } from "../redrob-workspace-config-store.js";
import { extractRedrobEngineKey } from "../redrob-auth.js";
import { listMemories } from "../local-memory-store.js";
import { startServer } from "../server.js";
import type { ServerConfig } from "../types.js";
import { readTeamPolicyState, TEST_KEYS } from "./index.js";
import {
  describeTeamPolicySync,
  readTeamPolicySync,
  syncTeamPolicy,
  teamPolicyConsoleBaseUrl,
  TEAM_POLICY_STALE_AFTER_MS,
  type TeamPolicyFetch,
} from "./sync.js";
import { samplePolicy, signTestPolicy } from "./test-signer.js";

/*
 * Team policy sync against a stand-in console. The stand-in answers the way redrob-console's
 * `GET /v1/team-policy/signed` and `POST /v1/team-policy/applied` do (K2), and records what it was
 * sent, so each test can say what the device asked for and what it reported.
 */

const dirs: string[] = [];
const saved = {
  REDROB_RUNTIME_DB: process.env.REDROB_RUNTIME_DB,
  REDROB_DATA_DIR: process.env.REDROB_DATA_DIR,
  REDROB_DISABLE_SCHEDULER: process.env.REDROB_DISABLE_SCHEDULER,
};

async function temp(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

let config: ServerConfig;
let workspace: { id: string; path: string };

beforeEach(async () => {
  const path = await temp("redrob-team-sync-ws-");
  const dataDir = await temp("redrob-team-sync-data-");
  process.env.REDROB_DATA_DIR = dataDir;
  process.env.REDROB_RUNTIME_DB = join(dataDir, "runtime.sqlite");
  process.env.REDROB_DISABLE_SCHEDULER = "1";
  workspace = { id: "workspace", path };
  config = {
    host: "127.0.0.1",
    port: 0,
    token: "test-token",
    hostToken: "host-token",
    configPath: join(dataDir, "config.json"),
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: [],
    workspaces: [{ id: "workspace", name: "workspace", path, preset: "default", workspaceType: "local" }],
    authorizedRoots: [path],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
});

afterEach(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

type Answer = { status: number; body?: unknown } | "network-error";

function standInConsole(answers: Answer[]) {
  const requests: Array<{ url: string; method: string; auth: string | null; body: unknown }> = [];
  const fetchImpl: TeamPolicyFetch = async (url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const auth = new Headers(init?.headers).get("authorization");
    requests.push({ url, method: init?.method ?? "GET", auth, body });
    if (url.endsWith("/team-policy/applied")) return Response.json({ recorded: true });
    const answer = answers.shift() ?? { status: 500 };
    if (answer === "network-error") throw new TypeError("fetch failed");
    return answer.body === undefined
      ? new Response(null, { status: answer.status })
      : Response.json(answer.body, { status: answer.status });
  };
  return { fetchImpl, requests, fetches: () => requests.filter((r) => r.url.includes("/signed")), reports: () => requests.filter((r) => r.url.endsWith("/applied")) };
}

const deps = (fetchImpl: TeamPolicyFetch, key: string | null = "rrk_test_device_key") => ({
  readKey: async () => key,
  fetchImpl,
  baseUrl: "https://console.test/api/backend/v1",
  keys: TEST_KEYS,
});

const signed = async (version: number, overrides = {}) => ({
  status: 200,
  body: { version, jws: await signTestPolicy(samplePolicy({ version, ...overrides })) },
});

const privacy = async () => (await readRedrobWorkspaceConfig(config, workspace.id)).deskPrivacy as Record<string, unknown>;
const teamNotes = async () => (await listMemories(config)).filter((memory) => memory.tags?.includes("team-policy"));

describe("following the team policy from the console", () => {
  test("joining fetches, applies and reports the policy; the next check asks only for something newer", async () => {
    const console = standInConsole([await signed(1), { status: 304 }]);
    const joined = await syncTeamPolicy(config, workspace, deps(console.fetchImpl), { join: true });
    expect(joined).toEqual({ status: "applied", version: 1 });
    expect(console.fetches()[0]).toMatchObject({
      url: "https://console.test/api/backend/v1/team-policy/signed?after=0",
      auth: "Bearer rrk_test_device_key",
    });
    const state = await readTeamPolicyState(config, workspace.id);
    expect(state).toMatchObject({ accountId: "acc_vectors", version: 1, left: false });
    expect(console.reports()).toEqual([
      expect.objectContaining({ body: { version: 1, ok: true, payloadSha256: state!.payloadSha256 } }),
    ]);
    expect(await privacy()).toMatchObject({ level: "high", locked: true });

    const again = await syncTeamPolicy(config, workspace, deps(console.fetchImpl));
    expect(again).toEqual({ status: "unchanged", version: 1 });
    expect(console.fetches()[1]!.url).toEndWith("?after=1");
    // An unchanged policy is not re-reported.
    expect(console.reports()).toHaveLength(1);
    expect((await readTeamPolicySync(config, workspace.id))?.status).toBe("unchanged");
  });

  test("a workspace that has not joined is never checked", async () => {
    const console = standInConsole([await signed(1)]);
    expect(await syncTeamPolicy(config, workspace, deps(console.fetchImpl))).toEqual({ status: "not_joined" });
    expect(console.requests).toHaveLength(0);
  });

  test("without a Redrob Key nothing is fetched and nothing changes", async () => {
    const console = standInConsole([await signed(1)]);
    await syncTeamPolicy(config, workspace, deps(console.fetchImpl), { join: true });
    const noKey = standInConsole([await signed(2)]);
    expect(await syncTeamPolicy(config, workspace, deps(noKey.fetchImpl, null))).toEqual({ status: "not_connected" });
    expect(noKey.requests).toHaveLength(0);
    expect((await readTeamPolicyState(config, workspace.id))?.version).toBe(1);
    expect(await privacy()).toMatchObject({ locked: true });
  });

  test("a policy that does not verify is refused and reported, and the workspace keeps what it had", async () => {
    const good = standInConsole([await signed(1)]);
    await syncTeamPolicy(config, workspace, deps(good.fetchImpl), { join: true });

    const v2 = await signTestPolicy(samplePolicy({ version: 2, privacy: { ...samplePolicy().privacy, locked: false } }));
    const [header, payload] = v2.split(".");
    const forged = `${header}.${payload}.${(await signTestPolicy(samplePolicy())).split(".")[2]}`;
    const bad = standInConsole([{ status: 200, body: { version: 2, jws: forged } }]);

    expect(await syncTeamPolicy(config, workspace, deps(bad.fetchImpl))).toEqual({
      status: "refused",
      code: "team_policy_bad_signature",
      version: 2,
    });
    expect(bad.reports()[0]!.body).toEqual({ version: 2, ok: false, code: "team_policy_bad_signature" });
    expect((await readTeamPolicyState(config, workspace.id))?.version).toBe(1);
    expect(await privacy()).toMatchObject({ locked: true });
  });

  test("a policy for another team is refused while this workspace follows one", async () => {
    const first = standInConsole([await signed(1)]);
    await syncTeamPolicy(config, workspace, deps(first.fetchImpl), { join: true });
    const other = standInConsole([await signed(5, { accountId: "acc_other" })]);
    expect(await syncTeamPolicy(config, workspace, deps(other.fetchImpl))).toMatchObject({
      status: "refused",
      code: "team_policy_other_team",
    });
    expect((await readTeamPolicyState(config, workspace.id))?.accountId).toBe("acc_vectors");
  });

  test("when the console stops accepting the key, the workspace leaves the team", async () => {
    const console = standInConsole([await signed(1), { status: 401, body: { message: "owner is no longer a member" } }]);
    await syncTeamPolicy(config, workspace, deps(console.fetchImpl), { join: true });
    expect(await teamNotes()).toHaveLength(1);

    expect(await syncTeamPolicy(config, workspace, deps(console.fetchImpl))).toEqual({ status: "removed" });
    expect(await readTeamPolicyState(config, workspace.id)).toMatchObject({ left: true, version: 1 });
    expect(await teamNotes()).toHaveLength(0);
    // The lock is lifted, but the level the team set stays: leaving never silently lowers protection.
    expect(await privacy()).toMatchObject({ locked: false, level: "high" });
  });

  test("a console that cannot be reached changes nothing, and goes stale after a week", async () => {
    let clock = Date.parse("2026-10-06T00:00:00Z");
    const now = () => clock;
    const console = standInConsole([await signed(1), "network-error", { status: 502 }]);
    await syncTeamPolicy(config, workspace, { ...deps(console.fetchImpl), now }, { join: true });

    clock += 60_000;
    expect(await syncTeamPolicy(config, workspace, { ...deps(console.fetchImpl), now })).toEqual({ status: "unreachable" });
    expect(await syncTeamPolicy(config, workspace, { ...deps(console.fetchImpl), now })).toEqual({ status: "unreachable" });
    expect(await privacy()).toMatchObject({ locked: true });

    const record = await readTeamPolicySync(config, workspace.id);
    expect(describeTeamPolicySync(record, clock).stale).toBe(false);
    expect(describeTeamPolicySync(record, clock + TEAM_POLICY_STALE_AFTER_MS + 1).stale).toBe(true);
    expect(record?.lastSuccessAt).toBe(Date.parse("2026-10-06T00:00:00Z"));
  });

  test("joining a team that has published nothing joins nothing", async () => {
    const console = standInConsole([{ status: 404, body: { message: "This workspace has no team policy" } }]);
    expect(await syncTeamPolicy(config, workspace, deps(console.fetchImpl), { join: true })).toEqual({ status: "no_policy" });
    expect(await readTeamPolicyState(config, workspace.id)).toBeNull();
  });

  test("only a development build may point at another console", () => {
    const local = "http://127.0.0.1:3001/v1";
    expect(teamPolicyConsoleBaseUrl({ REDROB_CONSOLE_API_URL: local })).toBe("https://console.redrob.ai/api/backend/v1");
    expect(teamPolicyConsoleBaseUrl({ REDROB_CONSOLE_API_URL: local, REDROB_DEV_MODE: "1" })).toBe(local);
  });

  test("the key is read from the engine's report, never the 'public' sentinel", () => {
    const report = (entry: Record<string, unknown>) => ({ all: [{ id: "redrob", ...entry }] });
    expect(extractRedrobEngineKey(report({ source: "api", key: "rrk_a_b", options: {} }))).toBe("rrk_a_b");
    expect(extractRedrobEngineKey(report({ source: "api", options: { apiKey: "public" } }))).toBeNull();
    expect(extractRedrobEngineKey(report({ source: "config", options: {} }))).toBeNull();
    expect(extractRedrobEngineKey({ all: [] })).toBeNull();
  });
});

describe("the sync route", () => {
  test("joining needs the owner scope; without a Redrob Key it reports not_connected", async () => {
    const server = (await startServer(config)) as { port: number; stop: (force?: boolean) => void };
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const issued = await fetch(`${base}/tokens`, {
        method: "POST",
        headers: { "X-Redrob-Host-Token": "host-token", "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "owner" }),
      });
      const owner = ((await issued.json()) as { token: string }).token;
      const post = (token: string) =>
        fetch(`${base}/workspace/workspace/team-policy/sync`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ join: true }),
        });

      expect((await post("test-token")).status).toBe(403);
      const response = await post(owner);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, any>;
      expect(body.outcome).toEqual({ status: "not_connected" });
      expect(body).toMatchObject({ joined: false, sync: { status: "not_connected", stale: true } });
    } finally {
      server.stop(true);
    }
  });
});
