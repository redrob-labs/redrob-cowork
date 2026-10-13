import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, spyOn, test } from "bun:test";

import { startEmbeddedServer, type EmbeddedServerHandle, type EmbeddedServerOptions } from "./embedded.js";
import { directoryConfigDir, readDaemonRecord } from "./engine-daemon.js";
import { readEngineRegistry } from "./engine-registry.js";
import * as engineStartupModule from "./engine-startup.js";
import { writeRedrobRuntimeConfigFile } from "./redrob-runtime-config.js";
import { writeRuntimeOpencodeConfig } from "./runtime-opencode-config-store.js";
import * as serverModule from "./server.js";
import type { ServerConfig } from "./types.js";

const HOST = "127.0.0.1";
const SERVER_TOKEN = "server-token";
const HOST_TOKEN = "host-token";
const PROVIDER_ID = "lifecycle_anthropic";
const PROVIDER = { id: "anthropic", name: "Anthropic", env: ["ANTHROPIC_API_KEY"] };
const ENV_NAMES: string[] = [
  "HOME",
  "REDROB_DEV_MODE",
  "REDROB_RUNTIME_DB",
  "REDROB_ENCRYPTION_KEY",
  "REDROB_OPENCODE_BASE_URL",
  "REDROB_LIFECYCLE_LOG",
  "REDROB_RUN_DIR",
  "XDG_STATE_HOME",
  "FAKE_REDROB_FAIL",
];

type Fixture = {
  root: string;
  opencodeBin: string;
  logPath: string;
  handles: EmbeddedServerHandle[];
  restore: () => Promise<void>;
};

function restoreProcessEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

/**
 * A stand-in for the `redrob` CLI as the lifecycle sees it: `service start --json` prints
 * the daemon record (starting a detached fake daemon when none is registered), and the
 * daemon answers the routes Cowork uses -- health, clients, instance dispose -- logging
 * each so the tests can assert on them.
 */
async function writeFakeRedrobBin(root: string): Promise<string> {
  const binPath = join(root, "fake-redrob.mjs");
  const shebang = "#!" + "/usr/bin/env bun";
  await writeFile(binPath, [
    shebang,
    "import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';",
    "import { spawn } from 'node:child_process';",
    "import { join } from 'node:path';",
    "const logPath = process.env.REDROB_LIFECYCLE_LOG;",
    "const append = (line) => { if (logPath) appendFileSync(logPath, `${line}\\n`); };",
    "const runDir = process.env.REDROB_RUN_DIR;",
    "const recordPath = join(runDir, 'server.json');",
    "const readRecord = () => { try { return JSON.parse(readFileSync(recordPath, 'utf8')); } catch { return null; } };",
    "if (process.argv[2] === '__daemon') {",
    "  append(`vault-key:${process.env.REDROB_ENCRYPTION_KEY ? 'present' : 'absent'}`);",
    "  append(`server-url-env:${process.env.REDROB_SERVER_URL ?? ''}`);",
    "  const secret = 'fake-secret';",
    "  const clients = new Map();",
    "  let next = 1;",
    "  const server = Bun.serve({",
    "    hostname: '127.0.0.1',",
    "    port: 0,",
    "    async fetch(request) {",
    "      const url = new URL(request.url);",
    "      const auth = request.headers.get('authorization') ?? '';",
    "      if (auth !== `Basic ${btoa(`redrob:${secret}`)}`) { append(`unauthorized:${url.pathname}`); return new Response('', { status: 401 }); }",
    "      append(url.pathname);",
    "      if (url.pathname === '/api/health') return Response.json({ healthy: true });",
    "      if (url.pathname === '/api/clients' && request.method === 'POST') {",
    "        const body = await request.json(); const id = `c${next++}`; clients.set(id, body.app); append(`attach:${body.app}`); return Response.json({ id });",
    "      }",
    "      const client = url.pathname.match(/^\\/api\\/clients\\/([^/]+)(\\/heartbeat)?$/);",
    "      if (client && request.method === 'DELETE') { append(`detach:${clients.get(client[1]) ?? '?'}`); clients.delete(client[1]); return Response.json({ ok: true }); }",
    "      if (client) return Response.json({ ok: true });",
    "      return Response.json({});",
    "    },",
    "  });",
    "  mkdirSync(runDir, { recursive: true });",
    "  const record = { id: `d${Date.now()}`, version: '0.6.2', url: `http://127.0.0.1:${server.port}`, port: server.port, pid: process.pid, secret };",
    "  writeFileSync(recordPath, JSON.stringify(record));",
    "  process.on('SIGTERM', () => { append('SIGTERM'); server.stop(true); process.exit(0); });",
    "  setInterval(() => { if (!existsSync(recordPath)) { append('record-gone'); server.stop(true); process.exit(0); } }, 200);",
    "} else if (process.argv[2] === 'service' && process.argv[3] === 'start') {",
    "  append(`service-start:${process.argv.slice(4).join(' ')}`);",
    "  if (process.env.FAKE_REDROB_FAIL === '1') { console.error('fake redrob refuses to start'); process.exit(1); }",
    "  let record = readRecord();",
    "  const healthy = async (r) => { try { const res = await fetch(`${r.url}/api/health`, { headers: { authorization: `Basic ${btoa(`redrob:${r.secret}`)}` } }); return res.ok; } catch { return false; } };",
    "  if (!record || !(await healthy(record))) {",
    "    rmSync(recordPath, { force: true });",
    "    const child = spawn(process.execPath, [process.argv[1], '__daemon'], { detached: true, stdio: 'ignore', env: process.env });",
    "    child.unref();",
    "    for (let i = 0; i < 100 && !(record = readRecord()); i += 1) await new Promise((r) => setTimeout(r, 50));",
    "    if (!record) { console.error('fake daemon never registered'); process.exit(1); }",
    "  }",
    "  console.log(JSON.stringify(record));",
    "} else {",
    "  console.error(`fake redrob: unexpected arguments ${process.argv.slice(2).join(' ')}`);",
    "  process.exit(2);",
    "}",
  ].join("\n"));
  await chmod(binPath, 0o755);
  return binPath;
}

