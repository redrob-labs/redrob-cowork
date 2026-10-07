import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const stops: Array<() => void | Promise<void>> = [];
const roots: string[] = [];
const ENV_KEYS = ["OPENCODE_DB", "REDROB_DATA_DIR", "REDROB_RUNTIME_DB"];
const savedEnv = new Map<string, string | undefined>();

beforeEach(async () => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
  delete process.env.REDROB_RUNTIME_DB;
  // recordAudit writes under REDROB_DATA_DIR; keep it out of the real profile.
  process.env.REDROB_DATA_DIR = await tempRoot();
});

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // On Windows the runtime DB and reload watchers can still hold files right after stop; a leftover
  // temp dir is not a test failure.
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }).catch(() => undefined);
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "redrob-project-ws-"));
  roots.push(root);
  return root;
}

async function workspaceRoot() {
  const root = await tempRoot();
  await mkdir(join(root, ".opencode"), { recursive: true });
  return root;
}

const headers = {
  Authorization: "Bearer owt_test_token",
  "X-Redrob-Host-Token": "owt_host_token",
  "Content-Type": "application/json",
};

async function startRedrob(input: { workspaces: WorkspaceInfo[]; configPath: string; opencodeBaseUrl?: string }) {
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: "owt_test_token",
    hostToken: "owt_host_token",
    configPath: input.configPath,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: input.workspaces.map((workspace) => ({
      ...workspace,
      ...(input.opencodeBaseUrl ? { baseUrl: input.opencodeBaseUrl } : {}),
    })),
    authorizedRoots: input.workspaces.map((workspace) => workspace.path),
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  };
  const server = await startServer(config) as Served;
  stops.push(() => server.stop(true));
  return `http://127.0.0.1:${server.port}`;
}

function localWorkspace(id: string, path: string): WorkspaceInfo {
  return { id, name: id, path, preset: "starter", workspaceType: "local" };
}

// Stand-in for the engine: ses_1 lives in the directory it is asked from, `targetRoot` is its own
// git project, every other directory is the engine's "global" project.
function startMockEngine(input: { targetRoot: string; targetProjectId: string; rejectMove?: boolean }) {
  const moves: unknown[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const directory = request.headers.get("x-redrob-directory");
      if (url.pathname === "/session/ses_1" && request.method === "GET") {
        return Response.json({
          id: "ses_1",
          title: "Chat",
          slug: "tidy-knight",
          projectID: "global",
          directory,
          time: { created: 1, updated: 1 },
        });
      }
      if (url.pathname === "/project/current") {
        return Response.json({
          id: directory === input.targetRoot ? input.targetProjectId : "global",
          worktree: directory,
          time: { created: 1, updated: 1 },
          sandboxes: [],
        });
      }
      if (url.pathname === "/experimental/control-plane/move-session" && request.method === "POST") {
        moves.push(await request.json());
        if (input.rejectMove) {
          return Response.json({ name: "MoveSessionError", data: { message: "nope" } }, { status: 400 });
        }
        return new Response(null, { status: 204 });
      }
      return Response.json({ code: "not_found", message: "Not found" }, { status: 404 });
    },
  }) as Served;
  stops.push(() => server.stop(true));
  return { baseUrl: `http://127.0.0.1:${server.port}`, moves };
}

async function createEngineDb(): Promise<string> {
  const dbPath = join(await tempRoot(), "redrob.db");
  const db = new Database(dbPath);
  db.exec(`
    create table project (id text primary key, worktree text not null, time_created integer not null, time_updated integer not null, sandboxes text not null);
    create table session (id text primary key, project_id text not null, slug text not null, directory text not null, path text, title text not null, version text not null, time_created integer not null, time_updated integer not null);
    insert into project values ('global', '/', 1, 1, '[]');
    insert into project values ('proj_b', 'b', 1, 1, '[]');
    insert into session values ('ses_1', 'global', 'tidy-knight', 'a', 'a', 'Chat', '0.1.0', 1, 1);
  `);
  db.close();
  return dbPath;
}

function sessionProjectId(dbPath: string): unknown {
  const db = new Database(dbPath, { readonly: true });
  const row = db.query("select project_id from session where id = 'ses_1'").get();
  db.close();
  return row;
}

