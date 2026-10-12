import { createHash } from "node:crypto";
import { isHandoffId } from "./handoff-bundle.js";
import { HandoffOpenError } from "./handoff-open.js";
import { readAuthor, readComment, readState, type ReviewAuthor, type ReviewComment, type ReviewState } from "./review-store.js";
import { readEngineSessionExport, type EngineSessionExport } from "./session-export.js";
import { findSecretsInText, redactMatches } from "./text-secrets.js";
import { isRecord } from "./workspace-kv-store.js";
import { readZip, writeZip } from "./zip.js";

/**
 * A `.redrobreply`: what a teammate sends back about a handoff. Their comments, their verdict,
 * and, if they continued the work, the chat as it now stands. Opened on the sender's machine, it
 * attaches to the chat the handoff came from, found by the handoff's id.
 */

export const REPLY_FORMAT = "redrob-handoff-reply";
export const REPLY_VERSION = 1;
export const REPLY_EXTENSION = ".redrobreply";

export type ReplyManifest = {
  format: typeof REPLY_FORMAT;
  v: typeof REPLY_VERSION;
  replyTo: string;
  /** The chat on the sender's machine. */
  session: { id: string };
  from: ReviewAuthor;
  createdAt: string;
  state: ReviewState;
  contents: Array<{ path: string; bytes: number; sha256: string }>;
  digest: string;
};

export type OpenedReply = {
  manifest: ReplyManifest;
  comments: ReviewComment[];
  continued: EngineSessionExport | null;
};

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function digestOf(contents: ReplyManifest["contents"]): string {
  return sha256([...contents].sort((a, b) => a.path.localeCompare(b.path)).map((entry) => `${entry.path}:${entry.sha256}`).join("\n"));
}

/**
 * The reply file. A continued chat goes with every secret-looking value redacted: there is no
 * second preview here, and the reply goes to the person who sent the work, not further.
 */
export function writeReplyBundle(input: {
  replyTo: string;
  originSessionId: string;
  from: ReviewAuthor;
  state: ReviewState;
  comments: readonly ReviewComment[];
  continued?: EngineSessionExport | null;
  now?: Date;
}): { manifest: ReplyManifest; zip: Buffer; redacted: number } {
  const entries: Array<{ name: string; data: Buffer }> = [{ name: "review.json", data: json({ comments: input.comments, state: input.state }) }];
  let redacted = 0;
  if (input.continued) {
    const text = JSON.stringify(input.continued, null, 2);
    const matches = findSecretsInText(text);
    redacted = matches.length;
    const clean = redactMatches(text, matches);
    // A redaction that broke the JSON is not sent; the comments still go.
    try {
      JSON.parse(clean);
      entries.push({ name: "session/engine.json", data: Buffer.from(`${clean}\n`, "utf8") });
    } catch {
      redacted = 0;
    }
  }
  const contents = entries.map((entry) => ({ path: entry.name, bytes: entry.data.length, sha256: sha256(entry.data) }));
  const manifest: ReplyManifest = {
    format: REPLY_FORMAT,
    v: REPLY_VERSION,
    replyTo: input.replyTo,
    session: { id: input.originSessionId },
    from: input.from,
    createdAt: (input.now ?? new Date()).toISOString(),
    state: input.state,
    contents,
    digest: digestOf(contents),
  };
  return { manifest, zip: writeZip([{ name: "manifest.json", data: json(manifest) }, ...entries]), redacted };
}

/** The reply, checked the same way a handoff is: listed, hashed, digested, nothing else inside. */
export function openReplyBundle(buffer: Buffer): OpenedReply {
  let entries;
  try {
    entries = readZip(buffer);
  } catch (error) {
    throw new HandoffOpenError("handoff_invalid", error instanceof Error ? error.message : "This is not a reply file");
  }
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]));
  const parse = (name: string) => {
    try {
      return JSON.parse(byName.get(name)?.toString("utf8") ?? "");
    } catch {
      throw new HandoffOpenError("handoff_invalid", `The reply's ${name} is damaged`);
    }
  };
  if (!byName.has("manifest.json")) throw new HandoffOpenError("handoff_invalid", "This is not a reply file");
  const raw = parse("manifest.json") as unknown;
  if (!isRecord(raw) || raw.format !== REPLY_FORMAT) throw new HandoffOpenError("handoff_invalid", "This is not a reply file");
  if (raw.v !== REPLY_VERSION) throw new HandoffOpenError("handoff_unsupported", "This reply was made by a newer Redrob Cowork. Update the app to open it");
  const from = readAuthor(raw.from);
  if (!isHandoffId(raw.replyTo) || !from || !isRecord(raw.session) || typeof raw.session.id !== "string" || !Array.isArray(raw.contents)) {
    throw new HandoffOpenError("handoff_invalid", "The reply's details are incomplete");
  }
  const contents = raw.contents.map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") {
      throw new HandoffOpenError("handoff_invalid", "The reply's contents list is damaged");
    }
    return { path: entry.path, bytes: entry.bytes, sha256: entry.sha256 };
  });
  const listed = new Map(contents.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    if (entry.name === "manifest.json") continue;
    if (entry.name !== "review.json" && entry.name !== "session/engine.json") {
      throw new HandoffOpenError("handoff_invalid", `The reply carries something it may not: ${entry.name}`);
    }
    const record = listed.get(entry.name);
    if (!record || record.bytes !== entry.data.length || record.sha256 !== sha256(entry.data)) {
      throw new HandoffOpenError("handoff_tampered", `The reply was changed after it was made: ${entry.name}`);
    }
  }
  for (const path of listed.keys()) if (!byName.has(path)) throw new HandoffOpenError("handoff_tampered", `The reply is missing ${path}`);
  if (typeof raw.digest !== "string" || digestOf(contents) !== raw.digest) {
    throw new HandoffOpenError("handoff_tampered", "The reply was changed after it was made");
  }
  const review = byName.has("review.json") ? (parse("review.json") as unknown) : {};
  const comments = isRecord(review) && Array.isArray(review.comments)
    ? review.comments.flatMap((entry) => {
        const comment = readComment(entry);
        return comment ? [comment] : [];
      })
    : [];
  let continued: EngineSessionExport | null = null;
  if (byName.has("session/engine.json")) {
    try {
      continued = readEngineSessionExport(parse("session/engine.json"));
    } catch (error) {
      if (error instanceof HandoffOpenError) throw error;
      throw new HandoffOpenError("handoff_invalid", "The continued chat in the reply is damaged");
    }
  }
  return {
    manifest: {
      format: REPLY_FORMAT,
      v: REPLY_VERSION,
      replyTo: raw.replyTo,
      session: { id: raw.session.id },
      from,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
      state: readState(raw.state),
      contents,
      digest: raw.digest,
    },
    comments,
    continued,
  };
}

/** `lease-review-reply-2026-10-08.redrobreply`. */
export function replyFileName(title: string, now = new Date()): string {
  const slug =
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "session";
  return `${slug}-reply-${now.toISOString().slice(0, 10)}${REPLY_EXTENSION}`;
}

/** What the sender sees before a reply attaches. */
export function describeReply(opened: OpenedReply) {
  return {
    replyTo: opened.manifest.replyTo,
    from: opened.manifest.from,
    createdAt: opened.manifest.createdAt,
    state: opened.manifest.state,
    comments: opened.comments.length,
    continued: opened.continued ? { messages: opened.continued.messages.length } : null,
  };
}
