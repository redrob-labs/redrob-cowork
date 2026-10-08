import { createHash, randomBytes } from "node:crypto";
import type { ServerConfig } from "./types.js";
import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";
import { isParticipantId, normalizeDisplayName } from "./participant-profile.js";

/**
 * A live room: one shared chat on the host, the people in it, and who wrote what.
 *
 * The room's record and its authorship ledger live in runtime.sqlite; presence and subscribers
 * live in memory, because they mean nothing after a restart. See
 * docs/features/handoff-and-live-coworking/README.md, "The room".
 */

export type RoomParticipant = { participantId: string; displayName: string };

export type Room = {
  roomId: string;
  workspaceId: string;
  sessionId: string;
  host: RoomParticipant;
  createdAt: number;
  endedAt?: number;
};

export type Authorship = { messageId: string; participantId: string; displayName: string; at: number };

const ROOM_ID_RE = /^room_[a-f0-9]{24}$/;
export function createRoomId(): string {
  return `room_${randomBytes(12).toString("hex")}`;
}
export function isRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_RE.test(value);
}

function readParticipant(value: unknown): RoomParticipant | null {
  if (!isRecord(value) || !isParticipantId(value.participantId)) return null;
  const name = normalizeDisplayName(value.displayName);
  return { participantId: value.participantId, displayName: name.ok ? name.value : "" };
}

function parseRoom(json: string): Room | undefined {
  try {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value) || !isRoomId(value.roomId) || typeof value.workspaceId !== "string" || typeof value.sessionId !== "string") return undefined;
    const host = readParticipant(value.host);
    if (!host) return undefined;
    return {
      roomId: value.roomId,
      workspaceId: value.workspaceId,
      sessionId: value.sessionId,
      host,
      createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
      ...(typeof value.endedAt === "number" ? { endedAt: value.endedAt } : {}),
    };
  } catch {
    return undefined;
  }
}

function parseLedger(json: string): Authorship[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.messageId !== "string") return [];
      const who = readParticipant(entry);
      return who ? [{ messageId: entry.messageId, ...who, at: typeof entry.at === "number" ? entry.at : 0 }] : [];
    });
  } catch {
    return [];
  }
}

const roomStore = createWorkspaceKvStore<Room>({
  tableName: "cowork_rooms",
  valueColumn: "room_json",
  parse: (json) => parseRoom(json) as Room,
  serialize: (value) => JSON.stringify(value),
});

const ledgerStore = createWorkspaceKvStore<Authorship[]>({
  tableName: "cowork_authorship",
  valueColumn: "ledger_json",
  parse: parseLedger,
  serialize: (value) => JSON.stringify(value),
});

const key = (workspaceId: string, sessionId: string) => `${workspaceId}/${sessionId}`;

/** The live room on this chat, or null when none is open. */
export async function activeRoom(config: ServerConfig, workspaceId: string, sessionId: string): Promise<Room | null> {
  const room = await roomStore.get(config, key(workspaceId, sessionId));
  return room && !room.endedAt ? room : null;
}

/** Opens a room on the chat, or returns the one already open. */
export async function openRoom(config: ServerConfig, input: { workspaceId: string; sessionId: string; host: RoomParticipant }): Promise<Room> {
  const existing = await activeRoom(config, input.workspaceId, input.sessionId);
  if (existing) return existing;
  const room: Room = { roomId: createRoomId(), workspaceId: input.workspaceId, sessionId: input.sessionId, host: input.host, createdAt: Date.now() };
  await roomStore.set(config, key(input.workspaceId, input.sessionId), room);
  return room;
}

export async function endRoom(config: ServerConfig, workspaceId: string, sessionId: string): Promise<Room | null> {
  const room = await activeRoom(config, workspaceId, sessionId);
  if (!room) return null;
  const ended = { ...room, endedAt: Date.now() };
  await roomStore.set(config, key(workspaceId, sessionId), ended);
  presence.delete(room.roomId);
  return ended;
}

/* ---------- Authorship ---------- */

const ledgerQueues = new Map<string, Promise<unknown>>();

export async function readAuthorship(config: ServerConfig, workspaceId: string, sessionId: string): Promise<Authorship[]> {
  return (await ledgerStore.get(config, key(workspaceId, sessionId))) ?? [];
}

/** Records who sent a message. Serialised per chat; the first record of a message id wins. */
export async function recordAuthorship(config: ServerConfig, workspaceId: string, sessionId: string, entry: Authorship): Promise<void> {
  const k = key(workspaceId, sessionId);
  const run = async () => {
    const current = (await ledgerStore.get(config, k)) ?? [];
    if (current.some((item) => item.messageId === entry.messageId)) return;
    await ledgerStore.set(config, k, [...current, entry]);
  };
  const previous = ledgerQueues.get(k) ?? Promise.resolve();
  const next = previous.then(run, run);
  ledgerQueues.set(k, next.catch(() => undefined));
  await next;
}

