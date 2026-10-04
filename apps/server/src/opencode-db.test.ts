import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Database } from "bun:sqlite";

import { resolveOpencodeDbPath, seedOpencodeSessionMessages, setOpencodeSessionProject } from "./opencode-db.js";

async function createDb(): Promise<{ path: string; dispose: () => void }> {
  const dir = await mkdtemp(join(tmpdir(), "redrob-opencode-db-"));
  await mkdir(dir, { recursive: true });
  const dbPath = join(dir, "opencode-test.db");
  const db = new Database(dbPath);
  db.exec(`
    create table session (
      id text primary key,
      time_updated integer
    );
    create table message (
      id text primary key,
      session_id text not null,
      time_created integer,
      time_updated integer,
      data text not null
    );
    create table part (
      id text primary key,
      message_id text not null,
      session_id text not null,
      time_created integer,
      time_updated integer,
      data text not null
    );
    insert into session (id, time_updated) values ('ses_test123', 1);
  `);
  db.close();
  return {
    path: dbPath,
    dispose: () => new Database(dbPath).close(),
  };
}

// opencode-db selects its sqlite driver at call time: bun:sqlite under Bun
// (better-sqlite3's N-API binding panics the Bun runtime), better-sqlite3
// under Node/Electron. Under bun test the bun:sqlite path is always
// available, so these tests run unconditionally.
describe("seedOpencodeSessionMessages", () => {
  test("writes seeded transcript messages into the OpenCode db", async () => {
    const fixture = await createDb();
    const result = seedOpencodeSessionMessages({
      dbPath: fixture.path,
      sessionId: "ses_test123",
      workspaceRoot: "/tmp/workspace",
      now: 1700000000000,
      messages: [
        { role: "assistant", text: "Welcome" },
        { role: "user", text: "Help me start" },
        { role: "assistant", text: "Sure" },
      ],
    });

    expect(result).toEqual({ inserted: 3, skipped: false });

    const db = new Database(fixture.path, { readonly: true });
    const rows = db.query("select id, session_id, data from message order by time_created asc").all() as Array<{
      id: string;
      session_id: string;
      data: string;
    }>;
    const parts = db.query("select data from part order by time_created asc").all() as Array<{ data: string }>;
    const session = db.query("select time_updated from session where id = 'ses_test123'").get() as { time_updated: number };
    db.close();

    const decoded = rows.map((row) => JSON.parse(row.data) as Record<string, unknown>);
    expect(decoded[0]?.role).toBe("assistant");
    expect(decoded[0]?.parentID).toBe(rows[0]?.id);
    expect(decoded[0]?.modelID).toBe("auto");
    expect(decoded[0]?.providerID).toBe("redrob");
    expect(decoded[1]?.role).toBe("user");
    expect(decoded[1]?.summary).toEqual({ diffs: [] });
    expect(decoded[2]?.role).toBe("assistant");
    expect(decoded[2]?.parentID).toBe(rows[1]?.id);
    expect(parts.map((row) => JSON.parse(row.data))).toEqual([
      { type: "text", text: "Welcome" },
      { type: "text", text: "Help me start" },
      { type: "text", text: "Sure" },
    ]);
    expect(session.time_updated).toBe(1700000000003);
  });

  test("does not seed a session twice", async () => {
    const fixture = await createDb();
    const first = seedOpencodeSessionMessages({
      dbPath: fixture.path,
      sessionId: "ses_test123",
      workspaceRoot: "/tmp/workspace",
      messages: [{ role: "assistant", text: "Welcome" }],
    });
    const second = seedOpencodeSessionMessages({
      dbPath: fixture.path,
      sessionId: "ses_test123",
      workspaceRoot: "/tmp/workspace",
      messages: [{ role: "assistant", text: "Welcome again" }],
    });

    expect(first.skipped).toBe(false);
    expect(second).toEqual({ inserted: 0, skipped: true });
  });
});

