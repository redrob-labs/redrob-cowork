import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { RedrobReviewComment, RedrobSessionReview } from "../src/app/lib/redrob-server";
import { t } from "../src/i18n";
import {
  anchorFor,
  authorName,
  commentsByItem,
  commentsOn,
  hasReviewActivity,
  isOwnComment,
  itemLabel,
  openCount,
} from "../src/react-app/desk/review/review-logic";
import { CommentForm, CommentList, ReviewBarView } from "../src/react-app/desk/review/review-thread";
import { claimReviewItems, planReviewItems } from "../src/react-app/desk/thread/desk-thread";

const kim = { participantId: "par_000000000000000000000001", displayName: "Kim Jiwon" };
const park = { participantId: "par_000000000000000000000002", displayName: "" };

function comment(overrides: Partial<RedrobReviewComment>): RedrobReviewComment {
  return {
    id: `rvc_${Math.random().toString(16).slice(2).padEnd(24, "0").slice(0, 24)}`,
    anchor: { kind: "message", messageId: "msg_1" },
    author: kim,
    text: "Looks right",
    createdAt: 10,
    origin: "local",
    ...overrides,
  };
}

const review = (comments: RedrobReviewComment[], status: RedrobSessionReview["state"]["status"] = "open"): RedrobSessionReview => ({
  comments,
  state: { status, by: status === "open" ? null : kim, at: 5 },
});

describe("review logic", () => {
  test("a message anchor never carries an item id", () => {
    expect(anchorFor({ kind: "message", messageId: "m", itemId: "s1" })).toEqual({ kind: "message", messageId: "m" });
    expect(anchorFor({ kind: "plan-step", messageId: "m", itemId: "s1" })).toEqual({ kind: "plan-step", messageId: "m", itemId: "s1" });
    expect(anchorFor({ kind: "claim", messageId: "m" })).toEqual({ kind: "message", messageId: "m" });
  });

  test("comments are found by anchor, oldest first", () => {
    const later = comment({ createdAt: 20, text: "second" });
    const first = comment({ createdAt: 10, text: "first" });
    const step = comment({ anchor: { kind: "plan-step", messageId: "msg_1", itemId: "s1" } });
    const r = review([later, first, step]);
    expect(commentsOn(r, { kind: "message", messageId: "msg_1" }).map((c) => c.text)).toEqual(["first", "second"]);
    expect(commentsOn(r, { kind: "plan-step", messageId: "msg_1", itemId: "s2" })).toEqual([]);
    expect(commentsOn(undefined, { kind: "message", messageId: "msg_1" })).toEqual([]);
  });

  test("item groups follow the items' order and skip items without comments", () => {
    const r = review([
      comment({ anchor: { kind: "claim", messageId: "m", itemId: "c2" } }),
      comment({ anchor: { kind: "claim", messageId: "m", itemId: "c1" } }),
    ]);
    const groups = commentsByItem(r, "claim", "m", [
      { id: "c1", label: "one" },
      { id: "c2", label: "two" },
      { id: "c3", label: "three" },
    ]);
    expect(groups.map((group) => group.item.id)).toEqual(["c1", "c2"]);
  });

  test("counts open comments, names the nameless, and knows your own", () => {
    expect(openCount([comment({}), comment({ resolvedAt: 3 })])).toBe(1);
    expect(authorName(park)).toBe(t("desk.review_unnamed"));
    expect(isOwnComment(comment({}), kim.participantId)).toBe(true);
    expect(isOwnComment(comment({}), null)).toBe(false);
  });

  test("labels are cut at a word", () => {
    expect(itemLabel("short")).toBe("short");
    const long = itemLabel("Read the lease and every amendment, then check clause fourteen against the statute", 30);
    expect(long.endsWith("…")).toBe(true);
    expect(Array.from(long).length).toBeLessThanOrEqual(31);
  });

  test("the bar shows once anything happened", () => {
    expect(hasReviewActivity(undefined)).toBe(false);
    expect(hasReviewActivity(review([]))).toBe(false);
    expect(hasReviewActivity(review([], "approved"))).toBe(true);
    expect(hasReviewActivity(review([comment({})]))).toBe(true);
  });

  test("plan steps and claims become comment targets with their anchors", () => {
    expect(planReviewItems({ sections: [], todo: [{ id: "s1", label: "Read" }, { label: "Write" }] })).toEqual([
      { id: "s1", label: "Read" },
      { id: "idx-2", label: "Write" },
    ]);
    expect(claimReviewItems({ claims: [{ verdict: "holds", claim: "30 days" }], missed: [] })).toEqual([{ id: "idx-1", label: "30 days" }]);
  });
});

describe("review views", () => {
  test("a comment shows its author and text, and Remove only on your own", () => {
    const theirs = comment({ author: park, text: "Their note" });
    const mine = comment({ text: "My note" });
    const html = renderToStaticMarkup(
      <CommentList comments={[mine, theirs]} me={kim.participantId} busy={false} onResolve={() => {}} onRemove={() => {}} />,
    );
    expect(html).toContain("My note");
    expect(html).toContain("Their note");
    expect(html).toContain("Kim Jiwon");
    expect(html).toContain(t("desk.review_unnamed"));
    expect(html.split(t("common.remove")).length - 1).toBe(1);
  });

  test("a resolved comment says so and offers Reopen", () => {
    const html = renderToStaticMarkup(
      <CommentList comments={[comment({ resolvedAt: 3 })]} me={null} busy={false} onResolve={() => {}} onRemove={() => {}} />,
    );
    expect(html).toContain(t("desk.review_resolved"));
    expect(html).toContain(t("desk.review_reopen"));
  });

  test("the form picks a step when there are steps", () => {
    const html = renderToStaticMarkup(
      <CommentForm items={[{ id: "s1", label: "Read the lease" }]} itemLabelText="Step" busy={false} onSubmit={async () => true} />,
    );
    expect(html).toContain("Read the lease");
    expect(html).toContain(t("desk.review_comment_add"));
  });

  test("the bar shows the verdict, who gave it, and the other verdicts", () => {
    const html = renderToStaticMarkup(
      <ReviewBarView review={{ ...review([comment({})], "approved"), state: { status: "approved", by: kim, at: 5, note: "Send it" } }} busy={false} onStatus={() => {}} />,
    );
    expect(html).toContain(t("desk.review_status_approved"));
    expect(html).toContain(t("desk.review_status_by", { name: "Kim Jiwon" }));
    expect(html).toContain("Send it");
    expect(html).not.toContain(`>${t("desk.review_approve")}<`);
    expect(html).toContain(t("desk.review_request_changes"));
    expect(html).toContain(t("desk.review_reopen_review"));
  });
});
