import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { LoginError, NotAvailableError } from "./errors.js";
import { osKeychain, type TokenStore } from "./keychain.js";

export { LoginError, NotAvailableError } from "./errors.js";
export { KEYCHAIN_SERVICE, osKeychain, type TokenStore } from "./keychain.js";

/**
 * Desktop sign-in with redrob-auth (RFC 8252 loopback + PKCE S256, RFC 8628 device code).
 *
 * The caller is a local Node/Bun process (Cowork's apps/server), never a renderer: the access token
 * stays in this process's memory and the refresh token goes only to the OS keychain. Apps do not
 * hand tokens to each other; each logs in with its own client id.
 */

export const DEFAULT_ISSUER = "https://auth.redrob.io";
const SCOPE = "openid profile email";
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const REFRESH_SKEW_MS = 60_000;
const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export type LoginOptions = {
  /** redrob-auth issuer. Defaults to production; an empty string means login is not configured. */
  issuer?: string;
  /** Where the refresh token is kept. Defaults to the OS keychain. */
  store?: TokenStore;
  /** Opens a URL in the system browser. Defaults to the OS opener. */
  openBrowser?: (url: string) => void | Promise<void>;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

export type DeviceCode = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
};

export type UserInfo = {
  sub: string;
  email?: string;
  name?: string;
  [claim: string]: unknown;
};

