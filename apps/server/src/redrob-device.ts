import { randomUUID } from "node:crypto";

import { ApiError } from "./errors.js";
import { externalFetch } from "./server-fetch.js";

/**
 * Connecting Redrob Cowork to a console workspace without anyone handling the key.
 *
 * The console implements RFC 8628's device authorization grant. Work asks it for a code, sends the
 * user to the console to approve that code, and polls until the console hands back a workspace API
 * key. The key then goes exactly where a pasted one goes: straight to Redrob Code's auth store
 * through putRedrobEngineAuth. This module is only the conversation with the console.
 *
 * Two decisions worth stating.
 *
 * The device code stays here. It is the bearer of the pending connection, so the renderer is given
 * an opaque local id instead and never holds a value that could be collected from it. The pending
 * connections live in memory only: a connection that does not survive a restart is a connection the
 * user starts again in ten seconds, and persisting a device code would mean writing a credential to
 * disk in the one flow whose whole point is not doing that.
 *
 * Nothing here retries on its own. Every refusal from the console is returned to the caller as what
 * it is, and a caller that keeps polling past a denial gets the same answer, because the console
 * will never turn a refused code into a key.
 */

/**
 * The console's machine API. Mirrors REDROB_BASE_URL in
 * apps/app/src/react-app/domains/settings/redrob-provider.ts, which is the app-side source of truth
 * for the same host; apps/app/tests/redrob-device-connect.test.ts asserts the two agree, because a
 * device flow pointed at a different console than the inference calls would fail in a way that looks
 * like a bad key.
 */
export const REDROB_CONSOLE_API_BASE_URL = "https://console.redrob.ai/api/backend/v1";

/** What this product calls itself on the console's confirm screen. */
export const REDROB_DEVICE_PRODUCT = "work";

/**
 * Ten minutes is the console's own deadline. Held here as a floor for the record's lifetime so a
 * console that stopped sending `expiresIn` cannot leave a pending connection in memory forever.
 */
const FALLBACK_TTL_MS = 10 * 60_000;
const FALLBACK_INTERVAL_MS = 5_000;
/** More than a person will ever have open at once, and a bound on a caller looping on start. */
const MAX_PENDING = 8;

export type RedrobDeviceFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** What the renderer is told: enough to show a code and open a browser, and no device code. */
export type RedrobDeviceConnectionStart = {
  id: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  /** Wall-clock milliseconds, so the caller can count down without trusting its own clock offset. */
  expiresAt: number;
  intervalMs: number;
};

/**
 * Every way a poll can end. `pending` and `slow_down` mean keep waiting; `unreachable` means the
 * console could not be reached and the caller may try again; everything else is final.
 */
export type RedrobDevicePollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "connected"; key: string }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "unreachable" }
  | { status: "failed"; code: string };

type PendingConnection = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: number;
  intervalMs: number;
};

export type RedrobDeviceConnectionsOptions = {
  fetchImpl?: RedrobDeviceFetch;
  /** Overridable so the suites can answer as the console without reaching the network. */
  baseUrl?: string;
  now?: () => number;
  newId?: () => string;
};