/** Ask the fake daemon to exit by removing its record (it polls for that) and wait for it. */
async function stopFakeDaemon(): Promise<void> {
  const record = await readDaemonRecord();
  if (!record) return;
  await rm(join(process.env.REDROB_RUN_DIR ?? "", "server.json"), { force: true });
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(`${record.url}/api/health`, { signal: AbortSignal.timeout(200) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "redrob-embedded-lifecycle-"));
  const previousEnv = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  const logPath = join(root, "engine.log");
  const opencodeBin = await writeFakeRedrobBin(root);
  const handles: EmbeddedServerHandle[] = [];

  process.env.HOME = join(root, "home");
  process.env.REDROB_DEV_MODE = "1";
  process.env.REDROB_RUNTIME_DB = join(root, "runtime.sqlite");
  process.env.REDROB_LIFECYCLE_LOG = logPath;
  process.env.REDROB_RUN_DIR = join(root, "run");
  process.env.XDG_STATE_HOME = join(root, "state");
  delete process.env.REDROB_OPENCODE_BASE_URL;
  delete process.env.FAKE_REDROB_FAIL;

  return {
    root,
    opencodeBin,
    logPath,
    handles,
    async restore() {
      const errors: unknown[] = [];
      for (const handle of handles.reverse()) {
        try {
          await handle.stop();
        } catch (error) {
          errors.push(error);
        }
      }
      await stopFakeDaemon();
      for (const name of ENV_NAMES) restoreProcessEnv(name, previousEnv.get(name));
      try {
        await rm(root, { recursive: true, force: true });
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to clean up embedded lifecycle test");
      }
    },
  };
}

function workspacePath(fixture: Fixture, name: string): string {
  return join(fixture.root, `${name}-workspace`);
}

/** The file the engine reads for the managed workspace's directory. */
function engineConfigPath(fixture: Fixture, name: string): string {
  return join(directoryConfigDir(workspacePath(fixture, name)), "redrob.json");
}

async function startManaged(fixture: Fixture, name: string): Promise<EmbeddedServerHandle> {
  await mkdir(workspacePath(fixture, name), { recursive: true });
  const handle = await startEmbeddedServer(managedOptions(fixture, name));
  fixture.handles.push(handle);
  return handle;
}

function managedOptions(fixture: Fixture, name: string): EmbeddedServerOptions {
  const workspace = workspacePath(fixture, name);
  return {
    configPath: join(fixture.root, `${name}-server.json`),
    host: HOST,
    port: 0,
    token: SERVER_TOKEN,
    hostToken: HOST_TOKEN,
    workspaces: [workspace],
    manageOpencode: true,
    opencodeBin: fixture.opencodeBin,
    opencodeCwd: workspace,
  };
}

function workspaceId(config: ServerConfig): string {
  const id = config.workspaces[0]?.id;
  if (!id) throw new Error("Expected an embedded workspace");
  return id;
}