type Endpoints = {
  authorization: string;
  token: string;
  revocation: string;
  endSession: string;
  userinfo: string;
  deviceAuthorization?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

type Ctx = {
  clientId: string;
  issuer: string;
  endpoints: Endpoints;
  store: TokenStore;
  fetch: typeof globalThis.fetch;
};

/** OAuth error codes that mean "this client or grant is not set up", so the caller should fall back. */
const NOT_AVAILABLE_CODES = new Set(["invalid_client", "unauthorized_client", "unsupported_grant_type"]);

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

async function context(clientId: string, opts: LoginOptions): Promise<Ctx> {
  const issuer = (opts.issuer ?? DEFAULT_ISSUER).replace(/\/+$/, "");
  if (!issuer) throw new NotAvailableError("not_configured", "no redrob-auth issuer configured");
  const doFetch = opts.fetch ?? globalThis.fetch;
  let discovery: Record<string, unknown> = {};
  try {
    const res = await doFetch(`${issuer}/.well-known/openid-configuration`, { signal: opts.signal });
    if (res.ok) discovery = (await res.json()) as Record<string, unknown>;
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    throw new LoginError("unreachable", `redrob-auth discovery failed: ${(error as Error).message}`);
  }
  const pick = (key: string, fallback: string) => (typeof discovery[key] === "string" ? (discovery[key] as string) : fallback);
  const endpoints: Endpoints = {
    authorization: pick("authorization_endpoint", `${issuer}/oauth/authorize`),
    token: pick("token_endpoint", `${issuer}/oauth/token`),
    revocation: pick("revocation_endpoint", `${issuer}/oauth/revoke`),
    endSession: pick("end_session_endpoint", `${issuer}/oauth/logout`),
    userinfo: pick("userinfo_endpoint", `${issuer}/oauth/userinfo`),
    deviceAuthorization:
      typeof discovery.device_authorization_endpoint === "string" ? discovery.device_authorization_endpoint : undefined,
  };
  return { clientId, issuer, endpoints, store: opts.store ?? osKeychain(), fetch: doFetch };
}

async function postForm(ctx: Ctx, url: string, form: Record<string, string>, signal?: AbortSignal): Promise<Response> {
  try {
    return await ctx.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new LoginError("unreachable", (error as Error).message);
  }
}

async function oauthError(res: Response): Promise<{ code: string; description?: string }> {
  try {
    const body = (await res.json()) as { error?: string; error_description?: string };
    return { code: body.error ?? `http_${res.status}`, description: body.error_description };
  } catch {
    return { code: `http_${res.status}` };
  }
}

function toError({ code, description }: { code: string; description?: string }): Error {
  return NOT_AVAILABLE_CODES.has(code) ? new NotAvailableError(code, description) : new LoginError(code, description);
}

/** Token grant; throws typed errors and never echoes token values. */
async function requestToken(ctx: Ctx, form: Record<string, string>, signal?: AbortSignal): Promise<TokenResponse> {
  const res = await postForm(ctx, ctx.endpoints.token, { client_id: ctx.clientId, ...form }, signal);
  if (!res.ok) throw toError(await oauthError(res));
  const body = (await res.json()) as TokenResponse;
  if (typeof body.access_token !== "string") throw new LoginError("invalid_token_response");
  return body;
}

/** `exp` from the access token itself when it is a JWT; otherwise `expires_in` from the response. */
function expiryOf(token: TokenResponse): number {
  const part = token.access_token.split(".")[1];
  if (part) {
    try {
      const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { exp?: unknown };
      if (typeof payload.exp === "number") return payload.exp * 1000;
    } catch {
      // not a JWT; fall through
    }
  }
  return Date.now() + (token.expires_in ?? 3600) * 1000;
}

export class Session {
  readonly clientId: string;
  #ctx: Ctx;
  #access: string;
  #expiresAt: number;
  #refresh: string | undefined;
  #idToken: string | undefined;
  #refreshing: Promise<string> | undefined;

  /** @internal */
  constructor(ctx: Ctx, token: TokenResponse, refresh: string | undefined) {
    this.clientId = ctx.clientId;
    this.#ctx = ctx;
    this.#access = token.access_token;
    this.#expiresAt = expiryOf(token);
    this.#refresh = token.refresh_token ?? refresh;
    this.#idToken = token.id_token;
  }

  /** @internal */
  static async create(ctx: Ctx, token: TokenResponse, refresh?: string): Promise<Session> {
    const session = new Session(ctx, token, refresh);
    if (token.refresh_token) await ctx.store.set(ctx.clientId, token.refresh_token);
    return session;
  }

  /** A valid access token, refreshed when it is within 60 s of `exp`. */
  async accessToken(): Promise<string> {
    if (Date.now() < this.#expiresAt - REFRESH_SKEW_MS) return this.#access;
    this.#refreshing ??= this.#doRefresh().finally(() => {
      this.#refreshing = undefined;
    });
    return this.#refreshing;
  }

  async #doRefresh(): Promise<string> {
    const refresh = this.#refresh;
    if (!refresh) throw new LoginError("login_required", "no refresh token");
    let token: TokenResponse;
    try {
      token = await requestToken(this.#ctx, { grant_type: "refresh_token", refresh_token: refresh });
    } catch (error) {
      if (error instanceof LoginError && error.code === "invalid_grant") {
        // Revoked, expired or already rotated: the stored token is dead, so the next start asks for a login.
        this.#refresh = undefined;
        await this.#ctx.store.delete(this.clientId).catch(() => undefined);
        throw new LoginError("login_required", error.message);
      }
      throw error;
    }
    this.#access = token.access_token;
    this.#expiresAt = expiryOf(token);
    if (token.id_token) this.#idToken = token.id_token;
    if (token.refresh_token) {
      // redrob-auth rotates refresh tokens on every use.
      this.#refresh = token.refresh_token;
      await this.#ctx.store.set(this.clientId, token.refresh_token);
    }
    return this.#access;
  }

  async userinfo(): Promise<UserInfo> {
    const access = await this.accessToken();
    let res: Response;
    try {
      res = await this.#ctx.fetch(this.#ctx.endpoints.userinfo, {
        headers: { authorization: `Bearer ${access}`, accept: "application/json" },
      });
    } catch (error) {
      throw new LoginError("unreachable", (error as Error).message);
    }
    if (!res.ok) throw toError(await oauthError(res));
    return (await res.json()) as UserInfo;
  }

  /** Revoke + RP-initiated logout, both best effort; the stored refresh token is always deleted. */
  async logout(): Promise<void> {
    const refresh = this.#refresh;
    const idToken = this.#idToken;
    this.#refresh = undefined;
    this.#idToken = undefined;
    this.#access = "";
    this.#expiresAt = 0;
    if (refresh) {
      await postForm(this.#ctx, this.#ctx.endpoints.revocation, {
        client_id: this.clientId,
        token: refresh,
        token_type_hint: "refresh_token",
      }).catch(() => undefined);
    }
    if (idToken) {
      const url = new URL(this.#ctx.endpoints.endSession);
      url.searchParams.set("id_token_hint", idToken);
      url.searchParams.set("client_id", this.clientId);
      await this.#ctx.fetch(url, { method: "POST" }).catch(() => undefined);
    }
    await this.#ctx.store.delete(this.clientId);
  }
}

function defaultOpenBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true, windowsHide: true });
  child.on("error", () => undefined);
  child.unref();
}

const PAGE_OK =
  "<!doctype html><meta charset=utf-8><title>Redrob</title><p>Signed in. You can close this tab and return to the app.</p>";
const PAGE_FAIL =
  "<!doctype html><meta charset=utf-8><title>Redrob</title><p>Sign-in did not complete. Return to the app and try again.</p>";

type Callback = { code: string } | { error: string; description?: string };

