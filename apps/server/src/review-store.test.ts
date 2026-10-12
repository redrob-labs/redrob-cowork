import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createParticipantId } from "./participant-profile.js";
import {
  REVIEW_MAX_COMMENTS,
  ReviewError,
  addReviewComment,
  createReviewCommentId,
  deleteReviewComment,
  mergeReview,
  readAnchor,
  readComment,
  readSessionReview,
  resolveReviewComment,
  reviewStoreInternals,
  setReviewState,
  type ReviewComment,
} from "./review-store.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";
import type { ServerConfig } from "./types.js";

const roots: string[] = [];
const previousRuntimeDb = process.env.REDROB_RUNTIME_DB;

afterEach(async () => {
  while (roots.length) await rm(roots.pop() ?? "", { recursive: true, force: true }).catch(() => {});
  if (previousRuntimeDb === undefined) delete process.env.REDROB_RUNTIME_DB;
  else process.env.REDROB_RUNTIME_DB = previousRuntimeDb;
});

async function tempConfig(): Promise<ServerConfig> {
  const root = await mkdtemp(join(tmpdir(), "redrob-review-"));
  roots.push(root);
  process.env.REDROB_RUNTIME_DB = join(root, "runtime.sqlite");
  return {
    host: "127.0.0.1",
    port: 0,
    token: "token",
    hostToken: "host-token",
    configPath: join(root, "server.json"),
    approval: { mode: "auto", timeoutMs: 0 },
    corsOrigins: [],
    workspaces: [],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
}

const park = { participantId: createParticipantId(), displayName: "Park Hyunjin" };
const kim = { participantId: createParticipantId(), displayName: "Kim Jiwon" };
const where = { workspaceId: "ws_1", sessionId: "ses_1" };

describe("review store", () => {
  test("an unknown session reads as an open review with no comments", async () => {
    const config = await tempConfig();
    expect(await readSessionReview(config, "ws_1", "ses_x")).toEqual({ comments: [], state: { status: "open", by: null, at: 0 } });
  });

  test("adds, resolves, reopens and keeps comments per session", async () => {
    const config = await tempConfig();
    const { comment } = await addReviewComment(config, {
      ...where,
      anchor: { kind: "plan-step", messageId: "msg_1", itemId: "s2" },
      author: kim,
      text: "Clause 4 cites the old act",
    });
    expect(comment.origin).toBe("local");
    const resolved = await resolveReviewComment(config, { ...where, commentId: comment.id, resolved: true, by: park }, 50);
    expect(resolved.comments[0]).toMatchObject({ resolvedAt: 50, resolvedBy: park });
    const reopened = await resolveReviewComment(config, { ...where, commentId: comment.id, resolved: false, by: park });
    expect(reopened.comments[0]?.resolvedAt).toBeUndefined();
    expect(reopened.comments[0]?.resolvedBy).toBeUndefined();
    expect((await readSessionReview(config, "ws_1", "ses_other")).comments).toEqual([]);
  });

  test("only the author removes a comment, unless the owner does", async () => {
    const config = await tempConfig();
    const { comment } = await addReviewComment(config, { ...where, anchor: { kind: "message", messageId: "msg_1" }, author: kim, text: "x" });
    await expect(deleteReviewComment(config, { ...where, commentId: comment.id, by: park, asOwner: false })).rejects.toBeInstanceOf(ReviewError);
    const after = await deleteReviewComment(config, { ...where, commentId: comment.id, by: park, asOwner: true });
    expect(after.comments).toEqual([]);
  });

  test("concurrent comments are all kept", async () => {
    const config = await tempConfig();
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        addReviewComment(config, { ...where, anchor: { kind: "message", messageId: "msg_1" }, author: kim, text: `c${index}` }),
      ),
    );
    expect((await readSessionReview(config, "ws_1", "ses_1")).comments).toHaveLength(20);
  });

  test("refuses a comment past the limit", async () => {
    const config = await tempConfig();
    const comments: ReviewComment[] = Array.from({ length: REVIEW_MAX_COMMENTS }, () => ({
      id: createReviewCommentId(),
      anchor: { kind: "message", messageId: "msg_1" },
      author: kim,
      text: "x",
      createdAt: 1,
      origin: "local",
    }));
    await mergeReview(config, { ...where, comments, origin: "handoff" });
    await expect(
      addReviewComment(config, { ...where, anchor: { kind: "message", messageId: "msg_1" }, author: kim, text: "one more" }),
    ).rejects.toBeInstanceOf(ReviewError);
  });

  test("the verdict records who set it", async () => {
    const config = await tempConfig();
    const review = await setReviewState(config, { ...where, status: "changes_requested", by: kim, note: "Fix clause 4" }, 99);
    expect(review.state).toEqual({ status: "changes_requested", by: kim, at: 99, note: "Fix clause 4" });
  });

  test("a merge skips comments already here, keeps their authors, and takes only a newer verdict", async () => {
    const config = await tempConfig();
    const { comment } = await addReviewComment(config, { ...where, anchor: { kind: "message", messageId: "msg_1" }, author: park, text: "mine" });
    await setReviewState(config, { ...where, status: "approved", by: park }, 100);
    const theirs: ReviewComment = { ...comment, id: createReviewCommentId(), author: kim, text: "theirs" };
    const older = { status: "changes_requested" as const, by: kim, at: 50 };
    const merged = await mergeReview(config, { ...where, comments: [comment, theirs], origin: "reply", state: older });
    expect(merged.added).toBe(1);
    expect(merged.review.comments.map((entry) => [entry.author.displayName, entry.origin])).toEqual([
      ["Park Hyunjin", "local"],
      ["Kim Jiwon", "reply"],
    ]);
    expect(merged.review.state.status).toBe("approved");
    const newer = await mergeReview(config, { ...where, comments: [], origin: "reply", state: { ...older, at: 200 } });
    expect(newer.review.state.status).toBe("changes_requested");
  });
});

