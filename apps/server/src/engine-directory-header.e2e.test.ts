import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createWorkspaceOpencodeClient, startServer } from "./server.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };

type EngineRequest = {
  method: string;
  pathname: string;
  redrobDirectory: string | null;
  opencodeDirectory: string | null;
  directoryQuery: string | null;
};

const stops: Array<() => void | Promise<void>> = [];
const roots: string[] = [];

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function startMockEngine() {
  const requests: EngineRequest[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push({
        method: request.method,
        pathname: url.pathname,
        redrobDirectory: request.headers.get("x-redrob-directory"),
        opencodeDirectory: request.headers.get("x-opencode-directory"),
        directoryQuery: url.searchParams.get("directory"),
      });
      return Response.json({ id: "ses_mock", title: "mock" });
    },
  });
  stops.push(() => server.stop(true));
  return { baseUrl: `http://127.0.0.1:${server.port}`, requests };
}

function buildConfig(workspace: WorkspaceInfo, authorizedRoot: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: "owt_test_token",
    hostToken: "owt_host_token",
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [workspace],
    authorizedRoots: [authorizedRoot],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;
}

describe("engine directory routing header", () => {
  test("a non-default workspace directory reaches the engine as x-redrob-directory", async () => {
    const engine = startMockEngine();
    const workspaceRoot = await createRoot("redrob-engine-directory-ws-");
    // Deliberately not the workspace path: only the explicit directory is a
    // valid engine routing target, so a wrong header value is observable.
    const engineDirectory = await createRoot("redrob-engine-directory-target-");
    const workspace: WorkspaceInfo = {
      id: "ws_1",
      name: "Workspace",
      path: workspaceRoot,
      preset: "starter",
      workspaceType: "local",
      directory: engineDirectory,
      baseUrl: engine.baseUrl,
    } as WorkspaceInfo;
    const config = buildConfig(workspace, workspaceRoot);

    const client = createWorkspaceOpencodeClient(config, workspace);
    const created = await client.session.create({ title: "directory routing" });
    expect(created.response?.status).toBe(200);

    const post = engine.requests.find((entry) => entry.method === "POST");
    expect(post).toBeDefined();
    expect(post?.redrobDirectory).toBe(engineDirectory);
    expect(post?.opencodeDirectory).toBeNull();
  });

  test("the proxy sends x-redrob-directory and drops a client-supplied upstream header", async () => {
    const engine = startMockEngine();
    const workspaceRoot = await createRoot("redrob-engine-directory-proxy-");
    const engineDirectory = await createRoot("redrob-engine-directory-proxy-target-");
    const workspace: WorkspaceInfo = {
      id: "ws_1",
      name: "Workspace",
      path: workspaceRoot,
      preset: "starter",
      workspaceType: "local",
      directory: engineDirectory,
      baseUrl: engine.baseUrl,
    } as WorkspaceInfo;
    const config = buildConfig(workspace, workspaceRoot);
    const server = await startServer(config) as Served;
    stops.push(() => server.stop(true));

    const response = await fetch(`http://127.0.0.1:${server.port}/workspace/ws_1/opencode/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "x-opencode-directory": "/tmp/smuggled-upstream-directory",
      },
      body: JSON.stringify({ title: "proxied" }),
    });
    expect(response.status).toBe(200);

    const proxied = engine.requests.find((entry) => entry.pathname === "/session");
    expect(proxied).toBeDefined();
    expect(proxied?.redrobDirectory).toBe(engineDirectory);
    expect(proxied?.opencodeDirectory).toBeNull();
  });

  test("CORS advertises the Redrob directory header and not the upstream one", async () => {
    const engine = startMockEngine();
    const workspaceRoot = await createRoot("redrob-engine-directory-cors-");
    const workspace: WorkspaceInfo = {
      id: "ws_1",
      name: "Workspace",
      path: workspaceRoot,
      preset: "starter",
      workspaceType: "local",
      baseUrl: engine.baseUrl,
    } as WorkspaceInfo;
    const config = buildConfig(workspace, workspaceRoot);
    const server = await startServer(config) as Served;
    stops.push(() => server.stop(true));

    const preflight = await fetch(`http://127.0.0.1:${server.port}/workspace/ws_1/opencode/session`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    const allowed = preflight.headers.get("Access-Control-Allow-Headers") ?? "";
    expect(allowed.toLowerCase()).toContain("x-redrob-directory");
    expect(allowed.toLowerCase()).not.toContain("x-opencode-directory");
  });
});
