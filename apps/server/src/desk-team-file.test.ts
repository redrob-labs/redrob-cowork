import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LOCKED_MEMORY_TAG, isLockedMemory } from "./local-memory-store.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";
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

describe("team file notes", () => {
  test("a note tagged from a team file is locked", () => {
    expect(isLockedMemory({ tags: ["desk-scope:team", LOCKED_MEMORY_TAG] })).toBe(true);
    expect(isLockedMemory({ tags: ["desk-scope:team"] })).toBe(false);
    expect(isLockedMemory({ tags: null })).toBe(false);
  });

  test("the server refuses to change or forget a locked note, and changes an ordinary one", async () => {
    const workspace = await temp("redrob-team-ws-");
    const dataDir = await temp("redrob-team-data-");
    process.env.REDROB_DATA_DIR = dataDir;
    process.env.REDROB_RUNTIME_DB = join(dataDir, "runtime.sqlite");
    process.env.REDROB_DISABLE_SCHEDULER = "1";
    const server = (await startServer(serverConfig(workspace, dataDir))) as { port: number; stop: (force?: boolean) => void };
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const headers = { Authorization: "Bearer test-token", "Content-Type": "application/json" };
      const save = async (tags: string[]) =>
        ((await (await fetch(`${base}/memory`, { method: "POST", headers, body: JSON.stringify({ content: "House style", tags }) })).json()) as { memory: { id: string } }).memory.id;
      const locked = await save(["desk-scope:team", LOCKED_MEMORY_TAG]);
      const own = await save(["desk-scope:you"]);
      const patch = (id: string) => fetch(`${base}/memory/${id}`, { method: "PATCH", headers, body: JSON.stringify({ content: "Changed" }) });
      const remove = (id: string) => fetch(`${base}/memory/${id}`, { method: "DELETE", headers });
      expect((await patch(locked)).status).toBe(403);
      expect((await remove(locked)).status).toBe(403);
      expect((await patch(own)).status).toBe(200);
      expect((await remove(own)).status).toBe(200);
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
