import { ApiError } from "../errors.js";
import { readParticipantProfile } from "../participant-profile.js";
import {
  REVIEW_STATUSES,
  ReviewError,
  addReviewComment,
  deleteReviewComment,
  isReviewCommentId,
  isSafeId,
  readAnchor,
  readCommentText,
  readNote,
  readSessionReview,
  resolveReviewComment,
  setReviewState,
  type ReviewAuthor,
  type ReviewStatus,
} from "../review-store.js";
import type { ServerConfig, TokenScope, WorkspaceInfo } from "../types.js";
import { addRoute, type RequestContext, type Route } from "./registry.js";

type JsonResponse = (data: unknown, status?: number) => Response;
type ReadJsonBody = (request: Request) => Promise<Record<string, unknown>>;

interface RegisterReviewRoutesOptions {
  routes: Route[];
  config: ServerConfig;
  jsonResponse: JsonResponse;
  readJsonBody: ReadJsonBody;
  ensureWritable: (config: ServerConfig) => void;
  requireClientScope: (ctx: RequestContext, required: TokenScope) => void;
  resolveWorkspaceWithoutBootstrap: (config: ServerConfig, id: string) => Promise<WorkspaceInfo>;
  /** Who is making this request, as a review author. */
  resolveAuthor: (ctx: RequestContext) => Promise<ReviewAuthor>;
}

/** This install's profile, as a review author. */
export async function installAuthor(config: ServerConfig): Promise<ReviewAuthor> {
  const profile = await readParticipantProfile(config);
  return { participantId: profile.participantId, displayName: profile.displayName };
}

/** The author of a request: a guest is themselves; everyone else is the person at this machine. */
export async function actorAuthor(config: ServerConfig, ctx: RequestContext): Promise<ReviewAuthor> {
  return ctx.actor?.guest ? { ...ctx.actor.guest.participant } : installAuthor(config);
}

function isStatus(value: unknown): value is ReviewStatus {
  return typeof value === "string" && (REVIEW_STATUSES as readonly string[]).includes(value);
}

function reviewFailure(error: unknown): never {
  if (error instanceof ReviewError) {
    if (error.code === "comment_not_found") throw new ApiError(404, error.code, error.message);
    if (error.code === "not_comment_author") throw new ApiError(403, error.code, error.message);
    throw new ApiError(409, error.code, error.message);
  }
  throw error;
}

/**
 * `/workspace/:id/sessions/:sessionId/review`: the comments and the verdict on one session.
 * Reading needs any token; writing needs collaborator. The session is not looked up in the
 * engine: a review can exist for a session this machine imported but has not opened yet.
 */
export function registerReviewRoutes(options: RegisterReviewRoutesOptions): void {
  const { routes, config, jsonResponse, readJsonBody, ensureWritable, requireClientScope, resolveWorkspaceWithoutBootstrap, resolveAuthor } =
    options;

  const target = async (ctx: RequestContext) => {
    const workspace = await resolveWorkspaceWithoutBootstrap(config, ctx.params.id ?? "");
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!isSafeId(sessionId)) throw new ApiError(400, "invalid_payload", "sessionId is invalid");
    return { workspaceId: workspace.id, sessionId };
  };

  const commentId = (ctx: RequestContext) => {
    const id = (ctx.params.commentId ?? "").trim();
    if (!isReviewCommentId(id)) throw new ApiError(400, "invalid_payload", "commentId is invalid");
    return id;
  };

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/review", "client", async (ctx) => {
    const { workspaceId, sessionId } = await target(ctx);
    return jsonResponse({ review: await readSessionReview(config, workspaceId, sessionId) });
  });

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/review/comments", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const { workspaceId, sessionId } = await target(ctx);
    const body = await readJsonBody(ctx.request);
    const anchor = readAnchor(body.anchor);
    if (!anchor) throw new ApiError(400, "invalid_payload", "anchor is invalid");
    const text = readCommentText(body.text);
    if (!text) throw new ApiError(400, "invalid_payload", "text is required and must be 4000 characters or fewer");
    const author = await resolveAuthor(ctx);
    const result = await addReviewComment(config, { workspaceId, sessionId, anchor, author, text }).catch(reviewFailure);
    return jsonResponse(result, 201);
  });

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/review/comments/:commentId/resolve", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const { workspaceId, sessionId } = await target(ctx);
    const body = await readJsonBody(ctx.request);
    if (typeof body.resolved !== "boolean") throw new ApiError(400, "invalid_payload", "resolved must be a boolean");
    const by = await resolveAuthor(ctx);
    const review = await resolveReviewComment(config, { workspaceId, sessionId, commentId: commentId(ctx), resolved: body.resolved, by }).catch(
      reviewFailure,
    );
    return jsonResponse({ review });
  });

  addRoute(routes, "DELETE", "/workspace/:id/sessions/:sessionId/review/comments/:commentId", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const { workspaceId, sessionId } = await target(ctx);
    const by = await resolveAuthor(ctx);
    const asOwner = ctx.actor?.type === "host" || ctx.actor?.scope === "owner";
    const review = await deleteReviewComment(config, { workspaceId, sessionId, commentId: commentId(ctx), by, asOwner }).catch(reviewFailure);
    return jsonResponse({ review });
  });

  addRoute(routes, "PUT", "/workspace/:id/sessions/:sessionId/review/state", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const { workspaceId, sessionId } = await target(ctx);
    const body = await readJsonBody(ctx.request);
    if (!isStatus(body.status)) throw new ApiError(400, "invalid_payload", `status must be one of ${REVIEW_STATUSES.join(", ")}`);
    const note = readNote(body.note);
    if (note === null) throw new ApiError(400, "invalid_payload", "note must be a string of 1000 characters or fewer");
    const by = await resolveAuthor(ctx);
    const review = await setReviewState(config, { workspaceId, sessionId, status: body.status, by, ...(note ? { note } : {}) });
    return jsonResponse({ review });
  });
}
