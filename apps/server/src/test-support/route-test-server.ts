import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server.js";
import { loopbackFetch } from "../server-fetch.js";
import type { ServerConfig } from "../types.js";

/**
 * A real redrob-server on a random port, with a temp workspace and data dir, for route tests.
 *
 * The collaborator token is `config.token`, which is what a shared workspace hands out; the owner
 * token is issued through `/tokens` the way the desktop app gets one. `cleanup` stops the server
 * and removes both directories; call it in `finally` or `afterEach`.
 */
export async function startRouteTestServer(overrides: Partial<ServerConfig> = {}) {
  const dirs: string[] = [];
  const temp = async (prefix: string) => {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  };
  const workspace = await temp("redrob-route-ws-");
  const dataDir = await temp("redrob-route-data-");
  const previous = {
    dataDir: process.env.REDROB_DATA_DIR,
    runtimeDb: process.env.REDROB_RUNTIME_DB,
    scheduler: process.env.REDROB_DISABLE_SCHEDULER,
  };
  process.env.REDROB_DATA_DIR = dataDir;
  process.env.REDROB_RUNTIME_DB = join(dataDir, "runtime.sqlite");
  process.env.REDROB_DISABLE_SCHEDULER = "1";

  const config: ServerConfig = {
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
    ...overrides,
  };
  const server = (await startServer(config)) as { port: number; stop: (force?: boolean) => void };
  const base = `http://127.0.0.1:${server.port}`;

  const request = (headers: Record<string, string>) => (method: string, path: string, body?: unknown) =>
    loopbackFetch(`${base}${path}`, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const host = request({ "X-Redrob-Host-Token": config.hostToken });

  const issueToken = async (scope: "owner" | "collaborator" | "viewer", extra: Record<string, unknown> = {}) => {
    const response = await host("POST", "/tokens", { scope, ...extra });
    if (!response.ok) throw new Error(`token issue failed: ${response.status} ${await response.text()}`);
    return ((await response.json()) as { token: string }).token;
  };
  const as = (token: string) => request({ Authorization: `Bearer ${token}` });
  const owner = as(await issueToken("owner"));

  const cleanup = async () => {
    server.stop(true);
    for (const [key, value] of [
      ["REDROB_DATA_DIR", previous.dataDir],
      ["REDROB_RUNTIME_DB", previous.runtimeDb],
      ["REDROB_DISABLE_SCHEDULER", previous.scheduler],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // Windows keeps the open runtime database locked; a leftover temp dir is not a failure.
    while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
  };

  return { base, config, workspace, dataDir, host, owner, collaborator: as(config.token), as, issueToken, cleanup };
}
