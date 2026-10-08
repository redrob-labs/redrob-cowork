import { randomBytes } from "node:crypto";
import type { RoomParticipant } from "./cowork-room.js";
import { isRecord } from "./workspace-kv-store.js";

/**
 * The room's shared queue, and who answered what.
 *
 * A message sent while the agent works waits here with its author, in order, visible to everyone.
 * When the chat goes idle the next one is sent. Asks (permissions, questions) are answered once:
 * the first valid reply wins and the rest are told who answered. Both are in memory: a restart
 * empties the queue, and the engine has the answers.
 */

export type QueueItem = {
  id: string;
  author: RoomParticipant;
  /** The engine prompt body, without a message id; one is picked when it is sent. */
  body: Record<string, unknown>;
  /** The message's text, for the list. */
  preview: string;
  createdAt: number;
};

export type QueueView = Omit<QueueItem, "body">;

export const MAX_QUEUE = 50;
export const PREVIEW_MAX = 280;

export function createQueueItemId(): string {
  return `rq_${randomBytes(8).toString("hex")}`;
}

/** The text a person typed, from an engine prompt body: its text parts, joined. */
export function promptPreview(body: Record<string, unknown>): string {
  const parts = Array.isArray(body.parts) ? body.parts : [];
  const text = parts
    .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
  return Array.from(text).slice(0, PREVIEW_MAX).join("");
}

export class QueueError extends Error {
  constructor(
    readonly code: "queue_full" | "queue_item_not_found" | "not_queue_author" | "queue_item_invalid",
    message: string,
  ) {
    super(message);
  }
}

const queues = new Map<string, QueueItem[]>();

export function queueView(roomId: string): QueueView[] {
  return (queues.get(roomId) ?? []).map(({ body: _body, ...rest }) => rest);
}

export function enqueue(roomId: string, author: RoomParticipant, body: unknown, now = Date.now()): QueueItem {
  if (!isRecord(body) || !Array.isArray(body.parts) || body.parts.length === 0) {
    throw new QueueError("queue_item_invalid", "A queued message needs parts");
  }
  const list = queues.get(roomId) ?? [];
  if (list.length >= MAX_QUEUE) throw new QueueError("queue_full", `At most ${MAX_QUEUE} messages can wait`);
  const { messageID: _drop, ...rest } = body;
  const item: QueueItem = { id: createQueueItemId(), author, body: rest, preview: promptPreview(rest), createdAt: now };
  queues.set(roomId, [...list, item]);
  return item;
}

function find(roomId: string, id: string, by: RoomParticipant, isHost: boolean): { list: QueueItem[]; index: number } {
  const list = queues.get(roomId) ?? [];
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) throw new QueueError("queue_item_not_found", "That message is no longer waiting");
  if (!isHost && list[index]!.author.participantId !== by.participantId) {
    throw new QueueError("not_queue_author", "Only its author or the host can change a waiting message");
  }
  return { list, index };
}

/** Replaces a waiting message's text. Its author or the host. */
export function editQueued(roomId: string, id: string, text: string, by: RoomParticipant, isHost: boolean): QueueItem {
  const trimmed = text.trim();
  if (!trimmed) throw new QueueError("queue_item_invalid", "A message needs text");
  const { list, index } = find(roomId, id, by, isHost);
  const current = list[index]!;
  const body = { ...current.body, parts: [{ type: "text", text: trimmed }] };
  const next = { ...current, body, preview: promptPreview(body) };
  queues.set(roomId, list.map((item, at) => (at === index ? next : item)));
  return next;
}

export function removeQueued(roomId: string, id: string, by: RoomParticipant, isHost: boolean): void {
  const { list, index } = find(roomId, id, by, isHost);
  queues.set(roomId, list.filter((_, at) => at !== index));
}

export function clearQueue(roomId: string): void {
  queues.delete(roomId);
  const timer = drains.get(roomId);
  if (timer) clearInterval(timer);
  drains.delete(roomId);
}

/** What draining needs from the engine. */
export type QueueEngine = {
  busy(): Promise<boolean>;
  send(body: Record<string, unknown>, item: QueueItem): Promise<void>;
};

const drains = new Map<string, ReturnType<typeof setInterval>>();
const sending = new Set<string>();

/**
 * Sends the next waiting message if the chat is idle. Returns the item sent, or null. One send at a
 * time per room; a failed send puts the item back at the front.
 */
export async function drainOnce(roomId: string, engine: QueueEngine): Promise<QueueItem | null> {
  if (sending.has(roomId)) return null;
  const list = queues.get(roomId) ?? [];
  if (list.length === 0) return null;
  sending.add(roomId);
  try {
    if (await engine.busy()) return null;
    const [next, ...rest] = queues.get(roomId) ?? [];
    if (!next) return null;
    queues.set(roomId, rest);
    try {
      await engine.send(next.body, next);
      return next;
    } catch (error) {
      queues.set(roomId, [next, ...(queues.get(roomId) ?? [])]);
      throw error;
    }
  } finally {
    sending.delete(roomId);
  }
}

/** Keeps draining on a beat while anything waits; stops itself when the queue is empty. */
export function scheduleDrain(roomId: string, engine: () => QueueEngine, onSent: (item: QueueItem) => void, everyMs = 2000): void {
  if (drains.has(roomId)) return;
  const tick = async () => {
    if ((queues.get(roomId) ?? []).length === 0) {
      const timer = drains.get(roomId);
      if (timer) clearInterval(timer);
      drains.delete(roomId);
      return;
    }
    const sent = await drainOnce(roomId, engine()).catch(() => null);
    if (sent) onSent(sent);
  };
  drains.set(roomId, setInterval(() => void tick(), everyMs));
  void tick();
}

/* ---------- Asks ---------- */

const ANSWER_MEMORY_MS = 10 * 60 * 1000;
const answered = new Map<string, { by: RoomParticipant; at: number }>();

/** The first reply to an ask takes it. Later ones learn who answered. */
export function claimAsk(requestId: string, by: RoomParticipant, now = Date.now()): { ok: true } | { ok: false; by: RoomParticipant } {
  for (const [id, entry] of answered) if (now - entry.at > ANSWER_MEMORY_MS) answered.delete(id);
  const existing = answered.get(requestId);
  if (existing) return { ok: false, by: existing.by };
  answered.set(requestId, { by, at: now });
  return { ok: true };
}

/** The engine refused the reply, so the ask is open again. */
export function releaseAsk(requestId: string): void {
  answered.delete(requestId);
}

export const queueInternals = { queues, answered, drains };