/** Listens on 127.0.0.1:<random>/callback until one request with the right `state` arrives. */
function listenForCallback(state: string): Promise<{ redirectUri: string; result: Promise<Callback>; close: () => void }> {
  return new Promise((resolveListen, rejectListen) => {
    let settle: (value: Callback) => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const result = new Promise<Callback>((res, rej) => {
      settle = res;
      fail = rej;
    });
    // A bad callback can arrive before login() starts awaiting; it is still seen by the race.
    result.catch(() => undefined);
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method !== "GET" || url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const send = (status: number, body: string) =>
        res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(body);
      if (url.searchParams.get("state") !== state) {
        send(400, PAGE_FAIL);
        fail(new LoginError("state_mismatch", "callback state did not match"));
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (error || !code) {
        send(400, PAGE_FAIL);
        settle({ error: error ?? "invalid_request", description: url.searchParams.get("error_description") ?? undefined });
        return;
      }
      send(200, PAGE_OK);
      settle({ code });
    });
    server.on("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolveListen({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        result,
        close: () => {
          server.close();
          server.closeAllConnections?.();
        },
      });
    });
  });
}

/** Authorization Code + PKCE S256 through the system browser and a loopback redirect. */
export async function login(clientId: string, opts: LoginOptions = {}): Promise<Session> {
  const ctx = await context(clientId, opts);
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));
  const listener = await listenForCallback(state);
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const authorize = new URL(ctx.endpoints.authorization);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: listener.redirectUri,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    const stop = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LoginError("timeout", "login was not completed within 5 minutes")), LOGIN_TIMEOUT_MS);
      onAbort = () => reject(new LoginError("aborted"));
      opts.signal?.addEventListener("abort", onAbort, { once: true });
    });
    stop.catch(() => undefined);
    await (opts.openBrowser ?? defaultOpenBrowser)(authorize.toString());
    const callback = await Promise.race([listener.result, stop]);
    if ("error" in callback) throw toError({ code: callback.error, description: callback.description });
    const token = await requestToken(
      ctx,
      { grant_type: "authorization_code", code: callback.code, redirect_uri: listener.redirectUri, code_verifier: verifier },
      opts.signal,
    );
    return await Session.create(ctx, token);
  } finally {
    clearTimeout(timer);
    if (onAbort) opts.signal?.removeEventListener("abort", onAbort);
    listener.close();
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new LoginError("aborted"));
      },
      { once: true },
    );
  });
}

/** RFC 8628 device authorization grant; `onCode` is told what to show the user. */
export async function loginWithDeviceCode(
  clientId: string,
  onCode: (code: DeviceCode) => void | Promise<void>,
  opts: LoginOptions = {},
): Promise<Session> {
  const ctx = await context(clientId, opts);
  if (!ctx.endpoints.deviceAuthorization) {
    throw new NotAvailableError("unsupported_grant_type", "redrob-auth does not advertise device authorization");
  }
  const res = await postForm(ctx, ctx.endpoints.deviceAuthorization, { client_id: clientId, scope: SCOPE }, opts.signal);
  if (!res.ok) throw toError(await oauthError(res));
  const da = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval?: number;
  };
  await onCode({
    userCode: da.user_code,
    verificationUri: da.verification_uri,
    verificationUriComplete: da.verification_uri_complete,
    expiresIn: da.expires_in,
  });
  const deadline = Date.now() + da.expires_in * 1000;
  let intervalMs = (da.interval ?? 5) * 1000;
  for (;;) {
    await sleep(intervalMs, opts.signal);
    if (Date.now() > deadline) throw new LoginError("expired_token", "device code expired");
    try {
      const token = await requestToken(ctx, { grant_type: DEVICE_CODE_GRANT, device_code: da.device_code }, opts.signal);
      return await Session.create(ctx, token);
    } catch (error) {
      if (!(error instanceof LoginError)) throw error;
      if (error.code === "authorization_pending" || error.code === "unreachable") continue;
      if (error.code === "slow_down") {
        intervalMs += 5000;
        continue;
      }
      throw error;
    }
  }
}

/**
 * The session kept in the keychain from an earlier login, or null when there is none or it is no
 * longer valid. Refreshes once so the returned session holds a live access token.
 */
export async function resume(clientId: string, opts: LoginOptions = {}): Promise<Session | null> {
  const ctx = await context(clientId, opts);
  const refresh = await ctx.store.get(clientId);
  if (!refresh) return null;
  const session = new Session(ctx, { access_token: "", expires_in: 0 }, refresh);
  try {
    await session.accessToken();
  } catch (error) {
    if (error instanceof LoginError && error.code === "login_required") return null;
    throw error;
  }
  return session;
}
