/**
 * The shared Redrob Code daemon, from Cowork: find it or start it, attach, keep the
 * attachment alive, detach on close.
 *
 * One `redrob` daemon per user serves every Redrob app; Cowork is one of its clients,
 * not its owner. The fast path is a file read and a health check and spawns nothing.
 * Only when no healthy daemon is registered does this run `redrob service start --json`,
 * which keeps the start logic (version policy, stale-record cleanup, port choice) in one
 * place: the CLI. Cowork never runs `redrob serve` itself any more.
 *
 * Mirrors `packages/sdk/js/src/daemon.ts` in redrob-code (and Office's copy). Copied rather than imported
 * because the SDK release that carries it is not on npm yet, and because this must run
 * in the server with Node built-ins only.
 *
 * Protocol (redrob-code docs/LOCAL-ENGINE-API.md, section 3):
 *   - record file `$HOME/.redrob/run/server.json` (`REDROB_RUN_DIR` overrides the folder),
 *     `{id, version, url, port, pid, secret}`
 *   - auth: Basic, username `redrob`, password = record.secret
 *   - `GET /api/health` -> `{healthy: true}`
 *   - `POST /api/clients {app, pid}` -> `{id}`; `POST /api/clients/:id/heartbeat` within
 *     `ttlMs` (90s; we beat every 30s); 404 means the daemon restarted, so re-attach;
 *     `DELETE /api/clients/:id` detaches
 *   - per-request working directory: `x-redrob-directory` header (or `?directory=`)
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loopbackFetch } from "./server-fetch.js";

/** The daemon is loopback traffic, so it goes through the audited loopback client. */
type FetchLike = typeof loopbackFetch;

export type DaemonRecord = {
  readonly id: string;
  readonly version: string;
  readonly url: string;
  readonly port: number;
  readonly pid: number;
  readonly secret: string;
};

export type DaemonConnection = {
  readonly url: string;
  readonly headers: { readonly Authorization: string };
  readonly record: DaemonRecord;
  /** True when THIS call ran `redrob service start`, false when it reused a healthy daemon. */
  readonly started: boolean;
};

export type DaemonOptions = {
  /** The `redrob` binary. Default: `REDROB_CODE_BIN`, then `~/.redrob/bin/redrob`, then `redrob` on PATH. */
  readonly bin?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Minutes with no attached app before a daemon this call starts exits. 0 keeps it up. Default 10. */
  readonly idleExitMinutes?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: FetchLike;
};

/** The Basic-auth username every daemon accepts; the password is the record's secret. */
export const DAEMON_USERNAME = "redrob";

/** Header that selects the working directory for one engine request. */
export const DIRECTORY_HEADER = "x-redrob-directory";

/** How often an attachment is renewed. A third of the daemon's 90s TTL. */
export const HEARTBEAT_MS = 30_000;

export function daemonRecordPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.REDROB_RUN_DIR?.trim() || path.join(os.homedir(), ".redrob", "run"), "server.json");
}

export function daemonHeaders(secret: string): { Authorization: string } {
  return { Authorization: `Basic ${Buffer.from(`${DAEMON_USERNAME}:${secret}`).toString("base64")}` };
}

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(
    () => true,
    () => false,
  );
}

/**
 * Where a user-installed `redrob` is, by the documented resolution order, or undefined
 * when there is none. Undefined is the signal to start the shared daemon from Cowork"s
 * bundled binary instead.
 */
export async function resolveSharedRedrobBin(
  env: NodeJS.ProcessEnv = process.env,
  homedir: string = os.homedir(),
): Promise<string | undefined> {
  const explicit = env.REDROB_CODE_BIN?.trim();
  if (explicit) return explicit;
  const home = path.join(homedir, ".redrob", "bin", process.platform === "win32" ? "redrob.exe" : "redrob");
  if (await exists(home)) return home;
  const exe = process.platform === "win32" ? "redrob.exe" : "redrob";
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (dir && (await exists(path.join(dir, exe)))) return exe;
  }
  return undefined;
}

/** First Redrob Code release with `redrob service start`. Older engines print help and exit 1. */
export const MIN_SHARED_ENGINE_VERSION = "0.6.0";

