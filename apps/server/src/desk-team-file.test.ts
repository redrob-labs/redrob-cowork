import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LOCKED_MEMORY_TAG, isLockedMemory } from "./local-memory-store.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";
import { redrobAfterImport, touchesPrivacyLock } from "./team-lock.js";
import { buildWorkspaceImportPreview } from "./workspace-import-preview.js";

const dirs: string[] = [];
const saved = { db: process.env.REDROB_RUNTIME_DB, data: process.env.REDROB_DATA_DIR, scheduler: process.env.REDROB_DISABLE_SCHEDULER };

afterEach(async () => {
  for (const [key, value] of [["REDROB_RUNTIME_DB", saved.db], ["REDROB_DATA_DIR", saved.data], ["REDROB_DISABLE_SCHEDULER", saved.scheduler]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // Windows keeps the open runtime database locked; a leftover temp dir is not a failure.
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

async function temp(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function serverConfig(workspace: string, dataDir: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: "test-token",
    hostToken: "host-token",
    configPath: join(dataDir, "config.json"),
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: [],
    workspaces: [{ id: "workspace", name: "workspace", path: workspace, preset: "default", workspaceType: "local" }],
    authorizedRoots: [workspace],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
}

async function startTeamServer() {
  const workspace = await temp("redrob-team-lock-ws-");
  const dataDir = await temp("redrob-team-lock-data-");
  process.env.REDROB_DATA_DIR = dataDir;
  process.env.REDROB_RUNTIME_DB = join(dataDir, "runtime.sqlite");
  process.env.REDROB_DISABLE_SCHEDULER = "1";
  const server = (await startServer(serverConfig(workspace, dataDir))) as { port: number; stop: (force?: boolean) => void };
  const base = `http://127.0.0.1:${server.port}`;
  // The desktop app holds an owner token like this one; a shared workspace hands out the collaborator one.
  const issued = await fetch(`${base}/tokens`, {
    method: "POST",
    headers: { "X-Redrob-Host-Token": "host-token", "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "owner" }),
  });
  const ownerToken = ((await issued.json()) as { token: string }).token;
  const as = (token: string) => (method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { server, collaborator: as("test-token"), owner: as(ownerToken) };
}

describe("team file notes", () => {
  test("a note tagged from a team file is locked", () => {
    expect(isLockedMemory({ tags: ["desk-scope:team", LOCKED_MEMORY_TAG] })).toBe(true);
    expect(isLockedMemory({ tags: ["desk-scope:team"] })).toBe(false);
    expect(isLockedMemory({ tags: null })).toBe(false);
  });

  test("the server refuses to change or forget a locked note, and changes an ordinary one", async () => {
    const { server, collaborator, owner } = await startTeamServer();
    try {
      const idOf = async (response: Response) => ((await response.json()) as { memory: { id: string } }).memory.id;
      // Locked notes come from a team file, which only the owner applies.
      const locked = await idOf(await owner("POST", "/memory", { content: "House style", tags: ["desk-scope:team", LOCKED_MEMORY_TAG] }));
      const own = await idOf(await collaborator("POST", "/memory", { content: "House style", tags: ["desk-scope:you"] }));
      expect((await collaborator("PATCH", `/memory/${locked}`, { content: "Changed" })).status).toBe(403);
      expect((await collaborator("DELETE", `/memory/${locked}`)).status).toBe(403);
      expect((await collaborator("PATCH", `/memory/${own}`, { content: "Changed" })).status).toBe(200);
      expect((await collaborator("DELETE", `/memory/${own}`)).status).toBe(200);
    } finally {
      server.stop(true);
    }
  });
});

describe("team locks belong to the owner", () => {
  test("which config changes touch a lock", () => {
    const locked = { deskPrivacy: { level: "high", names: [], setBy: "Park", locked: true } };
    expect(touchesPrivacyLock({}, { deskPrivacy: { level: "high" } })).toBe(false);
    expect(touchesPrivacyLock({}, { deskPrivacy: { level: "high", locked: true } })).toBe(true);
    expect(touchesPrivacyLock(locked, { ...locked, other: 1 })).toBe(false);
    // Same setting, keys in another order: not a change.
    expect(touchesPrivacyLock(locked, { deskPrivacy: { locked: true, setBy: "Park", names: [], level: "high" } })).toBe(false);
    expect(touchesPrivacyLock(locked, { deskPrivacy: { ...locked.deskPrivacy, level: "off" } })).toBe(true);
    expect(touchesPrivacyLock(locked, {})).toBe(true);
    expect(redrobAfterImport(locked, { redrob: { x: 1 } })).toEqual({ ...locked, x: 1 });
    expect(redrobAfterImport(locked, { redrob: { x: 1 }, mode: { redrob: "replace" } })).toEqual({ x: 1 });
    expect(redrobAfterImport(locked, {})).toBe(locked);
  });

  test("a collaborator cannot add, tag or remove a locked note; the owner can add and remove one", async () => {
    const { server, collaborator, owner } = await startTeamServer();
    try {
      const note = { content: "House style", tags: ["desk-scope:team", LOCKED_MEMORY_TAG] };
      expect((await collaborator("POST", "/memory", note)).status).toBe(403);
      const created = await owner("POST", "/memory", note);
      expect(created.status).toBe(201);
      const lockedId = ((await created.json()) as { memory: { id: string } }).memory.id;

      const own = await collaborator("POST", "/memory", { content: "Mine", tags: ["desk-scope:you"] });
      const ownId = ((await own.json()) as { memory: { id: string } }).memory.id;
      expect((await collaborator("PATCH", `/memory/${ownId}`, { tags: [LOCKED_MEMORY_TAG] })).status).toBe(403);

      expect((await collaborator("DELETE", `/memory/${lockedId}`)).status).toBe(403);
      // Nobody edits a locked note in place; it changes with a new team file.
      expect((await owner("PATCH", `/memory/${lockedId}`, { content: "Changed" })).status).toBe(403);
      expect((await owner("DELETE", `/memory/${lockedId}`)).status).toBe(200);
    } finally {
      server.stop(true);
    }
  });

  test("a collaborator cannot set, lift or change a locked privacy level, by config or by import", async () => {
    const { server, collaborator, owner } = await startTeamServer();
    try {
      const lock = { deskPrivacy: { level: "high", names: [], setBy: "Park", locked: true } };
      expect((await collaborator("PATCH", "/workspace/workspace/config", { redrob: lock })).status).toBe(403);
      // An unlocked level stays the person's own to change.
      expect((await collaborator("PATCH", "/workspace/workspace/config", { redrob: { deskPrivacy: { level: "strict" } } })).status).toBe(200);
      expect((await owner("PATCH", "/workspace/workspace/config", { redrob: lock })).status).toBe(200);

      expect((await collaborator("PATCH", "/workspace/workspace/config", { redrob: { deskPrivacy: { level: "off" } } })).status).toBe(403);
      // Other settings still change under a lock.
      expect((await collaborator("PATCH", "/workspace/workspace/config", { redrob: { theme: "dark" } })).status).toBe(200);

      expect((await collaborator("POST", "/workspace/workspace/import", { redrob: { deskPrivacy: { level: "off" } } })).status).toBe(403);
      expect((await collaborator("POST", "/workspace/workspace/import", { redrob: { theme: "light" }, mode: { redrob: "replace" } })).status).toBe(403);
      const config = (await (await owner("GET", "/workspace/workspace/config")).json()) as { redrob: Record<string, unknown> };
      expect(config.redrob.deskPrivacy).toEqual(lock.deskPrivacy);
    } finally {
      server.stop(true);
    }
  });
});

describe("import preview", () => {
  test("the redrob config before the import is the stored one, not the legacy file", async () => {
    const workspace = await temp("redrob-team-preview-");
    await mkdir(join(workspace, ".opencode"), { recursive: true });
    const stored = { deskPrivacy: { level: "high" }, team: { notes: [] } };
    const same = await buildWorkspaceImportPreview(workspace, { redrob: stored }, { readStoredRedrob: async () => stored });
    expect(same.changes.find((change) => change.kind === "redrob")?.action).toBe("unchanged");
    const changed = await buildWorkspaceImportPreview(workspace, { redrob: { deskPrivacy: { level: "strict" } } }, { readStoredRedrob: async () => stored });
    expect(changed.changes.find((change) => change.kind === "redrob")?.action).not.toBe("unchanged");
  });
});
