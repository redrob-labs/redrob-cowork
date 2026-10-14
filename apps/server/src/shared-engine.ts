/**
 * Redrob Cowork's connection to the shared Redrob Code daemon.
 *
 * Cowork used to spawn `redrob serve --port N` and own that process (see git history for
 * managed-opencode.ts and engine-pool.ts). One `redrob` daemon per user now serves every
 * Redrob app, so Cowork finds it (or starts it through `redrob service start`), attaches,
 * and detaches when it exits. It never kills the daemon: another app may be using it, and
 * the daemon exits by itself once nobody has been attached for its idle window.
 *
 * What the engine needs to know about a workspace no longer travels in the spawn
 * environment. It is written to the engine's per-directory config file
 * (`directoryConfigDir(workspace.path)/redrob.json`, see redrob-runtime-config.ts), and the
 * plugins get the server URL and token as plugin options from that file.
 */
import { resolve } from "node:path";
import type { loopbackFetch } from "./server-fetch.js";
import {
  attach,
  connectOrStart,
  currentDaemon,
  daemonHealthy,
  DAEMON_USERNAME,
  engineSupportsSharedDaemon,
  MIN_SHARED_ENGINE_VERSION,
  resolveSharedRedrobBin,
  type Attachment,
  type DaemonConnection,
  type DaemonRecord,
  type VersionProbe,
} from "./engine-daemon.js";

export const REDROB_CODE_BIN_NAME = "redrob";

/** Which app this server attaches as; shows up in `GET /api/clients` and the launcher's engine card. */
export const COWORK_CLIENT_APP = "cowork";

/**
 * How a Cowork process is reaching its engine, for the diagnostics page. Keeps the
 * command/args/cwd/env fields the debug view already renders (the command is what
 * `service start` ran, or would have run) and adds the daemon record, minus its secret.
 */
export type EngineExecutionSnapshot = {
  /** `attached` reused a running daemon; `started` means this process ran `redrob service start`. */
  mode: "attached" | "started";
  command: string;
  args: string[];
  cwd: string;
  env: Array<{ name: string; value: string; redacted: boolean }>;
  /** Record fields safe to show. */
  daemon: { id: string; version: string; url: string; pid: number };
};

/** The same shape cowork's server code consumed when it spawned the engine itself. */
export type SharedEngineHandle = {
  url: string;
  username: string;
  password: string;
  pid: number | null;
  execution: EngineExecutionSnapshot;
  /** Record id; changes when the daemon restarts. */
  identity: string;
  isAlive: () => boolean;
  /** Re-read the record: a daemon that restarted has a new url/secret. Returns true when anything changed. */
  refresh: () => Promise<boolean>;
  /** Detach from the daemon. The daemon itself keeps running for other apps. */
  close: () => Promise<void>;
};

export type SharedEngineOptions = {
  /** Cowork's bundled `redrob`, used only when the user has no `redrob` of their own. */
  bundledBin?: string;
  env?: NodeJS.ProcessEnv;
  idleExitMinutes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof loopbackFetch;
  logger?: { log: (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void };
};

/**
 * `REDROB_CODE_BIN` / `REDROB_OPENCODE_BIN` from the environment, when set. Kept for the
 * desktop's custom-binary setting and the CLI flag.
 */
export function resolveRedrobCodeBinEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.REDROB_CODE_BIN?.trim() || env.REDROB_OPENCODE_BIN?.trim();
  return value || undefined;
}

/**
 * The `redrob` that starts the daemon when none runs: an explicit choice first, then the
 * user's own install (`~/.redrob/bin`, PATH), then Cowork's bundled copy. A user-installed
 * engine wins over the bundle so one daemon serves every app at one version -- but only
 * when it is new enough to know `service start`; an older install is skipped for the
 * bundled engine, otherwise Cowork cannot start at all.
 */