export function parseEngineVersion(output: string): [number, number, number] | undefined {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(version: [number, number, number], minimum: string): boolean {
  const min = parseEngineVersion(minimum);
  if (!min) return false;
  for (let i = 0; i < 3; i += 1) {
    if (version[i] !== min[i]) return version[i] > min[i];
  }
  return true;
}

export type VersionProbe = (bin: string) => Promise<string | undefined>;

function runVersionProbe(bin: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let out = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve(undefined);
    }, 5_000);
    child.stdout?.on("data", (chunk) => (out += String(chunk)));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out : undefined);
    });
  });
}

/**
 * Whether a `redrob` binary is new enough to run `service start`. A user's own install
 * that predates the shared daemon (v0.6.0) must not be chosen over Cowork's bundled engine:
 * on 2026-10-14 a 0.5.x `~/.redrob/bin/redrob` printed the CLI help and Cowork 0.5.0 could
 * not start. Unknown (probe failed, no version in output) counts as too old.
 */
export async function engineSupportsSharedDaemon(bin: string, probe: VersionProbe = runVersionProbe): Promise<boolean> {
  const output = await probe(bin);
  if (!output) return false;
  const version = parseEngineVersion(output);
  return version !== undefined && versionAtLeast(version, MIN_SHARED_ENGINE_VERSION);
}

function isRecord(value: unknown): value is DaemonRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.version === "string" &&
    typeof v.url === "string" &&
    typeof v.port === "number" &&
    typeof v.pid === "number" &&
    typeof v.secret === "string"
  );
}

export async function readDaemonRecord(env: NodeJS.ProcessEnv = process.env): Promise<DaemonRecord | undefined> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(daemonRecordPath(env), "utf8"));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function base(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function daemonHealthy(record: DaemonRecord, fetchImpl: FetchLike = loopbackFetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${base(record.url)}/api/health`, {
      headers: daemonHeaders(record.secret),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => null)) as { healthy?: unknown } | null;
    return body?.healthy === true;
  } catch {
    return false;
  }
}

/** The registered daemon, if it answers. Spawns nothing. */
export async function currentDaemon(options: DaemonOptions = {}): Promise<DaemonConnection | undefined> {
  const env = options.env ?? process.env;
  const record = await readDaemonRecord(env);
  if (!record) return undefined;
  if (!(await daemonHealthy(record, options.fetchImpl))) return undefined;
  return { url: record.url, headers: daemonHeaders(record.secret), record, started: false };
}

function runServiceStart(options: DaemonOptions, bin: string): Promise<DaemonRecord> {
  const env = options.env ?? process.env;
  const idle = options.idleExitMinutes ?? 10;
  const timeoutMs = options.timeoutMs ?? 20_000;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["service", "start", "--json", "--idle-exit", String(idle)], {
      // REDROB_APP labels the AI work this daemon does for the Console. It is set here,
      // and only here, because this is the one place Cowork is the process that starts
      // the daemon; a daemon another app started keeps that app's label.
      env: { ...env, REDROB_APP: "cowork" },
      stdio: ["ignore", "pipe", "pipe"],
      // Console-subsystem executable on Windows: without this a console window flashes
      // behind the app.
      windowsHide: true,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`redrob service start did not answer in ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => (out += String(chunk)));
    child.stderr?.on("data", (chunk) => (err += String(chunk)));
    child.on("error", (cause) => {
      clearTimeout(timer);
      reject(new Error(`could not run ${bin}: ${cause.message}`));
    });
    // `close`, not `exit`: stdio has drained by then, so the JSON line is complete.
    child.on("close", (code) => {
      clearTimeout(timer);
      const line = out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("{"))
        .pop();
      if (code !== 0 || !line) {
        reject(new Error(`redrob service start failed (exit ${code}): ${err.trim() || out.trim()}`));
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        reject(new Error("redrob service start printed something that is not JSON"));
        return;
      }
      if (!isRecord(value)) {
        reject(new Error("redrob service start printed something that is not a daemon record"));
        return;
      }
      resolve(value);
    });
  });
}

