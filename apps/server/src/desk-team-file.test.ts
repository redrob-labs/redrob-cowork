import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LOCKED_MEMORY_TAG, isLockedMemory, saveMemory } from "./local-memory-store.js";
import { writeRedrobWorkspaceConfig } from "./redrob-workspace-config-store.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";
import { redrobAfterImport, setsPrivacyLock, touchesPrivacyLock } from "./team-lock.js";
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
  const config = serverConfig(workspace, dataDir);
  const server = (await startServer(config)) as { port: number; stop: (force?: boolean) => void };
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
  // A lock left on disk by an earlier build's team file: no route sets one any more.
  const legacyNote = async (content: string) => (await saveMemory(config, { content, tags: ["desk-scope:team", LOCKED_MEMORY_TAG] })).id;
  const legacyPrivacyLock = (privacy: Record<string, unknown>) =>
    writeRedrobWorkspaceConfig(config, "workspace", (current) => ({ ...current, deskPrivacy: privacy }));
  return { server, collaborator: as("test-token"), owner: as(ownerToken), legacyNote, legacyPrivacyLock };
}

describe("team file notes", () => {
  test("a note tagged from a team file is locked", () => {
    expect(isLockedMemory({ tags: ["desk-scope:team", LOCKED_MEMORY_TAG] })).toBe(true);
    expect(isLockedMemory({ tags: ["desk-scope:team"] })).toBe(false);
    expect(isLockedMemory({ tags: null })).toBe(false);
  });

  test("the server refuses to change or forget a locked note, and changes an ordinary one", async () => {
    const { server, collaborator, legacyNote } = await startTeamServer();
    try {
      const idOf = async (response: Response) => ((await response.json()) as { memory: { id: string } }).memory.id;
      const locked = await legacyNote("House style");
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

describe("only a signed team policy sets a lock", () => {
  test("which config changes touch a lock, and which set a new one", () => {
    const locked = { deskPrivacy: { level: "high", names: [], setBy: "Park", locked: true } };
    expect(touchesPrivacyLock({}, { deskPrivacy: { level: "high" } })).toBe(false);
    expect(touchesPrivacyLock({}, { deskPrivacy: { level: "high", locked: true } })).toBe(true);
    expect(touchesPrivacyLock(locked, { ...locked, other: 1 })).toBe(false);
    // Same setting, keys in another order: not a change.
    expect(touchesPrivacyLock(locked, { deskPrivacy: { locked: true, setBy: "Park", names: [], level: "high" } })).toBe(false);
    expect(touchesPrivacyLock(locked, { deskPrivacy: { ...locked.deskPrivacy, level: "off" } })).toBe(true);
    expect(touchesPrivacyLock(locked, {})).toBe(true);

    expect(setsPrivacyLock({}, locked)).toBe(true);
    // Changing a lock while keeping it is setting a new one; lifting it is not.
    expect(setsPrivacyLock(locked, { deskPrivacy: { ...locked.deskPrivacy, level: "off" } })).toBe(true);
    expect(setsPrivacyLock(locked, { deskPrivacy: { ...locked.deskPrivacy, locked: false } })).toBe(false);
    expect(setsPrivacyLock(locked, { deskPrivacy: { locked: true, setBy: "Park", names: [], level: "high" } })).toBe(false);

    expect(redrobAfterImport(locked, { redrob: { x: 1 } })).toEqual({ ...locked, x: 1 });
    expect(redrobAfterImport(locked, { redrob: { x: 1 }, mode: { redrob: "replace" } })).toEqual({ x: 1 });
    expect(redrobAfterImport(locked, {})).toBe(locked);
  });

  test("no token adds a locked note or tags one; the owner can remove a lock an earlier team file left", async () => {
    const { server, collaborator, owner, legacyNote } = await startTeamServer();
    try {
      const note = { content: "House style", tags: ["desk-scope:team", LOCKED_MEMORY_TAG] };
      for (const as of [collaborator, owner]) {
        const refused = await as("POST", "/memory", note);
        expect(refused.status).toBe(403);
        expect(((await refused.json()) as { code: string }).code).toBe("memory_lock_policy_only");
      }
      // An unlocked team note, as a team file now brings, is anyone's to add, change and remove.
      const team = await collaborator("POST", "/memory", { content: "House style", tags: ["desk-scope:team"] });
      expect(team.status).toBe(201);
      const teamId = ((await team.json()) as { memory: { id: string } }).memory.id;
      for (const as of [collaborator, owner]) expect((await as("PATCH", `/memory/${teamId}`, { tags: ["desk-scope:team", LOCKED_MEMORY_TAG] })).status).toBe(403);
      expect((await collaborator("PATCH", `/memory/${teamId}`, { content: "House style v2" })).status).toBe(200);

      const lockedId = await legacyNote("Old rule");
      expect((await collaborator("DELETE", `/memory/${lockedId}`)).status).toBe(403);
      expect((await owner("PATCH", `/memory/${lockedId}`, { content: "Changed" })).status).toBe(403);
      expect((await owner("DELETE", `/memory/${lockedId}`)).status).toBe(200);
    } finally {
      server.stop(true);
    }
  });

  test("no token locks the privacy level by config or import; the owner can lift a lock an earlier team file left", async () => {
    const { server, collaborator, owner, legacyPrivacyLock } = await startTeamServer();
    try {
      const lock = { deskPrivacy: { level: "high", names: [], setBy: "Park", locked: true } };
      for (const as of [collaborator, owner]) {
        const patched = await as("PATCH", "/workspace/workspace/config", { redrob: lock });
        expect(patched.status).toBe(403);
        expect(((await patched.json()) as { code: string }).code).toBe("privacy_lock_policy_only");
        expect((await as("POST", "/workspace/workspace/import", { redrob: lock })).status).toBe(403);
      }
      // An unlocked level stays the person's own to change.
      expect((await collaborator("PATCH", "/workspace/workspace/config", { redrob: { deskPrivacy: { level: "strict" } } })).status).toBe(200);

      await legacyPrivacyLock(lock.deskPrivacy);
      // Under a lock: other settings still change, the lock does not move for a collaborator.
      expect((await collaborator("PATCH", "/workspace/workspace/config", { redrob: { theme: "dark" } })).status).toBe(200);
      expect((await collaborator("PATCH", "/workspace/workspace/config", { redrob: { deskPrivacy: { level: "off" } } })).status).toBe(403);
      expect((await collaborator("POST", "/workspace/workspace/import", { redrob: { theme: "light" }, mode: { redrob: "replace" } })).status).toBe(403);
      // The owner cannot re-lock it differently, only lift it.
      expect((await owner("PATCH", "/workspace/workspace/config", { redrob: { deskPrivacy: { ...lock.deskPrivacy, level: "off" } } })).status).toBe(403);
      const unlocked = { level: "high", names: [], setBy: null, locked: false };
      expect((await owner("PATCH", "/workspace/workspace/config", { redrob: { deskPrivacy: unlocked } })).status).toBe(200);
      const config = (await (await owner("GET", "/workspace/workspace/config")).json()) as { redrob: Record<string, unknown> };
      expect(config.redrob.deskPrivacy).toEqual(unlocked);
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
