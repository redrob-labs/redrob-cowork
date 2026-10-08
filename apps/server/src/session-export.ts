import { isRecord } from "./workspace-kv-store.js";
import { engineId } from "./engine-ids.js";

/**
 * The engine's session export, `redrob export <sessionID>`: `{ info, messages: [{ info, parts }] }`.
 *
 * Only the fields this server touches are typed; everything else passes through untouched, because
 * the engine owns the shape and `redrob import` validates it against its own schema.
 */
export type EngineMessage = { info: Record<string, unknown> & { id: string; role: string; sessionID: string }; parts: EnginePart[] };
export type EnginePart = Record<string, unknown> & { id: string; messageID: string; sessionID: string; type: string };
export type EngineSessionExport = {
  info: Record<string, unknown> & { id: string; title?: string; version?: string };
  messages: EngineMessage[];
};

export class SessionExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionExportError";
  }
}

const MAX_EXPORT_MESSAGES = 20_000;

/**
 * An export read from the engine or from a bundle, checked enough that rekeying and importing cannot
 * be pointed somewhere unexpected: every message and part must belong to the session it is in.
 */
export function readEngineSessionExport(value: unknown): EngineSessionExport {
  if (!isRecord(value) || !isRecord(value.info) || typeof value.info.id !== "string" || !value.info.id.startsWith("ses_")) {
    throw new SessionExportError("Not a session export: info.id is missing");
  }
  const sessionId = value.info.id;
  if (!Array.isArray(value.messages)) throw new SessionExportError("Not a session export: messages is missing");
  if (value.messages.length > MAX_EXPORT_MESSAGES) throw new SessionExportError("The session has too many messages to carry");
  const messages = value.messages.map((entry, index): EngineMessage => {
    if (!isRecord(entry) || !isRecord(entry.info) || !Array.isArray(entry.parts)) {
      throw new SessionExportError(`Message ${index + 1} is malformed`);
    }
    const info = entry.info;
    if (typeof info.id !== "string" || !info.id.startsWith("msg_") || typeof info.role !== "string") {
      throw new SessionExportError(`Message ${index + 1} has no id or role`);
    }
    if (info.sessionID !== sessionId) throw new SessionExportError(`Message ${info.id} belongs to another session`);
    const parts = entry.parts.map((part, partIndex): EnginePart => {
      if (!isRecord(part) || typeof part.id !== "string" || !part.id.startsWith("prt_") || typeof part.type !== "string") {
        throw new SessionExportError(`Part ${partIndex + 1} of message ${info.id} is malformed`);
      }
      if (part.messageID !== info.id || part.sessionID !== sessionId) {
        throw new SessionExportError(`Part ${part.id} belongs to another message`);
      }
      return part as EnginePart;
    });
    return { info: info as EngineMessage["info"], parts };
  });
  return { info: value.info as EngineSessionExport["info"], messages };
}

/** The JSON object in the engine's stdout. It writes the export and a newline, nothing else. */
export function parseEngineExportOutput(stdout: string): EngineSessionExport {
  const start = stdout.indexOf("{");
  if (start === -1) throw new SessionExportError("The engine printed no export");
  try {
    return readEngineSessionExport(JSON.parse(stdout.slice(start)));
  } catch (error) {
    if (error instanceof SessionExportError) throw error;
    throw new SessionExportError("The engine's export is not valid JSON");
  }
}

/**
 * The same session under new ids: the session, every message and every part. Importing an export
 * where its session already exists would merge into it (the engine upserts the session and skips
 * known messages), so a continuation brought back to the machine it came from must be rekeyed to
 * land beside the original. Message and part order is kept: new ids are minted in the original
 * id order, which is the engine's time order.
 */
export function rekeyEngineSessionExport(source: EngineSessionExport, options: { title?: string; now?: number } = {}): EngineSessionExport {
  const now = options.now ?? Date.now();
  const sessionId = engineId("ses", "descending", now);
  const messageIds = new Map<string, string>();
  for (const id of source.messages.map((message) => message.info.id).sort()) messageIds.set(id, engineId("msg", "ascending", now));
  const partIds = new Map<string, string>();
  for (const id of source.messages.flatMap((message) => message.parts.map((part) => part.id)).sort()) {
    partIds.set(id, engineId("prt", "ascending", now));
  }
  const mapMessage = (id: unknown) => (typeof id === "string" ? (messageIds.get(id) ?? id) : id);

  const { share: _share, parentID: _parent, revert: _revert, ...info } = source.info;
  return {
    info: { ...info, id: sessionId, ...(options.title ? { title: options.title } : {}) },
    messages: source.messages.map((message) => ({
      info: {
        ...message.info,
        id: messageIds.get(message.info.id) ?? message.info.id,
        sessionID: sessionId,
        ...("parentID" in message.info ? { parentID: mapMessage(message.info.parentID) } : {}),
      },
      parts: message.parts.map((part) => ({
        ...part,
        id: partIds.get(part.id) ?? part.id,
        messageID: messageIds.get(part.messageID) ?? part.messageID,
        sessionID: sessionId,
      })),
    })),
  };
}

/**
 * Whether two engine versions read each other's exports. Same major and minor is the engine's own
 * compatibility line; anything else is attempted, and a refusal takes the transcript fallback.
 */
export function engineVersionCompatibility(from: string | undefined, local: string): "same" | "different" | "unknown" {
  const parse = (value: string | undefined) => /^v?(\d+)\.(\d+)/.exec(value?.trim() ?? "");
  const a = parse(from);
  const b = parse(local);
  if (!a || !b) return "unknown";
  return a[1] === b[1] && a[2] === b[2] ? "same" : "different";
}

/** `Imported session: <id>` from the engine's stdout, or null. */
export function parseEngineImportOutput(stdout: string): string | null {
  const match = /Imported session:\s*(ses_[0-9A-Za-z]+)/.exec(stdout);
  return match?.[1] ?? null;
}
