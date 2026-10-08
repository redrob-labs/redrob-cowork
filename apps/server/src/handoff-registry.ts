import type { ServerConfig } from "./types.js";
import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";
import { isHandoffId, type HandoffAsk } from "./handoff-bundle.js";

/**
 * Handoffs this install sent and received, so a reply can find the session it answers and an
 * opened handoff can find the workspace it was unpacked into. Ids and names only: the content
 * is in the file, and in the session it became.
 */
export type SentHandoff = {
  id: string;
  direction: "sent";
  workspaceId: string;
  sessionId: string;
  createdAt: number;
  to?: string;
  ask: HandoffAsk;
  /** When the last reply to it was applied. */
  lastReplyAt?: number;
};
export type ReceivedHandoff = {
  id: string;
  direction: "received";
  workspaceId: string;
  sessionId: string;
  /** The session id on the sender's machine, which a reply names. */
  originSessionId: string;
  createdAt: number;
  fromName: string;
  fromParticipantId: string;
  ask: HandoffAsk;
  note?: string;
  /** When the person pressed Continue; until then the chat opens for review. */
  continuedAt?: number;
  /** The engine could not read the sender's export; the chat starts from the transcript. */
  fallback?: boolean;
  /**
   * This chat's message ids to the sender's, when it was opened under new ids, so a reply's
   * comments point at the sender's messages again.
   */
  originMessageIds?: Record<string, string>;
  /** After a fallback, the sender's last message: where a reply's comments attach. */
  fallbackOriginMessageId?: string;
};
export type HandoffRecord = SentHandoff | ReceivedHandoff;

const REGISTRY_KEY = "__handoffs__";
const MAX_RECORDS = 500;

function parse(json: string): HandoffRecord[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is HandoffRecord => isRecord(entry) && isHandoffId(entry.id)) : [];
  } catch {
    return [];
  }
}

const store = createWorkspaceKvStore<HandoffRecord[]>({
  tableName: "handoff_registry",
  valueColumn: "records_json",
  parse,
  serialize: (value) => JSON.stringify(value),
});

export async function listHandoffs(config: ServerConfig): Promise<HandoffRecord[]> {
  return (await store.get(config, REGISTRY_KEY)) ?? [];
}

export async function findHandoff(config: ServerConfig, id: string, direction?: HandoffRecord["direction"]): Promise<HandoffRecord | null> {
  return (await listHandoffs(config)).find((record) => record.id === id && (!direction || record.direction === direction)) ?? null;
}

/** Newest first; the oldest fall off past the cap. Re-recording the same id and direction replaces it. */
export async function recordHandoff(config: ServerConfig, record: HandoffRecord): Promise<void> {
  const current = await listHandoffs(config);
  const rest = current.filter((entry) => !(entry.id === record.id && entry.direction === record.direction));
  await store.set(config, REGISTRY_KEY, [record, ...rest].slice(0, MAX_RECORDS));
}

/** The handoff a session on this machine was opened from, if any. */
export async function receivedHandoffForSession(config: ServerConfig, workspaceId: string, sessionId: string): Promise<ReceivedHandoff | null> {
  return (
    (await listHandoffs(config)).find(
      (record): record is ReceivedHandoff => record.direction === "received" && record.workspaceId === workspaceId && record.sessionId === sessionId,
    ) ?? null
  );
}
