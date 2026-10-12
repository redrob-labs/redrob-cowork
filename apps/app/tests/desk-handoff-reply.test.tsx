import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { RedrobReceivedHandoff, RedrobReplyInspection, RedrobSessionReview } from "../src/app/lib/redrob-server";
import { t } from "../src/i18n";
import { HandoffBannerView, handoffFileKind, parseOpenHandoffLink } from "../src/react-app/desk/handoff/handoff-open";
import { ReplyOpenView, ReplySummary } from "../src/react-app/desk/handoff/handoff-reply";

const kim = { participantId: "par_000000000000000000000001", displayName: "Kim Jiwon" };

const REVIEW: RedrobSessionReview = {
  comments: [
    { id: "rvc_000000000000000000000001", anchor: { kind: "message", messageId: "m" }, author: kim, text: "x", createdAt: 1, origin: "local" },
    { id: "rvc_000000000000000000000002", anchor: { kind: "message", messageId: "m" }, author: kim, text: "y", createdAt: 2, origin: "local", resolvedAt: 3 },
  ],
  state: { status: "changes_requested", by: kim, at: 4 },
};

const RECEIVED: RedrobReceivedHandoff = {
  id: "hof_000000000000000000000001",
  direction: "received",
  workspaceId: "ws",
  sessionId: "ses_1",
  originSessionId: "ses_1",
  createdAt: 1,
  fromName: "Park Hyunjin",
  fromParticipantId: "par_000000000000000000000002",
  ask: "review",
};

describe("replies", () => {
  test("files are told apart by extension, and the desktop's links take both", () => {
    expect(handoffFileKind("a.redrobhandoff")).toBe("handoff");
    expect(handoffFileKind("A-Reply.RedrobReply")).toBe("reply");
    expect(handoffFileKind("a.zip")).toBeNull();
    expect(parseOpenHandoffLink("redrob://open-handoff?file=%2Fa-reply.redrobreply")).toEqual({ path: "/a-reply.redrobreply" });
  });

  test("the banner offers Send back to the sender by name", () => {
    const html = renderToStaticMarkup(<HandoffBannerView handoff={RECEIVED} busy={false} onContinue={() => {}} onReply={() => {}} />);
    expect(html).toContain(t("desk.reply_action", { name: "Park Hyunjin" }));
  });

  test("the summary shows the verdict and comments, and offers the continuation only when there is one", () => {
    const continued = renderToStaticMarkup(<ReplySummary review={REVIEW} continued includeContinuation onIncludeContinuation={() => {}} />);
    expect(continued).toContain(t("desk.review_status_changes"));
    expect(continued).toContain(t("desk.reply_comments", { count: 2 }));
    expect(continued).toContain(t("desk.review_open_count", { count: 1 }));
    expect(continued).toContain(t("desk.reply_include_continuation"));
    const reviewOnly = renderToStaticMarkup(
      <ReplySummary review={{ ...REVIEW, state: { status: "open", by: null, at: 0 } }} continued={false} includeContinuation={false} onIncludeContinuation={() => {}} />,
    );
    expect(reviewOnly).not.toContain(t("desk.reply_include_continuation"));
    expect(reviewOnly).toContain(t("desk.reply_no_verdict"));
  });

  test("an incoming reply names who, the verdict, and what comes with it", () => {
    const inspection: RedrobReplyInspection = {
      reply: { replyTo: RECEIVED.id, from: kim, createdAt: "2026-10-08T00:00:00Z", state: { status: "approved", by: kim, at: 1, note: "Send it" }, comments: 3, continued: { messages: 6 } },
      digest: "d",
      target: { workspaceId: "ws", sessionId: "ses_1" },
    };
    const html = renderToStaticMarkup(<ReplyOpenView inspection={inspection} />);
    expect(html).toContain(t("desk.reply_open_from", { name: "Kim Jiwon" }));
    expect(html).toContain(t("desk.review_status_approved"));
    expect(html).toContain("Send it");
    expect(html).toContain(t("desk.reply_open_continued", { count: 6 }));
  });
});
