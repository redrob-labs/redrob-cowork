import { ApiError } from "./errors.js";
import type { Actor } from "./types.js";
import { isRecord } from "./workspace-kv-store.js";

/**
 * What a guest in a live room may reach on the host: one chat, read, plus what the host granted.
 *
 * A guest token is a collaborator token narrowed to one workspace and one session. Every route a
 * guest can call is listed here; anything else is refused. Responses that would show other chats
 * (session lists, pending asks, the engine's event stream) are filtered to the shared one. See
 * docs/features/handoff-and-live-coworking/README.md, "Guest tokens".
 */

export const GUEST_CAPABILITIES = ["send", "approve", "stop"] as const;
export type GuestCapability = (typeof GUEST_CAPABILITIES)[number];
export const DEFAULT_GUEST_CAPABILITIES: readonly GuestCapability[] = ["send", "stop"];

/** Guest tokens last at most this long, whatever the room asks for. */
export const MAX_GUEST_TOKEN_MS = 7 * 24 * 60 * 60 * 1000;

export type GuestGrant = {
  workspaceId: string;
  sessionId: string;
  participant: { participantId: string; displayName: string };
  capabilities: GuestCapability[];
  /** The P2P endpoint the token is bound to (L4). Without one, the token is loopback-only. */
  endpointId?: string;
  /** The room the guest joined (L2). */
  roomId?: string;
  /** Turns run in the read-only Plan agent, and commands are refused. Set by the host per guest. */
  planOnly?: boolean;
};

export function readCapabilities(value: unknown): GuestCapability[] | null {
  if (!Array.isArray(value)) return null;
  const out: GuestCapability[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !(GUEST_CAPABILITIES as readonly string[]).includes(entry)) return null;
    if (!out.includes(entry as GuestCapability)) out.push(entry as GuestCapability);
  }
  return out;
}

export function guestOf(actor: Actor | undefined): GuestGrant | null {
  return actor?.guest ?? null;
}

function forbidden(message = "Guests can only reach the shared chat"): never {
  throw new ApiError(403, "guest_forbidden", message);
}

export function requireCapability(guest: GuestGrant, capability: GuestCapability): void {
  if (!guest.capabilities.includes(capability)) {
    const what = capability === "send" ? "send messages" : capability === "approve" ? "answer what the agent asks" : "stop the agent";
    throw new ApiError(403, "guest_capability_missing", `The host has not let you ${what}`);
  }
}

function decode(segment: string | undefined): string {
  try {
    return decodeURIComponent(segment ?? "");
  } catch {
    return "";
  }
}

/**
 * The redrob-server routes a guest may call. `pathname` is after any `/w/<id>` mount was taken off.
 * Returns a response filter for routes whose answer must be narrowed to the shared chat.
 */
export function assertGuestRoute(guest: GuestGrant, method: string, pathname: string): ((body: unknown) => unknown) | null {
  const m = method.toUpperCase();
  if (m === "GET" && ["/capabilities", "/whoami", "/profile", "/health"].includes(pathname)) return null;
  if (m === "GET" && pathname === "/workspaces") return filterWorkspaceList(guest);

  const workspace = /^\/workspace\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!workspace) forbidden();
  if (decode(workspace[1]) !== guest.workspaceId) forbidden();
  const rest = workspace[2] ?? "";

  if (m === "GET" && rest === "/sessions") return filterSessionItems(guest);
  const session = /^\/sessions\/([^/]+)(\/.*)?$/.exec(rest);
  if (!session || decode(session[1]) !== guest.sessionId) forbidden();
  const tail = session[2] ?? "";
  if (m === "GET" && (tail === "" || tail === "/messages" || tail === "/snapshot")) return null;
  // Review: reading and commenting; the verdict stays with the host's people.
  if (tail === "/review" && m === "GET") return null;
  if (/^\/review\/comments(\/[^/]+(\/resolve)?)?$/.test(tail) && (m === "POST" || m === "DELETE")) return null;
  // The live room itself (L2).
  if (tail === "/room" || tail.startsWith("/room/")) return null;
  forbidden();
}

function filterWorkspaceList(guest: GuestGrant) {
  return (body: unknown) => {
    if (!isRecord(body) || !Array.isArray(body.items)) return body;
    const items = body.items.filter((item) => isRecord(item) && item.id === guest.workspaceId);
    return { ...body, items, activeId: guest.workspaceId };
  };
}

function filterSessionItems(guest: GuestGrant) {
  return (body: unknown) => {
    if (!isRecord(body) || !Array.isArray(body.items)) return body;
    return { ...body, items: body.items.filter((item) => isRecord(item) && item.id === guest.sessionId) };
  };
}

/** Engine reads every chat screen needs that say nothing about other chats. */
const GLOBAL_ENGINE_READS = new Set(["/config", "/config/providers", "/provider", "/agent", "/command", "/path", "/project/current"]);

export type GuestEngineAccess =
  | { kind: "plain" }
  | { kind: "events" }
  | { kind: "filter"; filter: (body: unknown) => unknown }
  | { kind: "action"; action: "message.sent" | "run.stopped" | "permission.answered" | "question.answered" };

/**
 * The engine calls a guest may make through `/opencode/*`. `path` is the normalised engine path
 * (no `/opencode` prefix, no trailing slash). Permission and question replies need `approve`;
 * which session the ask belongs to is checked where asks are arbitrated (L3).
 */