export type RedrobDeviceConnections = {
  start(product?: string): Promise<RedrobDeviceConnectionStart>;
  poll(id: string): Promise<RedrobDevicePollResult>;
  cancel(id: string): boolean;
  /** Diagnostic only, for the suites. Never contains a device code. */
  pendingCount(): number;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createRedrobDeviceConnections(
  options: RedrobDeviceConnectionsOptions = {},
): RedrobDeviceConnections {
  /**
   * console.redrob.ai is external egress, so this goes through externalFetch rather than the global:
   * under Electron that is Chromium's stack, which is what respects the system proxy and the system
   * certificate store an enterprise install depends on.
   */
  const fetchImpl: RedrobDeviceFetch = options.fetchImpl ?? externalFetch;
  const baseUrl = (options.baseUrl ?? REDROB_CONSOLE_API_BASE_URL).replace(/\/+$/, "");
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? (() => randomUUID());

  const pending = new Map<string, PendingConnection>();

  function prune(): void {
    const at = now();
    for (const [id, record] of pending) {
      if (record.expiresAt <= at) pending.delete(id);
    }
  }

  async function start(product = REDROB_DEVICE_PRODUCT): Promise<RedrobDeviceConnectionStart> {
    prune();
    if (pending.size >= MAX_PENDING) {
      throw new ApiError(
        429,
        "device_connect_busy",
        "Too many connection attempts are already waiting. Finish or cancel one first.",
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/device/authorize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product }),
      });
    } catch {
      throw new ApiError(
        502,
        "console_unreachable",
        "Could not reach console.redrob.ai to start the connection.",
      );
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        "device_start_rejected",
        "console.redrob.ai would not start the connection.",
      );
    }

    const body = await readJson(response);
    const deviceCode = text(body.deviceCode);
    const userCode = text(body.userCode);
    const verificationUri = text(body.verificationUri);
    /**
     * The console sends the prefilled form as well, but it is only a convenience: if it is missing,
     * the bare page plus a typed code is the same flow, so this falls back rather than failing.
     */
    const verificationUriComplete = text(body.verificationUriComplete) || verificationUri;

    if (!deviceCode || !userCode || !verificationUri) {
      throw new ApiError(
        502,
        "device_start_incomplete",
        "console.redrob.ai did not return a usable connection code.",
      );
    }

    const expiresInSeconds = positiveNumber(body.expiresIn);
    const intervalSeconds = positiveNumber(body.interval);
    const record: PendingConnection = {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresAt: now() + (expiresInSeconds ? expiresInSeconds * 1000 : FALLBACK_TTL_MS),
      intervalMs: intervalSeconds ? intervalSeconds * 1000 : FALLBACK_INTERVAL_MS,
    };

    const id = newId();
    pending.set(id, record);

    return {
      id,
      userCode: record.userCode,
      verificationUri: record.verificationUri,
      verificationUriComplete: record.verificationUriComplete,
      expiresAt: record.expiresAt,
      intervalMs: record.intervalMs,
    };
  }

  async function poll(id: string): Promise<RedrobDevicePollResult> {
    const record = pending.get(id);
    /**
     * An id we are not holding is not an error worth a stack trace: it is a poll that arrived after
     * the key was collected, after a cancel, or after a restart. Saying "expired" tells the caller
     * to start again, which is the only useful thing it can do.
     */
    if (!record) return { status: "expired" };

    if (record.expiresAt <= now()) {
      pending.delete(id);
      return { status: "expired" };
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: record.deviceCode }),
      });
    } catch {
      // Kept pending: a lost network is worth retrying, unlike a refusal.
      return { status: "unreachable" };
    }

    const body = await readJson(response);

    if (response.ok) {
      const key = text(body.apiKey);
      if (!key) {
        pending.delete(id);
        return { status: "failed", code: "missing_key" };
      }
      // Dropped before the key is handed back, so one approval can only ever be collected once.
      pending.delete(id);
      return { status: "connected", key };
    }

    const code = text(body.error);
    if (code === "authorization_pending") return { status: "pending" };
    if (code === "slow_down") return { status: "slow_down" };

    if (code === "access_denied") {
      pending.delete(id);
      return { status: "denied" };
    }
    if (code === "expired_token") {
      pending.delete(id);
      return { status: "expired" };
    }

    /**
     * Anything else, including invalid_grant and a console that answered with no code at all, is
     * final. Nothing here converts it into another attempt: the console has said this device code
     * will never produce a key, and polling on would only hide that.
     */
    pending.delete(id);
    return { status: "failed", code: code || `http_${response.status}` };
  }

  function cancel(id: string): boolean {
    return pending.delete(id);
  }

  return { start, poll, cancel, pendingCount: () => pending.size };
}
