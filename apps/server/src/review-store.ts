import { randomBytes } from "node:crypto";
import type { ServerConfig } from "./types.js";
import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";
import { isParticipantId, normalizeDisplayName } from "./participant-profile.js";

/**
 * Comments and a verdict on one session, from whoever reviewed it.
 *
 * A handoff carries these to a teammate and a reply brings theirs back; a live room shows them as
 * they are written. One row per session, keyed `<workspaceId>/<sessionId>`, so a session moved
 * between workspaces keeps its review only if the move carries it (it does not, today).
 */

export const REVIEW_ANCHOR_KINDS = ["message", "plan-step", "claim"] as const;
export type ReviewAnchorKind = (typeof REVIEW_ANCHOR_KINDS)[number];
export type ReviewAnchor = { kind: ReviewAnchorKind; messageId: string; itemId?: string };

export const REVIEW_STATUSES = ["open", "approved", "changes_requested"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_ORIGINS = ["local", "handoff", "reply", "room"] as const;
export type ReviewOrigin = (typeof REVIEW_ORIGINS)[number];

export type ReviewAuthor = { participantId: string; displayName: string };

export type ReviewComment = {
  id: string;
  anchor: ReviewAnchor;
  author: ReviewAuthor;
  text: string;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: ReviewAuthor;
  origin: ReviewOrigin;
};

export type ReviewState = { status: ReviewStatus; by: ReviewAuthor | null; at: number; note?: string };

export type SessionReview = { comments: ReviewComment[]; state: ReviewState };

export const REVIEW_TEXT_MAX_LENGTH = 4000;
export const REVIEW_NOTE_MAX_LENGTH = 1000;
export const REVIEW_MAX_COMMENTS = 500;

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const COMMENT_ID_RE = /^rvc_[a-f0-9]{24}$/;

export function createReviewCommentId(): string {
  return `rvc_${randomBytes(12).toString("hex")}`;
}

export function isReviewCommentId(value: unknown): value is string {
  return typeof value === "string" && COMMENT_ID_RE.test(value);
}

/** Engine session and message ids, and desk block item ids: letters, digits, `_` and `-`. */
export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

export function emptyReview(): SessionReview {
  return { comments: [], state: { status: "open", by: null, at: 0 } };
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function readAnchor(value: unknown): ReviewAnchor | null {
  if (!isRecord(value) || !oneOf(REVIEW_ANCHOR_KINDS, value.kind) || !isSafeId(value.messageId)) return null;
  if (value.kind === "message") return { kind: "message", messageId: value.messageId };
  return isSafeId(value.itemId) ? { kind: value.kind, messageId: value.messageId, itemId: value.itemId } : null;
}

export function readAuthor(value: unknown): ReviewAuthor | null {
  if (!isRecord(value) || !isParticipantId(value.participantId)) return null;
  const name = normalizeDisplayName(value.displayName);
  return { participantId: value.participantId, displayName: name.ok ? name.value : "" };
}

/** Comment text as stored: trimmed, non-empty, bounded. Null when it cannot be stored. */
export function readCommentText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || Array.from(text).length > REVIEW_TEXT_MAX_LENGTH) return null;
  return text;
}

function readTime(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** One comment from storage or from a bundle; null when any required part is missing. */
export function readComment(value: unknown): ReviewComment | null {
  if (!isRecord(value) || !isReviewCommentId(value.id)) return null;
  const anchor = readAnchor(value.anchor);
  const author = readAuthor(value.author);
  const text = readCommentText(value.text);
  const createdAt = readTime(value.createdAt);
  if (!anchor || !author || !text || createdAt === undefined) return null;
  const resolvedAt = readTime(value.resolvedAt);
  const resolvedBy = readAuthor(value.resolvedBy);
  return {
    id: value.id,
    anchor,
    author,
    text,
    createdAt,
    ...(resolvedAt !== undefined ? { resolvedAt } : {}),
    ...(resolvedAt !== undefined && resolvedBy ? { resolvedBy } : {}),
    origin: oneOf(REVIEW_ORIGINS, value.origin) ? value.origin : "local",
  };
}

export function readNote(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const note = value.trim();
  if (!note) return undefined;
  return Array.from(note).length > REVIEW_NOTE_MAX_LENGTH ? null : note;
}

export function readState(value: unknown): ReviewState {
  if (!isRecord(value) || !oneOf(REVIEW_STATUSES, value.status)) return emptyReview().state;
  const note = readNote(value.note);
  return {
    status: value.status,
    by: readAuthor(value.by),
    at: readTime(value.at) ?? 0,
    ...(typeof note === "string" ? { note } : {}),
  };
}

function parseReview(json: string): SessionReview {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed)) return emptyReview();
    const comments = Array.isArray(parsed.comments)
      ? parsed.comments.flatMap((entry) => {
          const comment = readComment(entry);
          return comment ? [comment] : [];
        })
      : [];
    return { comments, state: readState(parsed.state) };
  } catch {
    return emptyReview();
  }
}

const reviewStore = createWorkspaceKvStore<SessionReview>({
  tableName: "session_reviews",
  valueColumn: "review_json",
  parse: parseReview,
  serialize: (value) => JSON.stringify(value),
});

function reviewKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}/${sessionId}`;
}

/**
 * Read-modify-write per session, one at a time. Two comments posted at once from two clients
 * would otherwise both read the same list and the second write would drop the first.
 */
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  const settled = next.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}

export class ReviewError extends Error {
  constructor(
    readonly code: "comment_not_found" | "not_comment_author" | "too_many_comments",
    message: string,
  ) {
    super(message);
  }
}

export async function readSessionReview(config: ServerConfig, workspaceId: string, sessionId: string): Promise<SessionReview> {
  return (await reviewStore.get(config, reviewKey(workspaceId, sessionId))) ?? emptyReview();
}

async function updateReview(
  config: ServerConfig,
  workspaceId: string,
  sessionId: string,
  change: (current: SessionReview) => SessionReview,
): Promise<SessionReview> {
  const key = reviewKey(workspaceId, sessionId);
  return serialized(key, async () => {
    const next = change((await reviewStore.get(config, key)) ?? emptyReview());
    await reviewStore.set(config, key, next);
    return next;
  });
}

export async function addReviewComment(
  config: ServerConfig,
  input: { workspaceId: string; sessionId: string; anchor: ReviewAnchor; author: ReviewAuthor; text: string; origin?: ReviewOrigin },
  now = Date.now(),
): Promise<{ comment: ReviewComment; review: SessionReview }> {
  const comment: ReviewComment = {
    id: createReviewCommentId(),
    anchor: input.anchor,
    author: input.author,
    text: input.text,
    createdAt: now,
    origin: input.origin ?? "local",
  };
  const review = await updateReview(config, input.workspaceId, input.sessionId, (current) => {
    if (current.comments.length >= REVIEW_MAX_COMMENTS) {
      throw new ReviewError("too_many_comments", `A session holds at most ${REVIEW_MAX_COMMENTS} comments`);
    }
    return { ...current, comments: [...current.comments, comment] };
  });
  return { comment, review };
}

/** Marks a comment resolved, or open again. Anyone who can comment can do either. */
export async function resolveReviewComment(
  config: ServerConfig,
  input: { workspaceId: string; sessionId: string; commentId: string; resolved: boolean; by: ReviewAuthor },
  now = Date.now(),
): Promise<SessionReview> {
  return updateReview(config, input.workspaceId, input.sessionId, (current) => {
    if (!current.comments.some((comment) => comment.id === input.commentId)) {
      throw new ReviewError("comment_not_found", "Comment not found");
    }
    return {
      ...current,
      comments: current.comments.map((comment) => {
        if (comment.id !== input.commentId) return comment;
        const { resolvedAt: _at, resolvedBy: _by, ...open } = comment;
        return input.resolved ? { ...open, resolvedAt: now, resolvedBy: input.by } : open;
      }),
    };
  });
}

/** Removes a comment. Only its author may, unless `asOwner` (the person at this machine). */
export async function deleteReviewComment(
  config: ServerConfig,
  input: { workspaceId: string; sessionId: string; commentId: string; by: ReviewAuthor; asOwner: boolean },
): Promise<SessionReview> {
  return updateReview(config, input.workspaceId, input.sessionId, (current) => {
    const target = current.comments.find((comment) => comment.id === input.commentId);
    if (!target) throw new ReviewError("comment_not_found", "Comment not found");
    if (!input.asOwner && target.author.participantId !== input.by.participantId) {
      throw new ReviewError("not_comment_author", "Only the comment's author can remove it");
    }
    return { ...current, comments: current.comments.filter((comment) => comment.id !== input.commentId) };
  });
}

export async function setReviewState(
  config: ServerConfig,
  input: { workspaceId: string; sessionId: string; status: ReviewStatus; by: ReviewAuthor; note?: string },
  now = Date.now(),
): Promise<SessionReview> {
  return updateReview(config, input.workspaceId, input.sessionId, (current) => ({
    ...current,
    state: { status: input.status, by: input.by, at: now, ...(input.note ? { note: input.note } : {}) },
  }));
}

/**
 * Adds comments that arrived from elsewhere (a handoff, a reply), skipping ids already here, and
 * optionally takes their verdict. Each comment keeps its own author: it is a record of what that
 * person wrote, not something this install says.
 */
export async function mergeReview(
  config: ServerConfig,
  input: { workspaceId: string; sessionId: string; comments: readonly ReviewComment[]; origin: ReviewOrigin; state?: ReviewState },
): Promise<{ added: number; review: SessionReview }> {
  let added = 0;
  const review = await updateReview(config, input.workspaceId, input.sessionId, (current) => {
    const known = new Set(current.comments.map((comment) => comment.id));
    const incoming = input.comments
      .filter((comment) => !known.has(comment.id))
      .slice(0, Math.max(0, REVIEW_MAX_COMMENTS - current.comments.length))
      .map((comment) => ({ ...comment, origin: input.origin }));
    added = incoming.length;
    const state = input.state && input.state.at >= current.state.at ? input.state : current.state;
    return { comments: [...current.comments, ...incoming], state };
  });
  return { added, review };
}

export const reviewStoreInternals = { parseReview, reviewKey };
