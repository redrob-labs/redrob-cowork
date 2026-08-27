import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MEMORY_SCOPE_LOCAL } from "@redrob/types/memory";
import { deleteMemory, listMemories, localMemoryStoreInternals, saveMemory } from "./local-memory-store.js";
import type { ServerConfig } from "./types.js";

const roots: string[] = [];
const previousRuntimeDb = process.env.REDROB_RUNTIME_DB;

afterEach(async () => {
  while (roots.length) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
  if (previousRuntimeDb === undefined) delete process.env.REDROB_RUNTIME_DB;
  else process.env.REDROB_RUNTIME_DB = previousRuntimeDb;
});

function serverConfig(root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: "token",
    hostToken: "host-token",
    configPath: join(root, "server.json"),
    approval: { mode: "auto", timeoutMs: 0 },
    corsOrigins: [],
    workspaces: [],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
}

async function tempConfig(): Promise<ServerConfig> {
  const root = await mkdtemp(join(tmpdir(), "redrob-local-memory-"));
  roots.push(root);
  process.env.REDROB_RUNTIME_DB = join(root, "runtime.sqlite");
  return serverConfig(root);
}

describe("local memory bank", () => {
  test("reads as empty before anything is saved, without creating the database", async () => {
    const config = await tempConfig();
    expect(await listMemories(config)).toEqual([]);
  });

  test("saves a memory and reads it back with a generated id and timestamps", async () => {
    const config = await tempConfig();

    const saved = await saveMemory(config, { content: "  Deploys go out on Thursdays.  ", tags: ["ops", ""] });

    expect(saved.content).toBe("Deploys go out on Thursdays.");
    expect(saved.id).not.toBe("");
    expect(saved.scope).toBe(MEMORY_SCOPE_LOCAL);
    // Blank tags are dropped rather than stored as empty strings.
    expect(saved.tags).toEqual(["ops"]);
    expect(saved.createdAt).toBe(saved.updatedAt);

    expect(await listMemories(config)).toEqual([saved]);
  });

  test("refuses a memory with no content", async () => {
    const config = await tempConfig();
    await expect(saveMemory(config, { content: "   " })).rejects.toBeInstanceOf(Error);
    expect(await listMemories(config)).toEqual([]);
  });

  test("returns the newest memory first", async () => {
    const config = await tempConfig();

    const first = await saveMemory(config, { content: "first" });
    // createdAt is an ISO string compared lexicographically, so the two saves
    // must not land in the same millisecond for the ordering to be meaningful.
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await saveMemory(config, { content: "second" });

    expect((await listMemories(config)).map((memory) => memory.id)).toEqual([second.id, first.id]);
  });

  test("deletes only the requested memory and reports an unknown id", async () => {
    const config = await tempConfig();
    const kept = await saveMemory(config, { content: "keep me" });
    const doomed = await saveMemory(config, { content: "delete me" });

    expect(await deleteMemory(config, doomed.id)).toBe(true);
    expect((await listMemories(config)).map((memory) => memory.id)).toEqual([kept.id]);

    expect(await deleteMemory(config, doomed.id)).toBe(false);
    expect(await deleteMemory(config, "never-existed")).toBe(false);
  });

  test("survives a reopen so memories outlive the process", async () => {
    const config = await tempConfig();
    const saved = await saveMemory(config, { content: "persist me" });

    // A second config pointed at the same database file stands in for a restart.
    const reopened = { ...config };
    expect((await listMemories(reopened)).map((memory) => memory.id)).toEqual([saved.id]);
  });

  test("keeps the readable memories when a stored row is corrupt", () => {
    const { parseMemories } = localMemoryStoreInternals;

    const parsed = parseMemories(JSON.stringify([
      { id: "good", content: "kept", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "", content: "missing id" },
      { id: "blank-content", content: "   " },
      "not an object",
      { id: "no-content" },
    ]));

    expect(parsed.map((memory) => memory.id)).toEqual(["good"]);
  });

  test("treats unparseable stored json as an empty bank rather than throwing", () => {
    expect(localMemoryStoreInternals.parseMemories("{ not json")).toEqual([]);
  });

  test("fills in defaults for rows written by an older shape", () => {
    const [memory] = localMemoryStoreInternals.parseMemories(JSON.stringify([
      { id: "legacy", content: "no metadata", createdAt: "2026-01-01T00:00:00.000Z" },
    ]));

    expect(memory?.source).toBe("agent");
    expect(memory?.scope).toBe(MEMORY_SCOPE_LOCAL);
    expect(memory?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(memory?.tags).toBeNull();
    expect(memory?.contexts).toEqual([]);
  });

  test("keeps provenance contexts and drops ones with no snippet", async () => {
    const config = await tempConfig();

    const saved = await saveMemory(config, {
      content: "with provenance",
      contexts: [
        { snippet: "the user said this", citation: { turn: 3 }, origin: "session" },
        { snippet: "   ", citation: null, origin: null },
      ],
    });

    expect(saved.contexts).toHaveLength(1);
    expect(saved.contexts[0]?.snippet).toBe("the user said this");
    expect(saved.contexts[0]?.citation).toEqual({ turn: 3 });
    expect(saved.contexts[0]?.id).not.toBe("");
  });
});
