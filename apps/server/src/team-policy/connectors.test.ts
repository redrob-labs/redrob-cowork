import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RedrobWorkTeamConnectors } from "../opencode-plugins/redrob-team-connectors.js";
import { buildRedrobRuntimeConfigObject } from "../redrob-runtime-config.js";
import { startServer } from "../server.js";
import type { ServerConfig } from "../types.js";
import { connectorVerdict, normalizeConnectorUrl, TEAM_CONNECTORS_FILE } from "./connector-rules.js";
import { teamConnectorsFilePath } from "./connectors.js";
import { samplePolicy, signTestPolicy } from "./test-signer.js";

const dirs: string[] = [];
const savedEnv = {
  REDROB_RUNTIME_DB: process.env.REDROB_RUNTIME_DB,
  REDROB_DATA_DIR: process.env.REDROB_DATA_DIR,
  REDROB_DISABLE_SCHEDULER: process.env.REDROB_DISABLE_SCHEDULER,
  REDROB_TEAM_POLICY_TEST_KEYS: process.env.REDROB_TEAM_POLICY_TEST_KEYS,
  REDROB_CONFIG: process.env.REDROB_CONFIG,
};

afterEach(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

async function temp(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const POLICY = { allow: [{ name: "notes", type: "remote" as const, url: "https://notes.example.com/mcp" }], allowLocalPrograms: false };

describe("the connector rule", () => {
  test("a connector that starts a program needs allowLocalPrograms and a local listing", () => {
    const tool = { type: "local", command: ["npx", "some-tool"] };
    expect(connectorVerdict(POLICY, "tool", tool)).toEqual({ allowed: false, reason: "local_programs_blocked" });
    const local = { allow: [{ name: "tool", type: "local" as const }], allowLocalPrograms: true };
    expect(connectorVerdict(local, "tool", tool)).toEqual({ allowed: true });
    expect(connectorVerdict({ ...local, allowLocalPrograms: false }, "tool", tool).allowed).toBe(false);
    expect(connectorVerdict({ allow: [], allowLocalPrograms: true }, "tool", tool)).toEqual({ allowed: false, reason: "not_listed" });
    // A command makes it a program, whatever the type claims.
    expect(connectorVerdict(POLICY, "notes", { type: "remote", url: "https://notes.example.com/mcp", command: ["sh"] }).allowed).toBe(false);
  });

  test("a remote connector must be listed, at the listed address when one is given", () => {
    expect(connectorVerdict(POLICY, "notes", { type: "remote", url: "https://NOTES.example.com/mcp/?x=1" })).toEqual({ allowed: true });
    expect(connectorVerdict(POLICY, "notes", { type: "remote", url: "https://evil.example.com/mcp" })).toEqual({
      allowed: false,
      reason: "url_mismatch",
    });
    expect(connectorVerdict(POLICY, "other", { type: "remote", url: "https://notes.example.com/mcp" })).toEqual({
      allowed: false,
      reason: "not_listed",
    });
    const nameOnly = { allow: [{ name: "notes", type: "remote" as const }], allowLocalPrograms: false };
    expect(connectorVerdict(nameOnly, "notes", { type: "remote", url: "https://anywhere.example.com" }).allowed).toBe(true);
    // A managed connector is judged on where it signs in, not on the local gateway the engine sees.
    expect(
      connectorVerdict(POLICY, "notes", { type: "remote", url: "http://127.0.0.1:5555/mcp/managed/ws/notes" }, {
        managedServerUrl: "https://notes.example.com/mcp",
      }).allowed,
    ).toBe(true);
    expect(normalizeConnectorUrl("not a url")).toBeNull();
  });
});

describe("the engine plugin", () => {
  async function pluginWith(file: unknown | string | null, directory: string) {
    const runtimeDir = await temp("redrob-team-connectors-runtime-");
    process.env.REDROB_CONFIG = join(runtimeDir, "runtime-opencode-config.json");
    if (file !== null) {
      await writeFile(join(runtimeDir, TEAM_CONNECTORS_FILE), typeof file === "string" ? file : JSON.stringify(file));
    }
    const hooks = await RedrobWorkTeamConnectors({ directory });
    return async (mcp: Record<string, Record<string, unknown>>) => {
      const config = { mcp: structuredClone(mcp) };
      await hooks.config(config);
      return Object.fromEntries(Object.entries(config.mcp).map(([name, entry]) => [name, entry.enabled !== false]));
    };
  }

  const MCP = {
    notes: { type: "remote", url: "https://notes.example.com/mcp" },
    // Declared in the project's own config, which the engine merges last.
    tool: { type: "local", command: ["npx", "some-tool"] },
    elsewhere: { type: "remote", url: "https://other.example.com/mcp" },
  };

  test("disables, at load, every connector the policy blocks for this directory, from any config file", async () => {
    const workspace = await temp("redrob-team-connectors-ws-");
    const run = await pluginWith({ v: 1, workspaces: [{ directory: workspace, accountId: "acc", version: 1, policy: POLICY, managed: {} }] }, workspace);
    expect(await run(MCP)).toEqual({ notes: true, tool: false, elsewhere: false });
  });

  test("leaves a directory that follows no team alone, and does nothing without a file", async () => {
    const workspace = await temp("redrob-team-connectors-ws-");
    const other = await temp("redrob-team-connectors-other-");
    const elsewhere = await pluginWith({ v: 1, workspaces: [{ directory: workspace, accountId: "acc", version: 1, policy: POLICY, managed: {} }] }, other);
    expect(await elsewhere(MCP)).toEqual({ notes: true, tool: true, elsewhere: true });
    const none = await pluginWith(null, workspace);
    expect(await none(MCP)).toEqual({ notes: true, tool: true, elsewhere: true });
  });

  test("a policy file it cannot read disables every connector instead of allowing them", async () => {
    const workspace = await temp("redrob-team-connectors-ws-");
    expect(await (await pluginWith("{not json", workspace))(MCP)).toEqual({ notes: false, tool: false, elsewhere: false });
    expect(await (await pluginWith({ v: 2 }, workspace))(MCP)).toEqual({ notes: false, tool: false, elsewhere: false });
  });
});

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

describe("the server's side of the allowlist", () => {
  test("refuses adding, enabling or importing a blocked connector, and keeps the engine's view in step", async () => {
    const workspace = await temp("redrob-team-connectors-srv-ws-");
    const dataDir = await temp("redrob-team-connectors-srv-data-");
    process.env.REDROB_DATA_DIR = dataDir;
    process.env.REDROB_RUNTIME_DB = join(dataDir, "runtime.sqlite");
    process.env.REDROB_DISABLE_SCHEDULER = "1";
    process.env.REDROB_TEAM_POLICY_TEST_KEYS = "1";
    const config = serverConfig(workspace, dataDir);
    const server = (await startServer(config)) as { port: number; stop: (force?: boolean) => void };
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const issued = await fetch(`${base}/tokens`, {
        method: "POST",
        headers: { "X-Redrob-Host-Token": "host-token", "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "owner" }),
      });
      const owner = ((await issued.json()) as { token: string }).token;
      const call = async (method: string, path: string, body?: unknown) => {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: { Authorization: `Bearer ${owner}`, "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: ((await response.json().catch(() => null)) ?? {}) as Record<string, any> };
      };

      // Before any policy: a program-starting connector is added the ordinary way.
      expect((await call("POST", "/workspace/workspace/mcp", { name: "tool", config: { type: "local", command: ["npx", "some-tool"] } })).status).toBe(200);
      await expect(readFile(teamConnectorsFilePath(config), "utf8")).rejects.toThrow();

      const applied = await call("POST", "/workspace/workspace/team-policy", {
        policy: await signTestPolicy(samplePolicy({ connectors: POLICY })),
      });
      expect(applied.body.status).toBe("applied");

      const file = JSON.parse(await readFile(teamConnectorsFilePath(config), "utf8"));
      expect(file.workspaces).toEqual([
        expect.objectContaining({ accountId: "acc_vectors", version: 1, policy: POLICY }),
      ]);

      const listed = (await call("GET", "/workspace/workspace/mcp")).body.items as Array<Record<string, any>>;
      expect(listed.find((item) => item.name === "tool")?.teamPolicy).toEqual({ blocked: true, reason: "local_programs_blocked" });
      expect((await buildRedrobRuntimeConfigObject(config, "workspace")).mcp).toEqual({});
      expect(((await buildRedrobRuntimeConfigObject(config, "workspace")).plugin as string[]).some((path) => path.includes("redrob-team-connectors"))).toBe(true);

      const refused = await call("POST", "/workspace/workspace/mcp", { name: "other", config: { type: "local", command: ["sh"] } });
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("team_policy_connector_blocked");
      expect((await call("POST", "/workspace/workspace/mcp", { name: "notes", config: { type: "remote", url: "https://evil.example.com/mcp" } })).body.details).toMatchObject({ reason: "url_mismatch" });
      expect((await call("POST", "/workspace/workspace/mcp", { name: "notes", config: { type: "remote", url: "https://notes.example.com/mcp" } })).status).toBe(200);

      expect((await call("POST", "/workspace/workspace/mcp/tool/enabled", { enabled: true })).status).toBe(403);
      expect((await call("POST", "/workspace/workspace/mcp/tool/enabled", { enabled: false })).status).toBe(200);

      const patched = await call("PATCH", "/workspace/workspace/config", { opencode: { mcp: { sneaky: { type: "local", command: ["sh"] } } } });
      expect(patched.status).toBe(403);
      const imported = await call("POST", "/workspace/workspace/import", {
        workspaceId: "x",
        exportedAt: 1,
        opencode: { mcp: { sneaky: { type: "remote", url: "https://x.example.com" } } },
      });
      expect(imported.status).toBe(403);
      expect(imported.body.code).toBe("team_policy_connector_blocked");

      // Leaving the team lifts the allowlist and removes the file.
      await call("DELETE", "/workspace/workspace/team-policy");
      await expect(readFile(teamConnectorsFilePath(config), "utf8")).rejects.toThrow();
      expect((await call("POST", "/workspace/workspace/mcp", { name: "other", config: { type: "local", command: ["sh"] } })).status).toBe(200);
    } finally {
      server.stop(true);
    }
  });
});
