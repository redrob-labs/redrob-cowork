import type {
  RedrobReviewAnchor,
  RedrobReviewAuthor,
  RedrobReviewComment,
  RedrobReviewStatus,
  RedrobSessionReview,
} from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";

/** What a comment can be about: one message, or one step or claim inside an answer. */
export type ReviewTarget = { kind: RedrobReviewAnchor["kind"]; messageId: string; itemId?: string };

/** One commentable item in a block, for the step or claim picker. */
export type ReviewItem = { id: string; label: string };

export function anchorFor(target: ReviewTarget): RedrobReviewAnchor {
  if (target.kind === "message" || !target.itemId) return { kind: "message", messageId: target.messageId };
  return { kind: target.kind, messageId: target.messageId, itemId: target.itemId };
}

function sameAnchor(a: RedrobReviewAnchor, b: RedrobReviewAnchor): boolean {
  if (a.kind !== b.kind || a.messageId !== b.messageId) return false;
  return a.kind === "message" || b.kind === "message" || a.itemId === b.itemId;
}

/** Oldest first, the order a thread reads in. */
export function commentsOn(review: RedrobSessionReview | undefined, anchor: RedrobReviewAnchor): RedrobReviewComment[] {
  return (review?.comments ?? []).filter((comment) => sameAnchor(comment.anchor, anchor)).sort((a, b) => a.createdAt - b.createdAt);
}

/** Every comment on one kind of item inside one message, grouped by the item, in the items' order. */
export function commentsByItem(
  review: RedrobSessionReview | undefined,
  kind: "plan-step" | "claim",
  messageId: string,
  items: readonly ReviewItem[],
): Array<{ item: ReviewItem; comments: RedrobReviewComment[] }> {
  return items
    .map((item) => ({ item, comments: commentsOn(review, { kind, messageId, itemId: item.id }) }))
    .filter((group) => group.comments.length > 0);
}

export function openCount(comments: readonly RedrobReviewComment[]): number {
  return comments.filter((comment) => comment.resolvedAt === undefined).length;
}

/** A name to show for an author: theirs, or a plain stand-in when they never set one. */
export function authorName(author: RedrobReviewAuthor | null | undefined): string {
  return author?.displayName.trim() || t("desk.review_unnamed");
}

export function isOwnComment(comment: RedrobReviewComment, participantId: string | null | undefined): boolean {
  return Boolean(participantId) && comment.author.participantId === participantId;
}

export function reviewStatusLabel(status: RedrobReviewStatus): string {
  switch (status) {
    case "approved":
      return t("desk.review_status_approved");
    case "changes_requested":
      return t("desk.review_status_changes");
    case "open":
      return t("desk.review_status_open");
  }
}

export function reviewStatusTone(status: RedrobReviewStatus): "success" | "warning" | "neutral" {
  if (status === "approved") return "success";
  if (status === "changes_requested") return "warning";
  return "neutral";
}

/** Short text for a step or claim in the picker: its words, cut at a word near 60 characters. */
export function itemLabel(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (Array.from(flat).length <= max) return flat;
  const cut = Array.from(flat).slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Whether the review bar is worth showing: anything said, or a verdict given. */
export function hasReviewActivity(review: RedrobSessionReview | undefined): boolean {
  return Boolean(review && (review.comments.length > 0 || review.state.status !== "open"));
}