describe("resolveOpencodeDbPath", () => {
  test("prefers an existing XDG opencode.db when present", async () => {
    const xdg = await mkdtemp(join(tmpdir(), "redrob-opencode-xdg-"));
    const dir = join(xdg, "opencode");
    const file = join(dir, "opencode.db");
    await mkdir(dir, { recursive: true });
    await writeFile(file, "", "utf8");

    const previousXdg = process.env.XDG_DATA_HOME;
    const previousChannel = process.env.OPENCODE_CHANNEL;
    const previousDb = process.env.OPENCODE_DB;
    try {
      process.env.XDG_DATA_HOME = xdg;
      process.env.OPENCODE_CHANNEL = "local";
      delete process.env.OPENCODE_DB;

      expect(resolveOpencodeDbPath()).toBe(file);
    } finally {
      if (previousXdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previousXdg;
      if (previousChannel === undefined) delete process.env.OPENCODE_CHANNEL;
      else process.env.OPENCODE_CHANNEL = previousChannel;
      if (previousDb === undefined) delete process.env.OPENCODE_DB;
      else process.env.OPENCODE_DB = previousDb;
    }
  });

  test("finds server-managed OpenCode dbs under REDROB_DATA_DIR", async () => {
    const root = await mkdtemp(join(tmpdir(), "redrob-server-data-"));
    const dir = join(root, "redrob-dev-data", "xdg", "data", "opencode");
    const file = join(dir, "opencode.db");
    await mkdir(dir, { recursive: true });
    await writeFile(file, "", "utf8");

    const previousDataDir = process.env.REDROB_DATA_DIR;
    const previousXdg = process.env.XDG_DATA_HOME;
    const previousChannel = process.env.OPENCODE_CHANNEL;
    const previousDb = process.env.OPENCODE_DB;
    try {
      process.env.REDROB_DATA_DIR = root;
      delete process.env.XDG_DATA_HOME;
      process.env.OPENCODE_CHANNEL = "local";
      delete process.env.OPENCODE_DB;

      expect(resolveOpencodeDbPath()).toBe(file);
    } finally {
      if (previousDataDir === undefined) delete process.env.REDROB_DATA_DIR;
      else process.env.REDROB_DATA_DIR = previousDataDir;
      if (previousXdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previousXdg;
      if (previousChannel === undefined) delete process.env.OPENCODE_CHANNEL;
      else process.env.OPENCODE_CHANNEL = previousChannel;
      if (previousDb === undefined) delete process.env.OPENCODE_DB;
      else process.env.OPENCODE_DB = previousDb;
    }
  });

  test("finds legacy OpenCode db layouts under REDROB_DATA_DIR", async () => {
    const root = await mkdtemp(join(tmpdir(), "redrob-legacy-data-"));
    const dir = join(root, "opencode-dev", "ws-test", "xdg", "data", "opencode");
    const file = join(dir, "opencode.db");
    await mkdir(dir, { recursive: true });
    await writeFile(file, "", "utf8");

    const previousDataDir = process.env.REDROB_DATA_DIR;
    const previousXdg = process.env.XDG_DATA_HOME;
    const previousChannel = process.env.OPENCODE_CHANNEL;
    const previousDb = process.env.OPENCODE_DB;
    try {
      process.env.REDROB_DATA_DIR = root;
      delete process.env.XDG_DATA_HOME;
      process.env.OPENCODE_CHANNEL = "local";
      delete process.env.OPENCODE_DB;

      expect(resolveOpencodeDbPath()).toBe(file);
    } finally {
      if (previousDataDir === undefined) delete process.env.REDROB_DATA_DIR;
      else process.env.REDROB_DATA_DIR = previousDataDir;
      if (previousXdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previousXdg;
      if (previousChannel === undefined) delete process.env.OPENCODE_CHANNEL;
      else process.env.OPENCODE_CHANNEL = previousChannel;
      if (previousDb === undefined) delete process.env.OPENCODE_DB;
      else process.env.OPENCODE_DB = previousDb;
    }
  });
});

// The `project` and `session` columns and constraints below are copied from a live engine database
// (redrob.db, engine 0.1.0), trimmed to the NOT NULL columns plus the scoping ones.
async function createEngineDb(dir?: string): Promise<string> {
  const root = dir ?? (await mkdtemp(join(tmpdir(), "redrob-engine-db-")));
  await mkdir(root, { recursive: true });
  const dbPath = join(root, "redrob.db");
  const db = new Database(dbPath);
  db.exec(`
    create table project (
      id text primary key,
      worktree text not null,
      vcs text,
      time_created integer not null,
      time_updated integer not null,
      sandboxes text not null
    );
    create table session (
      id text primary key,
      project_id text not null,
      workspace_id text,
      parent_id text,
      slug text not null,
      directory text not null,
      path text,
      title text not null,
      version text not null,
      time_created integer not null,
      time_updated integer not null,
      constraint fk_session_project_id_project_id_fk foreign key (project_id) references project(id) on delete cascade
    );
    insert into project values ('global', '/', null, 1, 1, '[]');
    insert into project values ('b464b781', 'C:/repo', 'git', 1, 1, '[]');
    insert into session (id, project_id, slug, directory, path, title, version, time_created, time_updated)
      values ('ses_move1', 'global', 'tidy-knight', 'C:/plain', 'plain', 'Chat', '0.1.0', 1, 1);
  `);
  db.close();
  return dbPath;
}

function readSessionRow(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  const row = db.query("select project_id, directory, path from session where id = 'ses_move1'").get();
  db.close();
  return row;
}

describe("setOpencodeSessionProject", () => {
  test("re-points only project_id and returns the previous one for rollback", async () => {
    const dbPath = await createEngineDb();

    const result = setOpencodeSessionProject({ dbPath, sessionId: "ses_move1", projectId: "b464b781" });

    expect(result).toEqual({ dbPath, previousProjectId: "global" });
    // directory and path stay for the engine's own move to re-derive.
    expect(readSessionRow(dbPath)).toEqual({ project_id: "b464b781", directory: "C:/plain", path: "plain" });

    setOpencodeSessionProject({ dbPath, sessionId: "ses_move1", projectId: "global" });
    expect(readSessionRow(dbPath)).toEqual({ project_id: "global", directory: "C:/plain", path: "plain" });
  });

  test("returns null when no database holds the session", async () => {
    const dbPath = await createEngineDb();
    expect(setOpencodeSessionProject({ dbPath, sessionId: "ses_missing", projectId: "b464b781" })).toBeNull();
  });

  test("refuses a project the engine has no row for and leaves the session unchanged", async () => {
    const dbPath = await createEngineDb();
    expect(() => setOpencodeSessionProject({ dbPath, sessionId: "ses_move1", projectId: "proj_unknown" })).toThrow(
      "OpenCode project not found: proj_unknown",
    );
    expect(readSessionRow(dbPath)).toEqual({ project_id: "global", directory: "C:/plain", path: "plain" });
  });

  test("finds the engine's own redrob.db under XDG_DATA_HOME", async () => {
    const xdg = await mkdtemp(join(tmpdir(), "redrob-engine-xdg-"));
    const dbPath = await createEngineDb(join(xdg, "redrob"));
    const previousXdg = process.env.XDG_DATA_HOME;
    const previousDb = process.env.OPENCODE_DB;
    try {
      process.env.XDG_DATA_HOME = xdg;
      delete process.env.OPENCODE_DB;

      expect(setOpencodeSessionProject({ sessionId: "ses_move1", projectId: "b464b781" })).toEqual({
        dbPath,
        previousProjectId: "global",
      });
    } finally {
      if (previousXdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previousXdg;
      if (previousDb === undefined) delete process.env.OPENCODE_DB;
      else process.env.OPENCODE_DB = previousDb;
    }
  });
});