describe("reading untrusted review data", () => {
  test("anchors need a safe message id, and an item id unless they point at a message", () => {
    expect(readAnchor({ kind: "message", messageId: "msg_1", itemId: "ignored" })).toEqual({ kind: "message", messageId: "msg_1" });
    expect(readAnchor({ kind: "claim", messageId: "msg_1", itemId: "c1" })).toEqual({ kind: "claim", messageId: "msg_1", itemId: "c1" });
    expect(readAnchor({ kind: "claim", messageId: "msg_1" })).toBeNull();
    expect(readAnchor({ kind: "message", messageId: "../etc" })).toBeNull();
    expect(readAnchor({ kind: "file", messageId: "msg_1" })).toBeNull();
  });

  test("a comment missing any part is dropped", () => {
    const good = { id: createReviewCommentId(), anchor: { kind: "message", messageId: "m" }, author: kim, text: "t", createdAt: 1 };
    expect(readComment(good)?.origin).toBe("local");
    expect(readComment({ ...good, id: "x" })).toBeNull();
    expect(readComment({ ...good, author: { participantId: "nope" } })).toBeNull();
    expect(readComment({ ...good, text: "   " })).toBeNull();
    expect(readComment({ ...good, createdAt: -1 })).toBeNull();
  });

  test("a damaged row reads as an empty review", () => {
    expect(reviewStoreInternals.parseReview("{")).toEqual({ comments: [], state: { status: "open", by: null, at: 0 } });
  });
});

describe("review routes", () => {
  test("a collaborator comments and sets the verdict; a viewer only reads", async () => {
    const harness = await startRouteTestServer();
    try {
      await harness.host("PUT", "/profile", { displayName: "Park Hyunjin" });
      const base = "/workspace/workspace/sessions/ses_abc/review";
      const posted = await harness.collaborator("POST", `${base}/comments`, {
        anchor: { kind: "plan-step", messageId: "msg_1", itemId: "s1" },
        text: "Read the amendment too",
      });
      expect(posted.status).toBe(201);
      const { comment } = (await posted.json()) as { comment: ReviewComment };
      expect(comment.author.displayName).toBe("Park Hyunjin");

      const viewer = harness.as(await harness.issueToken("viewer"));
      expect((await viewer("GET", base)).status).toBe(200);
      expect((await viewer("POST", `${base}/comments`, { anchor: { kind: "message", messageId: "m" }, text: "x" })).status).toBe(403);

      expect((await harness.collaborator("POST", `${base}/comments`, { anchor: { kind: "claim", messageId: "m" }, text: "x" })).status).toBe(400);
      expect((await harness.collaborator("POST", `${base}/comments/${comment.id}/resolve`, { resolved: true })).status).toBe(200);
      expect((await harness.collaborator("POST", `${base}/comments/rvc_bad/resolve`, { resolved: true })).status).toBe(400);
      const state = await harness.collaborator("PUT", `${base}/state`, { status: "approved", note: "Good to send" });
      expect(state.status).toBe(200);
      expect((await harness.collaborator("PUT", `${base}/state`, { status: "maybe" })).status).toBe(400);

      const read = (await (await harness.collaborator("GET", base)).json()) as { review: { comments: ReviewComment[]; state: { status: string } } };
      expect(read.review.state.status).toBe("approved");
      expect(read.review.comments[0]?.resolvedAt).toBeNumber();

      expect((await harness.collaborator("DELETE", `${base}/comments/${comment.id}`)).status).toBe(200);
      expect((await harness.collaborator("GET", "/workspace/nope/sessions/ses_abc/review")).status).toBe(404);
      expect((await harness.collaborator("GET", "/workspace/workspace/sessions/bad%20id/review")).status).toBe(400);
    } finally {
      await harness.cleanup();
    }
  });
});