async function setupMove(options?: { rejectMove?: boolean; targetProjectId?: string }) {
  const sourceRoot = await workspaceRoot();
  const targetRoot = await workspaceRoot();
  const engine = startMockEngine({
    targetRoot,
    targetProjectId: options?.targetProjectId ?? "proj_b",
    rejectMove: options?.rejectMove,
  });
  const dbPath = await createEngineDb();
  process.env.OPENCODE_DB = dbPath;
  const base = await startRedrob({
    configPath: join(await tempRoot(), "server.json"),
    workspaces: [localWorkspace("ws_1", sourceRoot), localWorkspace("ws_2", targetRoot)],
    opencodeBaseUrl: engine.baseUrl,
  });
  const move = (workspaceId: string, sessionId: string, body: unknown) =>
    fetch(`${base}/workspace/${workspaceId}/sessions/${sessionId}/move`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  return { engine, dbPath, targetRoot, move };
}

describe("POST /workspace/:id/sessions/:sessionId/move", () => {
  test("re-points the project, then asks the engine to move the session into the target directory", async () => {
    const { engine, dbPath, targetRoot, move } = await setupMove();

    const response = await move("ws_1", "ses_1", { targetWorkspaceId: "ws_2" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, session: { id: "ses_1", workspaceId: "ws_2" } });
    expect(engine.moves).toEqual([{ sessionID: "ses_1", destination: { directory: targetRoot } }]);
    expect(sessionProjectId(dbPath)).toEqual({ project_id: "proj_b" });
  });

  test("leaves the database alone when both workspaces are in the same engine project", async () => {
    const { engine, dbPath, move } = await setupMove({ targetProjectId: "global" });

    const response = await move("ws_1", "ses_1", { targetWorkspaceId: "ws_2" });

    expect(response.status).toBe(200);
    expect(engine.moves).toHaveLength(1);
    expect(sessionProjectId(dbPath)).toEqual({ project_id: "global" });
  });

  test("rolls the project back when the engine refuses the move", async () => {
    const { dbPath, move } = await setupMove({ rejectMove: true });

    const response = await move("ws_1", "ses_1", { targetWorkspaceId: "ws_2" });

    expect(response.status).toBe(409);
    expect(((await response.json()) as { code?: string }).code).toBe("session_move_failed");
    expect(sessionProjectId(dbPath)).toEqual({ project_id: "global" });
  });

  test("rejects bad input before touching the engine", async () => {
    const { engine, dbPath, move } = await setupMove();

    expect((await move("ws_1", "ses_1", {})).status).toBe(400);
    expect((await move("ws_1", "ses_1", { targetWorkspaceId: 42 })).status).toBe(400);
    expect((await move("ws_1", "ses_1", { targetWorkspaceId: "ws_1" })).status).toBe(400);
    expect((await move("ws_1", "ses_1", { targetWorkspaceId: "ws_missing" })).status).toBe(404);
    expect((await move("ws_missing", "ses_1", { targetWorkspaceId: "ws_2" })).status).toBe(404);
    expect((await move("ws_1", "ses_missing", { targetWorkspaceId: "ws_2" })).status).toBe(404);

    expect(engine.moves).toEqual([]);
    expect(sessionProjectId(dbPath)).toEqual({ project_id: "global" });
  });
});

describe("POST /workspaces/personal", () => {
  test("creates the Personal workspace under the data dir once, without stealing the active workspace", async () => {
    const configDir = await tempRoot();
    const configPath = join(configDir, "server.json");
    const base = await startRedrob({ configPath, workspaces: [localWorkspace("ws_1", await workspaceRoot())] });
    const ensure = () => fetch(`${base}/workspaces/personal`, { method: "POST", headers });

    const first = await ensure();
    expect(first.status).toBe(201);
    const created = (await first.json()) as { activeId: string; workspace: WorkspaceInfo };
    expect(created.activeId).toBe("ws_1");
    expect(created.workspace.kind).toBe("personal");
    expect(created.workspace.name).toBe("Personal");
    // No REDROB_RUNTIME_DB, so runtime storage is the config file's directory.
    expect(created.workspace.path).toBe(join(configDir, "personal"));
    expect(existsSync(created.workspace.path)).toBe(true);

    const second = await ensure();
    expect(second.status).toBe(200);
    const again = (await second.json()) as { activeId: string; workspace: WorkspaceInfo };
    expect(again.workspace.id).toBe(created.workspace.id);
    expect(again.activeId).toBe("ws_1");

    const list = (await (await fetch(`${base}/workspaces`, { headers })).json()) as {
      activeId: string;
      items: WorkspaceInfo[];
    };
    expect(list.activeId).toBe("ws_1");
    expect(list.items.map((item) => [item.id, item.kind])).toEqual([
      ["ws_1", undefined],
      [created.workspace.id, "personal"],
    ]);

    const persisted = JSON.parse(await readFile(configPath, "utf8")) as { workspaces: Array<{ id: string; kind?: string }> };
    expect(persisted.workspaces.find((entry) => entry.id === created.workspace.id)?.kind).toBe("personal");
  });

  test("becomes the active workspace when there is no other", async () => {
    const base = await startRedrob({ configPath: join(await tempRoot(), "server.json"), workspaces: [] });

    const response = await fetch(`${base}/workspaces/personal`, { method: "POST", headers });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { activeId: string; workspace: WorkspaceInfo };
    expect(body.activeId).toBe(body.workspace.id);
  });
});