/** The engine's prompt body with a message id this server chose, and that id. Leaves a valid caller id alone. */
export function withServerMessageId(body: unknown, mint: () => string): { body: Record<string, unknown>; messageId: string } | null {
  if (!isRecord(body)) return null;
  const given = typeof body.messageID === "string" && /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(body.messageID) ? body.messageID : null;
  const messageId = given ?? mint();
  return { body: { ...body, messageID: messageId }, messageId };
}

/* ---------- Presence ---------- */

export const PRESENCE_TTL_MS = 45_000;

export type Presence = RoomParticipant & { role: "host" | "guest"; lastSeen: number; typing: boolean; reading?: string };

const presence = new Map<string, Map<string, Presence>>();

export function touchPresence(
  roomId: string,
  who: RoomParticipant & { role: "host" | "guest" },
  state: { typing?: boolean; reading?: string | null } = {},
  now = Date.now(),
): { changed: boolean; entry: Presence } {
  const room = presence.get(roomId) ?? new Map<string, Presence>();
  presence.set(roomId, room);
  const previous = room.get(who.participantId);
  const entry: Presence = {
    ...who,
    lastSeen: now,
    typing: state.typing ?? false,
    ...(state.reading ? { reading: state.reading } : {}),
  };
  room.set(who.participantId, entry);
  const changed =
    !previous ||
    now - previous.lastSeen > PRESENCE_TTL_MS ||
    previous.typing !== entry.typing ||
    previous.reading !== entry.reading ||
    previous.displayName !== entry.displayName;
  return { changed, entry };
}

/** Who is here now: seen within the TTL. */
export function presentIn(roomId: string, now = Date.now()): Presence[] {
  return [...(presence.get(roomId)?.values() ?? [])].filter((entry) => now - entry.lastSeen <= PRESENCE_TTL_MS);
}

export function dropPresence(roomId: string, participantId: string): void {
  presence.get(roomId)?.delete(participantId);
}

/* ---------- Events ---------- */

export type RoomEvent =
  | { type: "room.presence"; present: Presence[] }
  | { type: "room.authorship"; entry: Authorship }
  | { type: "room.participants" }
  | { type: "review.updated" }
  | { type: "room.queue"; queue: unknown[] }
  | { type: "room.ask_answered"; requestId: string; by: RoomParticipant }
  | { type: "room.stopped"; by: RoomParticipant }
  | { type: "room.ended" };

type Subscriber = { participantId: string; send: (event: RoomEvent) => void; close: () => void };
const subscribers = new Map<string, Set<Subscriber>>();

export function broadcast(roomId: string, event: RoomEvent): void {
  for (const subscriber of subscribers.get(roomId) ?? []) subscriber.send(event);
}

/** Closes a participant's event streams, as when the host removes them. */
export function disconnect(roomId: string, participantId: string): void {
  for (const subscriber of [...(subscribers.get(roomId) ?? [])]) {
    if (subscriber.participantId === participantId) subscriber.close();
  }
}

export function closeRoomStreams(roomId: string): void {
  for (const subscriber of [...(subscribers.get(roomId) ?? [])]) subscriber.close();
}

const encoder = new TextEncoder();
const frame = (event: RoomEvent) => encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

/**
 * An SSE stream of the room's events for one participant. A comment line every 15 s keeps
 * intermediaries from closing it; the stream ends when the client goes, or when it is closed.
 */
export function roomEventStream(roomId: string, participantId: string, signal: AbortSignal, initial: RoomEvent[]): ReadableStream<Uint8Array> {
  let subscriber: Subscriber | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  const cleanup = () => {
    if (keepAlive) clearInterval(keepAlive);
    keepAlive = null;
    if (subscriber) subscribers.get(roomId)?.delete(subscriber);
    subscriber = null;
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      subscriber = {
        participantId,
        send: (event) => {
          if (closed) return;
          try {
            controller.enqueue(frame(event));
          } catch {
            close();
          }
        },
        close,
      };
      const set = subscribers.get(roomId) ?? new Set<Subscriber>();
      set.add(subscriber);
      subscribers.set(roomId, set);
      controller.enqueue(encoder.encode(": connected\n\n"));
      for (const event of initial) controller.enqueue(frame(event));
      keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          close();
        }
      }, 15_000);
      signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      cleanup();
    },
  });
}

/* ---------- Invites (used by the bridge, L4) ---------- */

export function hashInviteSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export const roomInternals = { parseRoom, parseLedger, presence, subscribers };