async function mutateWorkspace(config: ServerConfig, id: string, label: string): Promise<void> {
  await writeRuntimeOpencodeConfig(config, id, (current) => ({
    ...current,
    mcp: { [label]: { type: "remote", url: `https://${label}.example.test/mcp` } },
  }));
}

async function patchProviders(handle: EmbeddedServerHandle): Promise<Record<string, unknown>> {
  const response = await fetch(`${handle.url}/runtime-config/providers`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-redrob-host-token": HOST_TOKEN,
    },
    body: JSON.stringify({ provider: { [PROVIDER_ID]: PROVIDER } }),
  });
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Expected a runtime provider response");
  }
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function logLines(path: string): Promise<string[]> {
  const content = await readFile(path, "utf8").catch(() => "");
  return content.split("\n").filter(Boolean);
}

function count(lines: string[], line: string): number {
  return lines.filter((entry) => entry === line).length;
}

describe("embedded server lifecycle", () => {
  test.serial("attaches to the shared daemon and writes the bound server port into the engine's directory config", async () => {
    const fixture = await createFixture();
    // Occupy a port so serve-node's EADDRINUSE fallback rebinds to an
    // OS-assigned one: the plugins' callback URL must follow the bound port,
    // not the requested one.
    const blocker = net.createServer();
    const blockedPort = await new Promise<number>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, HOST, () => {
        const address = blocker.address();
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Failed to bind blocker"));
      });
    });
    try {
      await mkdir(workspacePath(fixture, "bound-port"), { recursive: true });
      const handle = await startEmbeddedServer({
        ...managedOptions(fixture, "bound-port"),
        port: blockedPort,
      });
      fixture.handles.push(handle);

      expect(handle.port).not.toBe(blockedPort);
      expect(handle.config.port).toBe(handle.port);

      // The engine reads this file for the workspace directory; the plugins read the
      // server URL and token from it as options, never from the daemon's environment.
      const engineConfig = JSON.parse(await readFile(engineConfigPath(fixture, "bound-port"), "utf8")) as {
        plugin: Array<string | [string, Record<string, unknown>]>;
      };
      const optioned = engineConfig.plugin.filter((entry): entry is [string, Record<string, unknown>] => Array.isArray(entry));
      expect(optioned.length).toBeGreaterThan(0);
      for (const [, options] of optioned) {
        if ("serverUrl" in options) {
          expect(options.serverUrl).toBe(`http://${HOST}:${handle.port}`);
          expect(options.serverToken).toBe(SERVER_TOKEN);
        }
      }
      expect(await logLines(fixture.logPath)).toContain("server-url-env:");

      const record = await readDaemonRecord();
      expect(record?.pid).toBe(handle.managedOpencode?.pid ?? -1);
      expect(handle.config.opencodeBaseUrl).toBe(record?.url);
      expect(handle.managedOpencodeExecution?.mode).toBe("started");
      expect(count(await logLines(fixture.logPath), "attach:cowork")).toBe(1);
      // Nothing is recorded in Cowork's own engine registry: the daemon is not ours to reap.
      expect(await readEngineRegistry(handle.config)).toEqual([]);

      await handle.stop();
      const lines = await logLines(fixture.logPath);
      expect(count(lines, "detach:cowork")).toBe(1);
      // Detached, not killed: the daemon serves other apps.
      expect(count(lines, "SIGTERM")).toBe(0);
      expect(await readDaemonRecord()).toBeDefined();
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
      await fixture.restore();
    }
  });

  test.serial("a second server reuses the running daemon instead of starting another", async () => {
    const fixture = await createFixture();
    try {
      const serverA = await startManaged(fixture, "server-a");
      const serverB = await startManaged(fixture, "server-b");
      expect(serverB.managedOpencodeExecution?.mode).toBe("attached");
      expect(serverB.managedOpencode?.pid).toBe(serverA.managedOpencode?.pid ?? -1);
      const lines = await logLines(fixture.logPath);
      expect(lines.filter((line) => line.startsWith("service-start:"))).toHaveLength(1);
      expect(count(lines, "attach:cowork")).toBe(2);
      // Both workspaces have their own engine config file.
      expect(engineConfigPath(fixture, "server-a")).not.toBe(engineConfigPath(fixture, "server-b"));
      await readFile(engineConfigPath(fixture, "server-b"), "utf8");
    } finally {
      await fixture.restore();
    }
  });

  test.serial("does not expose the vault encryption key to a daemon it starts", async () => {
    const fixture = await createFixture();
    process.env.REDROB_ENCRYPTION_KEY = "server-only-vault-key";
    try {
      await startManaged(fixture, "vault");
      expect(await logLines(fixture.logPath)).toContain("vault-key:absent");
    } finally {
      await fixture.restore();
    }
  });

  test.serial("a stopped server no longer writes generated runtime configuration", async () => {
    const fixture = await createFixture();
    try {
      const serverA = await startManaged(fixture, "server-a");
      const id = workspaceId(serverA.config);
      await serverA.stop();

      await mutateWorkspace(serverA.config, id, "stopped-server");
      const barrier = await writeRedrobRuntimeConfigFile(serverA.config, id);

      // The explicit barrier is the first writer only when the stopped
      // server's subscription did not enqueue a write ahead of it.
      expect(barrier.changed).toBe(true);
    } finally {
      await fixture.restore();
    }
  });

  test.serial("only the replacement server responds to shared runtime database changes", async () => {
    const fixture = await createFixture();
    try {
      const serverA = await startManaged(fixture, "server-a");
      const serverAWorkspace = workspaceId(serverA.config);
      await serverA.stop();
      const serverB = await startManaged(fixture, "server-b");
      const serverBWorkspace = workspaceId(serverB.config);

      await mutateWorkspace(serverA.config, serverAWorkspace, "stale-server");
      const afterStoppedServerMutation = await writeRedrobRuntimeConfigFile(serverB.config, serverBWorkspace);
      expect(afterStoppedServerMutation.changed).toBe(false);

      await mutateWorkspace(serverB.config, serverBWorkspace, "active-server");
      const afterActiveServerMutation = await writeRedrobRuntimeConfigFile(serverB.config, serverBWorkspace);
      expect(afterActiveServerMutation.changed).toBe(false);
    } finally {
      await fixture.restore();
    }
  });

  test.serial("an identical provider update after replacement is inert", async () => {
    const fixture = await createFixture();
    try {
      const serverA = await startManaged(fixture, "server-a");
      const serverAWorkspace = workspaceId(serverA.config);
      await serverA.stop();
      const serverB = await startManaged(fixture, "server-b");

      const first = await patchProviders(serverB);
      expect(first).toMatchObject({ changed: true, reload: "reloaded" });
      const fileAfterFirstPatch = await readFile(engineConfigPath(fixture, "server-b"));
      const disposalsAfterFirstPatch = count(await logLines(fixture.logPath), "/instance/dispose");
      expect(disposalsAfterFirstPatch).toBeGreaterThan(0);

      await mutateWorkspace(serverA.config, serverAWorkspace, "stale-server");
      const second = await patchProviders(serverB);

      expect(second).toMatchObject({ changed: false, reload: "skipped" });
      expect(await readFile(engineConfigPath(fixture, "server-b"))).toEqual(fileAfterFirstPatch);
      expect(count(await logLines(fixture.logPath), "/instance/dispose")).toBe(disposalsAfterFirstPatch);
    } finally {
      await fixture.restore();
    }
  });

  test.serial("stop shares one shutdown operation and releases each resource once", async () => {
    const fixture = await createFixture();
    const originalStartServer = serverModule.startServer;
    let httpStopCalls = 0;
    const startSpy = spyOn(serverModule, "startServer").mockImplementation(async (config) => {
      const server = await originalStartServer(config);
      return {
        ...server,
        async stop() {
          httpStopCalls += 1;
          await server.stop();
        },
      };
    });
    const clearTrustedSpy = spyOn(serverModule, "clearTrustedOpencodeProcess");

    try {
      const handle = await startManaged(fixture, "idempotent");
      const firstStop = handle.stop();
      const secondStop = handle.stop();
      expect(secondStop).toBe(firstStop);
      await Promise.all([firstStop, secondStop]);

      expect(httpStopCalls).toBe(1);
      expect(clearTrustedSpy).toHaveBeenCalledTimes(1);
      expect(count(await logLines(fixture.logPath), "detach:cowork")).toBe(1);
      expect(handle.managedOpencode?.isAlive()).toBe(false);
      await expect(fetch(handle.url)).rejects.toThrow();
      await expect(handle.stop()).resolves.toBeUndefined();
    } finally {
      clearTrustedSpy.mockRestore();
      startSpy.mockRestore();
      await fixture.restore();
    }
  });

  test.serial("HTTP startup failure aborts before the engine is touched", async () => {
    const fixture = await createFixture();
    const startupError = new Error("forced HTTP startup failure");
    const startSpy = spyOn(serverModule, "startServer").mockImplementation(async () => {
      throw startupError;
    });
    const engineSpy = spyOn(engineStartupModule, "startSharedEngineForConfig");

    try {
      const options = managedOptions(fixture, "startup-failure");
      await mkdir(options.opencodeCwd ?? "", { recursive: true });
      await expect(startEmbeddedServer(options)).rejects.toBe(startupError);

      // The HTTP server binds before the engine is touched, so a bind failure
      // must leave no daemon started and no attachment.
      expect(engineSpy).not.toHaveBeenCalled();
      expect((await logLines(fixture.logPath)).filter((line) => line.startsWith("service-start:"))).toHaveLength(0);
      expect(await readDaemonRecord()).toBeUndefined();
    } finally {
      engineSpy.mockRestore();
      startSpy.mockRestore();
      await fixture.restore();
    }
  });

  test.serial("engine start failure after HTTP start releases the server and subscription", async () => {
    const fixture = await createFixture();
    process.env.FAKE_REDROB_FAIL = "1";
    let failedConfig: ServerConfig | null = null;
    let httpStopCalls = 0;
    const originalStartServer = serverModule.startServer;
    const startSpy = spyOn(serverModule, "startServer").mockImplementation(async (config) => {
      failedConfig = config;
      const server = await originalStartServer(config);
      return {
        ...server,
        async stop() {
          httpStopCalls += 1;
          await server.stop();
        },
      };
    });
    const clearTrustedSpy = spyOn(serverModule, "clearTrustedOpencodeProcess");

    try {
      const options = managedOptions(fixture, "spawn-failure");
      await mkdir(options.opencodeCwd ?? "", { recursive: true });
      await expect(startEmbeddedServer(options)).rejects.toThrow("redrob service start failed");
      if (!failedConfig) throw new Error("Expected startup to bind the HTTP server");

      const config = failedConfig;
      const id = workspaceId(config);
      await mutateWorkspace(config, id, "after-spawn-failure");
      const barrier = await writeRedrobRuntimeConfigFile(config, id);

      expect(barrier.changed).toBe(true);
      expect(httpStopCalls).toBe(1);
      // Nothing was registered, so nothing gets cleared.
      expect(clearTrustedSpy).not.toHaveBeenCalled();
      expect(await readEngineRegistry(config)).toEqual([]);
    } finally {
      clearTrustedSpy.mockRestore();
      startSpy.mockRestore();
      await fixture.restore();
    }
  });

  test.serial("shutdown errors remain observable while every later resource is released", async () => {
    const fixture = await createFixture();
    const engineError = new Error("forced engine detach failure");
    const httpError = new Error("forced HTTP shutdown failure");
    const originalStart = engineStartupModule.startSharedEngineForConfig;
    const originalStartServer = serverModule.startServer;
    let engineStopCalls = 0;
    let httpStopCalls = 0;
    const engineSpy = spyOn(engineStartupModule, "startSharedEngineForConfig").mockImplementation(async (options) => {
      const started = await originalStart(options);
      if (!started) return started;
      return {
        ...started,
        async stop() {
          engineStopCalls += 1;
          await started.stop();
          throw engineError;
        },
      };
    });
    const startSpy = spyOn(serverModule, "startServer").mockImplementation(async (config) => {
      const server = await originalStartServer(config);
      return {
        ...server,
        async stop() {
          httpStopCalls += 1;
          await server.stop();
          throw httpError;
        },
      };
    });

    try {
      const handle = await startManaged(fixture, "shutdown-failure");
      const id = workspaceId(handle.config);
      const firstStop = handle.stop();
      const secondStop = handle.stop();
      expect(secondStop).toBe(firstStop);

      let observed: unknown;
      try {
        await firstStop;
      } catch (error) {
        observed = error;
      }
      expect(observed).toBeInstanceOf(AggregateError);
      if (!(observed instanceof AggregateError)) throw new Error("Expected aggregate shutdown failure");
      expect(observed.errors).toEqual([engineError, httpError]);

      await mutateWorkspace(handle.config, id, "after-shutdown-failure");
      const barrier = await writeRedrobRuntimeConfigFile(handle.config, id);
      expect(barrier.changed).toBe(true);
      expect(engineStopCalls).toBe(1);
      expect(httpStopCalls).toBe(1);
      expect(count(await logLines(fixture.logPath), "detach:cowork")).toBe(1);
      await expect(fetch(handle.url)).rejects.toThrow();
      fixture.handles.splice(fixture.handles.indexOf(handle), 1);
    } finally {
      engineSpy.mockRestore();
      startSpy.mockRestore();
      await fixture.restore();
    }
  });
});
