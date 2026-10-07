import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { projectFolderSlug } from "./routes/workspaces.js";
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
  // On Windows the runtime DB can still hold files right after stop; a leftover temp dir is not a failure.
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }).catch(() => undefined);
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "redrob-managed-ws-"));
  roots.push(root);
  return root;
}

const headers = {
  Authorization: "Bearer owt_test_token",
  "X-Redrob-Host-Token": "owt_host_token",
  "Content-Type": "application/json",
};

async function startRedrob(input: { workspaces: WorkspaceInfo[]; configPath: string }) {
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: "owt_test_token",
    hostToken: "owt_host_token",
    configPath: input.configPath,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: input.workspaces,
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

type Created = { activeId: string; workspace: WorkspaceInfo; workspaces: WorkspaceInfo[] };

describe("projectFolderSlug", () => {
  test("keeps letters and digits in any script and turns the rest into single dashes", () => {
    expect(projectFolderSlug("Hansol supply agreement")).toBe("hansol-supply-agreement");
    expect(projectFolderSlug("  ../../etc/passwd  ")).toBe("etc-passwd");
    expect(projectFolderSlug("C:\\Users\\x")).toBe("c-users-x");
    expect(projectFolderSlug("한솔 공급 계약")).toBe("한솔-공급-계약");
    expect(projectFolderSlug("Q3: \"supplier\" <contracts>?")).toBe("q3-supplier-contracts");
  });

  test("is never empty, never too long, and never a Windows device name", () => {
    expect(projectFolderSlug("")).toBe("project");
    expect(projectFolderSlug("...")).toBe("project");
    expect(projectFolderSlug("a".repeat(80))).toHaveLength(48);
    expect(projectFolderSlug(`${"a".repeat(47)} b`)).toBe("a".repeat(47));
    expect(projectFolderSlug("CON")).toBe("project-con");
    expect(projectFolderSlug("lpt1")).toBe("project-lpt1");
  });
});

describe("POST /workspaces/local with managed: true", () => {
  test("makes the project's folder under runtime storage without taking over the open workspace", async () => {
    const configDir = await tempRoot();
    const configPath = join(configDir, "server.json");
    const openRoot = await tempRoot();
    await mkdir(join(openRoot, ".opencode"), { recursive: true });
    const base = await startRedrob({
      configPath,
      workspaces: [{ id: "ws_1", name: "ws_1", path: openRoot, preset: "starter", workspaceType: "local" }],
    });

    const response = await fetch(`${base}/workspaces/local`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "  Hansol / supply agreement ", managed: true }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Created;
    // No REDROB_RUNTIME_DB, so runtime storage is the config file's directory.
    expect(body.workspace.path).toBe(join(configDir, "projects", "hansol-supply-agreement"));
    expect(existsSync(body.workspace.path)).toBe(true);
    expect(body.workspace.name).toBe("Hansol / supply agreement");
    expect(body.workspace.kind).toBe("managed");
    expect(body.activeId).toBe("ws_1");
    expect(body.workspaces.map((entry) => entry.id)).toEqual(["ws_1", body.workspace.id]);

    const persisted = JSON.parse(await readFile(configPath, "utf8")) as { workspaces: Array<{ id: string; kind?: string }> };
    expect(persisted.workspaces.find((entry) => entry.id === body.workspace.id)?.kind).toBe("managed");
  });

  test("two projects with the same name get two folders and two workspaces", async () => {
    const configDir = await tempRoot();
    const base = await startRedrob({ configPath: join(configDir, "server.json"), workspaces: [] });
    const create = async () => {
      const response = await fetch(`${base}/workspaces/local`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Acme", managed: true }),
      });
      expect(response.status).toBe(201);
      return (await response.json()) as Created;
    };

    const first = await create();
    const second = await create();

    expect(first.workspace.path).toBe(join(configDir, "projects", "acme"));
    expect(second.workspace.path).toBe(join(configDir, "projects", "acme-2"));
    expect(second.workspace.id).not.toBe(first.workspace.id);
    expect(dirname(second.workspace.path)).toBe(dirname(first.workspace.path));
    // With nothing else open, the first project becomes the active one; the second does not steal it.
    expect(first.activeId).toBe(first.workspace.id);
    expect(second.activeId).toBe(first.workspace.id);
  });

  test("skips a folder that already exists on disk", async () => {
    const configDir = await tempRoot();
    await mkdir(join(configDir, "projects", "acme"), { recursive: true });
    const base = await startRedrob({ configPath: join(configDir, "server.json"), workspaces: [] });

    const response = await fetch(`${base}/workspaces/local`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Acme", managed: true }),
    });

    expect(((await response.json()) as Created).workspace.path).toBe(join(configDir, "projects", "acme-2"));
  });

  test("a folder still comes with the request when the project is not managed", async () => {
    const base = await startRedrob({ configPath: join(await tempRoot(), "server.json"), workspaces: [] });

    const response = await fetch(`${base}/workspaces/local`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Acme" }),
    });

    expect(response.status).toBe(400);
  });
});