export function assertGuestEngineRequest(guest: GuestGrant, method: string, path: string): GuestEngineAccess {
  const m = method.toUpperCase();
  const session = /^\/session\/([^/]+)(\/.*)?$/.exec(path);
  if (m === "GET" || m === "HEAD") {
    if (path === "/event" || path === "/global/event" || path === "/api/event") return { kind: "events" };
    if (GLOBAL_ENGINE_READS.has(path)) return { kind: "plain" };
    if (path === "/session") return { kind: "filter", filter: filterSessionArray(guest) };
    if (path === "/session/status") return { kind: "filter", filter: filterStatusMap(guest) };
    if (["/permission", "/question", "/api/permission/request", "/api/question/request"].includes(path)) {
      return { kind: "filter", filter: filterPending(guest) };
    }
    if (session && decode(session[1]) === guest.sessionId) return { kind: "plain" };
    forbidden();
  }
  if (m === "POST") {
    if (session && decode(session[1]) === guest.sessionId) {
      const tail = session[2] ?? "";
      if (tail === "/prompt_async" || tail === "/message" || tail === "/command") {
        requireCapability(guest, "send");
        // A command can pick its own agent, so a plan-only guest sends messages only.
        if (tail === "/command" && guest.planOnly) {
          throw new ApiError(403, "guest_plan_only", "The host has limited you to Plan mode, which takes messages, not commands");
        }
        return { kind: "action", action: "message.sent" };
      }
      if (tail === "/abort") {
        requireCapability(guest, "stop");
        return { kind: "action", action: "run.stopped" };
      }
      if (/^\/permissions\/[^/]+$/.test(tail)) {
        requireCapability(guest, "approve");
        return { kind: "action", action: "permission.answered" };
      }
    }
    if (/^\/permission\/[^/]+\/reply$/.test(path)) {
      requireCapability(guest, "approve");
      return { kind: "action", action: "permission.answered" };
    }
    if (/^\/question\/[^/]+\/(reply|reject)$/.test(path)) {
      requireCapability(guest, "approve");
      return { kind: "action", action: "question.answered" };
    }
  }
  forbidden("Guests can send, stop and answer in the shared chat, nothing else");
}

/** The session an engine record belongs to, wherever the engine put the id. */
export function engineSessionIdOf(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["sessionID", "sessionId"]) {
    if (typeof value[key] === "string") return value[key] as string;
  }
  for (const key of ["info", "part", "properties", "request", "permission"]) {
    const nested = engineSessionIdOf(value[key]);
    if (nested) return nested;
  }
  return null;
}

function filterSessionArray(guest: GuestGrant) {
  return (body: unknown) => (Array.isArray(body) ? body.filter((item) => isRecord(item) && item.id === guest.sessionId) : body);
}

function filterStatusMap(guest: GuestGrant) {
  return (body: unknown) => {
    if (!isRecord(body)) return body;
    return guest.sessionId in body ? { [guest.sessionId]: body[guest.sessionId] } : {};
  };
}

function filterPending(guest: GuestGrant) {
  const keep = (items: unknown[]) => items.filter((item) => engineSessionIdOf(item) === guest.sessionId);
  return (body: unknown) => {
    if (Array.isArray(body)) return keep(body);
    if (!isRecord(body)) return body;
    const next: Record<string, unknown> = { ...body };
    for (const key of ["items", "permissions", "questions", "requests"]) {
      if (Array.isArray(next[key])) next[key] = keep(next[key] as unknown[]);
    }
    return next;
  };
}

/** Events with no session that a guest still needs: the stream's own keep-alives. */
const SESSIONLESS_EVENTS = new Set(["server.connected", "server.heartbeat"]);

/** Whether one engine event may go to a guest of `sessionId`. */
export function guestMaySeeEvent(event: unknown, sessionId: string): boolean {
  if (!isRecord(event)) return false;
  const inner = isRecord(event.payload) ? event.payload : event;
  const type = typeof inner.type === "string" ? inner.type : "";
  const properties = isRecord(inner.properties) ? inner.properties : {};
  // session.updated and friends carry the session itself as `info`.
  const id = engineSessionIdOf(properties) ?? (type.startsWith("session.") && isRecord(properties.info) ? (properties.info.id as string | undefined) : null);
  if (id) return id === sessionId;
  return SESSIONLESS_EVENTS.has(type);
}

/**
 * An SSE body with every event a guest may not see taken out. Events are split on the blank line
 * that ends them; an event whose data does not parse is dropped, not passed through.
 */
export function filterGuestEventStream(body: ReadableStream<Uint8Array>, sessionId: string): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const keep = (block: string): boolean => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return block.split(/\r?\n/).every((line) => line.startsWith(":") || line.trim() === "");
    try {
      return guestMaySeeEvent(JSON.parse(data), sessionId);
    } catch {
      return false;
    }
  };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary !== -1) {
          const match = /\r?\n\r?\n/.exec(buffer.slice(boundary))!;
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + match[0].length);
          if (block.trim() && keep(block)) controller.enqueue(encoder.encode(`${block}\n\n`));
          boundary = buffer.search(/\r?\n\r?\n/);
        }
      },
    }),
  );
}

/** A JSON response with its body narrowed for a guest. Non-JSON and error responses pass through. */
export async function filterJsonResponse(response: Response, filter: (body: unknown) => unknown): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) return response;
  const body = await response.json().catch(() => undefined);
  if (body === undefined) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(filter(body)), { status: response.status, statusText: response.statusText, headers });
}

/**
 * A plan-only guest's prompt body, with the turn on the Plan agent whatever it asked for. Null
 * for anyone else. Throws for a body that cannot be read, rather than letting it through as is.
 */
export function planOnlyBody(guest: GuestGrant | undefined, body: unknown, planAgent: string): Record<string, unknown> | null {
  if (!guest?.planOnly) return null;
  if (!isRecord(body)) throw new ApiError(400, "invalid_payload", "A message body is required");
  return { ...body, agent: planAgent };
}