/**
 * The shared daemon: the registered one when it answers, otherwise the one
 * `redrob service start` finds or starts with `bin`. `bin` is required here (unlike the
 * SDK) because the lifecycle decides between a user-installed `redrob` and Cowork's
 * bundled binary, and that decision should be visible at the call site.
 */
export async function connectOrStart(bin: string, options: DaemonOptions = {}): Promise<DaemonConnection> {
  const found = await currentDaemon(options);
  if (found) return found;
  const record = await runServiceStart(options, bin);
  return { url: record.url, headers: daemonHeaders(record.secret), record, started: true };
}

export type Attachment = {
  readonly id: string;
  /** Detach and stop the heartbeat. Safe to call twice. */
  readonly detach: () => Promise<void>;
};

/**
 * Tell the daemon this app depends on it, and keep saying so. The daemon drops an
 * attachment whose heartbeats stop (an app that crashed) and exits once nobody has been
 * attached for its idle window, so Cowork holds an attachment for as long as it runs.
 */
export async function attach(
  connection: DaemonConnection,
  app: string,
  options: { readonly pid?: number; readonly fetchImpl?: FetchLike; readonly intervalMs?: number } = {},
): Promise<Attachment> {
  const fetchImpl = options.fetchImpl ?? loopbackFetch;
  const root = base(connection.url);
  const headers = { ...connection.headers, "content-type": "application/json" };
  const body = JSON.stringify({ app, pid: options.pid ?? process.pid });
  const response = await fetchImpl(`${root}/api/clients`, { method: "POST", headers, body });
  if (!response.ok) throw new Error(`the engine refused the attachment (${response.status})`);
  const client = (await response.json()) as { id: string };
  let stopped = false;
  const beat = async () => {
    if (stopped) return;
    const r = await fetchImpl(`${root}/api/clients/${client.id}/heartbeat`, { method: "POST", headers }).catch(
      () => undefined,
    );
    // 404: the daemon restarted (or dropped us); attach again so it keeps counting Cowork.
    if (r && r.status === 404 && !stopped) {
      const again = await fetchImpl(`${root}/api/clients`, { method: "POST", headers, body }).catch(() => undefined);
      if (again?.ok) client.id = ((await again.json()) as { id: string }).id;
    }
  };
  const timer = setInterval(() => void beat(), options.intervalMs ?? HEARTBEAT_MS);
  timer.unref?.();
  return {
    get id() {
      return client.id;
    },
    detach: async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await fetchImpl(`${root}/api/clients/${client.id}`, { method: "DELETE", headers: connection.headers }).catch(
        () => undefined,
      );
    },
  };
}

/**
 * Key the engine uses for a project directory: absolute, normalised, lower-cased on
 * Windows, SHA-256 hex. Must match `ConfigPaths.directoryKey` in redrob-code.
 */
export function directoryKey(directory: string): string {
  let resolved = path.resolve(directory).replace(/[\\/]+$/, "");
  if (process.platform === "win32") resolved = resolved.toLowerCase();
  return createHash("sha256").update(resolved).digest("hex");
}

/**
 * Where an app writes engine config for ONE directory it works in:
 * `<state>/directories/<key>/redrob.json`. The engine reads it for every instance on that
 * directory, after the global config and before the project's own `redrob.json`, so the
 * project still wins. Outside the project tree on purpose: it never touches the user's
 * files and never shows in git. This replaces the per-process REDROB_CONFIG cowork handed
 * to an engine it spawned itself; a shared daemon has no per-app environment. After
 * writing it, `POST /instance/dispose` for the directory makes the next request rebuild
 * the instance on the new file. `<state>` is `$XDG_STATE_HOME/redrob`, else
 * `~/.local/state/redrob` (redrob-code docs/LOCAL-ENGINE-API.md, section 3).
 */
export function directoryConfigDir(directory: string, env: NodeJS.ProcessEnv = process.env): string {
  const state = env.XDG_STATE_HOME?.trim() || path.join(os.homedir(), ".local", "state");
  return path.join(state, "redrob", "directories", directoryKey(directory));
}