export async function resolveEngineBin(options: {
  explicit?: string;
  bundledBin?: string;
  env?: NodeJS.ProcessEnv;
  probe?: VersionProbe;
  homedir?: string;
  logger?: SharedEngineOptions["logger"];
}): Promise<string> {
  const env = options.env ?? process.env;
  const explicit = options.explicit?.trim() || resolveRedrobCodeBinEnv(env);
  if (explicit) return explicit;
  const bundled = options.bundledBin?.trim();
  const shared = await resolveSharedRedrobBin(env, options.homedir);
  if (shared) {
    if (!bundled || (await engineSupportsSharedDaemon(shared, options.probe))) return shared;
    options.logger?.log("warn", `The installed Redrob Code at ${shared} predates ${MIN_SHARED_ENGINE_VERSION}; using the bundled engine instead.`, {
      installed: shared,
      bundled,
    });
  }
  return bundled || REDROB_CODE_BIN_NAME;
}

function snapshot(connection: DaemonConnection, bin: string): EngineExecutionSnapshot {
  const { id, version, url, pid } = connection.record;
  return {
    mode: connection.started ? "started" : "attached",
    command: bin,
    args: ["service", "start", "--json"],
    cwd: "",
    env: [{ name: "REDROB_APP", value: COWORK_CLIENT_APP, redacted: false }],
    daemon: { id, version, url, pid },
  };
}

/**
 * Find or start the shared daemon and attach to it. Resolves once the daemon answers its
 * health check and the attachment is recorded, so a request routed to `url` right after
 * this returns is served.
 */
export async function attachSharedEngine(bin: string, options: SharedEngineOptions = {}): Promise<SharedEngineHandle> {
  // The daemon needs the user's provider environment, but never the key that decrypts
  // Cowork-owned OAuth credentials, and never Cowork's own server tokens: those reach the
  // plugins as options in the directory config, not through the daemon's environment.
  const env: NodeJS.ProcessEnv = { ...(options.env ?? process.env) };
  for (const name of ["REDROB_ENCRYPTION_KEY", "REDROB_TOKEN", "REDROB_HOST_TOKEN", "REDROB_SERVER_URL", "REDROB_SERVER_TOKEN", "REDROB_CONFIG"]) {
    delete env[name];
  }
  const daemonOptions = {
    env,
    idleExitMinutes: options.idleExitMinutes,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  };
  let connection = await connectOrStart(bin, daemonOptions);
  options.logger?.log("info", connection.started ? "Started the shared Redrob Code daemon." : "Attached to the running Redrob Code daemon.", {
    "engine.url": connection.url,
    "engine.pid": connection.record.pid,
    "engine.version": connection.record.version,
    "engine.bin": bin,
  });
  let attachment: Attachment = await attach(connection, COWORK_CLIENT_APP, { fetchImpl: options.fetchImpl });
  let alive = true;
  let closed = false;
  let lastHealth = Date.now();

  const handle: SharedEngineHandle = {
    url: connection.url,
    username: DAEMON_USERNAME,
    password: connection.record.secret,
    pid: connection.record.pid,
    execution: snapshot(connection, bin),
    identity: connection.record.id,
    isAlive: () => alive && !closed,
    refresh: async () => {
      if (closed) return false;
      // Cheap path: the daemon we know still answers.
      if (Date.now() - lastHealth < 1_000 || (await daemonHealthy(connection.record, options.fetchImpl))) {
        lastHealth = Date.now();
        alive = true;
        return false;
      }
      const next = (await currentDaemon(daemonOptions)) ?? (await connectOrStart(bin, daemonOptions));
      const changed = next.record.id !== connection.record.id || next.url !== connection.url;
      if (changed) {
        await attachment.detach().catch(() => undefined);
        connection = next;
        attachment = await attach(connection, COWORK_CLIENT_APP, { fetchImpl: options.fetchImpl });
        handle.url = connection.url;
        handle.password = connection.record.secret;
        handle.pid = connection.record.pid;
        handle.execution = snapshot(connection, bin);
        handle.identity = connection.record.id;
        options.logger?.log("warn", "The Redrob Code daemon restarted; following the new record.", {
          "engine.url": connection.url,
          "engine.pid": connection.record.pid,
        });
      }
      alive = true;
      lastHealth = Date.now();
      return changed;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      alive = false;
      await attachment.detach();
    },
  };
  return handle;
}

/** Absolute form the engine keys instances (and directory config) by. */
export function engineDirectory(path: string): string {
  return resolve(path);
}

export type { DaemonRecord };
