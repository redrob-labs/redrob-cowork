/**
 * The shared engine this server is attached to, per config. Replaces the engine pool's
 * registry: there is one engine, owned by nobody here, so the only thing the proxy needs
 * is a way to say "that request did not reach it" -- after which the handle re-reads the
 * daemon record, because a restarted daemon has a new url and secret.
 */
import type { SharedEngineHandle } from "./shared-engine.js";
import type { ServerConfig } from "./types.js";

const engines = new WeakMap<ServerConfig, SharedEngineHandle>();
const refreshing = new WeakMap<ServerConfig, Promise<boolean>>();

export function setSharedEngineForConfig(config: ServerConfig, engine: SharedEngineHandle): void {
  engines.set(config, engine);
}

export function clearSharedEngineForConfig(config: ServerConfig): void {
  engines.delete(config);
}

export function sharedEngineForConfig(config: ServerConfig): SharedEngineHandle | undefined {
  return engines.get(config);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEngineConnectionFailure(error: unknown): boolean {
  // Node/undici occasionally drops the transport cause. This classifier is
  // only used for managed OpenCode engine traffic, never external egress.
  if (error instanceof TypeError && error.message === "fetch failed" && error.cause === undefined) return true;
  const visited = new Set<object>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === "string") {
      return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|socket hang up|Unable to connect|Headers Timeout Error/i.test(current);
    }
    if (!isRecord(current) || visited.has(current)) return false;
    visited.add(current);
    const code = current.code;
    if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") return true;
    const message = current.message;
    if (typeof message === "string" && /ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|socket hang up|Unable to connect|Headers Timeout Error/i.test(message)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * Called by the proxy when a request to the engine failed at the transport. Coalesces
 * concurrent reports into one refresh. Resolves true when the handle moved to a new daemon
 * record (the config's workspace URLs were updated by the handle's owner).
 */
export function reportEngineRequestFailure(config: ServerConfig, error: unknown): Promise<boolean> {
  const engine = engines.get(config);
  if (!engine || !isEngineConnectionFailure(error)) return Promise.resolve(false);
  const inFlight = refreshing.get(config);
  if (inFlight) return inFlight;
  const job = engine
    .refresh()
    .catch(() => false)
    .finally(() => refreshing.delete(config));
  refreshing.set(config, job);
  return job;
}
