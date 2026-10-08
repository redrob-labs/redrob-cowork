/** @jsxImportSource react */
import { useState } from "react";
import { create } from "zustand";
import { Avatar, Badge, Button, Select, Textarea, Timestamp } from "@redrob-labs/ui";

import type { RedrobReviewAnchor, RedrobReviewComment, RedrobReviewStatus, RedrobSessionReview } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import {
  anchorFor,
  authorName,
  commentsByItem,
  commentsOn,
  hasReviewActivity,
  isOwnComment,
  itemLabel,
  openCount,
  reviewStatusLabel,
  reviewStatusTone,
  type ReviewItem,
} from "./review-logic";
import { useDeskConnection } from "../shell/desk-connection";
import { useDeskThread } from "../thread/desk-thread-context";
import { useSessionReview, type SessionReviewApi } from "./use-session-review";

/** Which message's comment box is open. One at a time, so the thread does not fill with boxes. */
export const useReviewUi = create<{ openFor: string | null; toggle(messageId: string): void; close(): void }>()((set, get) => ({
  openFor: null,
  toggle: (messageId) => set({ openFor: get().openFor === messageId ? null : messageId }),
  close: () => set({ openFor: null }),
}));

/* ---------- Views: props in, markup out ---------- */

export type CommentListProps = {
  comments: readonly RedrobReviewComment[];
  me: string | null;
  busy: boolean;
  onResolve: (commentId: string, resolved: boolean) => void;
  onRemove: (commentId: string) => void;
};

export function CommentList(props: CommentListProps) {
  return (
    <ul className="desk-review__list" aria-label={t("desk.review_comments_label")}>
      {props.comments.map((comment) => {
        const resolved = comment.resolvedAt !== undefined;
        const name = authorName(comment.author);
        return (
          <li key={comment.id} className="desk-review__comment" data-resolved={resolved || undefined}>
            <Avatar size="xs" name={name} seed={comment.author.participantId} />
            <div className="desk-review__body">
              <p className="desk-review__meta">
                <b>{name}</b> <Timestamp at={comment.createdAt} relative precision="minute" />
                {resolved ? (
                  <Badge size="sm" tone="success" variant="subtle">
                    {t("desk.review_resolved")}
                  </Badge>
                ) : null}
              </p>
              <p className="desk-review__text">{comment.text}</p>
              <div className="desk-review__actions">
                <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onResolve(comment.id, !resolved)}>
                  {resolved ? t("desk.review_reopen") : t("desk.review_resolve")}
                </Button>
                {isOwnComment(comment, props.me) ? (
                  <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onRemove(comment.id)}>
                    {t("common.remove")}
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export type CommentFormProps = {
  /** Steps or claims to choose from; without them the comment is on the whole message. */
  items?: readonly ReviewItem[];
  itemLabelText?: string;
  busy: boolean;
  onSubmit: (text: string, itemId?: string) => Promise<boolean>;
  onCancel?: () => void;
};

export function CommentForm(props: CommentFormProps) {
  const [text, setText] = useState("");
  const [itemId, setItemId] = useState(props.items?.[0]?.id ?? "");
  const canSend = text.trim().length > 0 && !props.busy && (!props.items || Boolean(itemId));
  return (
    <form
      className="desk-review__form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        void props.onSubmit(text, props.items ? itemId : undefined).then((ok) => {
          if (ok) setText("");
        });
      }}
    >
      {props.items ? (
        <Select
          size="sm"
          label={props.itemLabelText}
          value={itemId}
          options={props.items.map((item) => ({ value: item.id, label: item.label }))}
          onChange={(_event, option) => setItemId(String(option?.value ?? ""))}
        />
      ) : null}
      <Textarea label={t("desk.review_comment_label")} rows={2} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="desk-review__actions">
        <Button type="submit" size="sm" variant="secondary" loading={props.busy} disabled={!canSend}>
          {t("desk.review_comment_add")}
        </Button>
        {props.onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export type ReviewBarViewProps = {
  review: RedrobSessionReview;
  busy: boolean;
  onStatus: (status: RedrobReviewStatus) => void;
};

/** Where the review stands: the verdict and who gave it, open comments, and the verdict buttons. */
export function ReviewBarView(props: ReviewBarViewProps) {
  const { state } = props.review;
  const open = openCount(props.review.comments);
  return (
    <section className="desk-review__bar" aria-label={t("desk.review_bar_label")}>
      <div className="desk-review__state">
        <Badge tone={reviewStatusTone(state.status)} dot>
          {reviewStatusLabel(state.status)}
        </Badge>
        {state.by && state.status !== "open" ? (
          <span>
            {t("desk.review_status_by", { name: authorName(state.by) })} <Timestamp at={state.at} relative precision="minute" />
          </span>
        ) : null}
        <span>{t("desk.review_open_count", { count: open })}</span>
      </div>
      {state.note ? <p className="desk-review__note">{state.note}</p> : null}
      <div className="desk-review__actions">
        {state.status !== "approved" ? (
          <Button size="sm" variant="secondary" disabled={props.busy} onClick={() => props.onStatus("approved")}>
            {t("desk.review_approve")}
          </Button>
        ) : null}
        {state.status !== "changes_requested" ? (
          <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onStatus("changes_requested")}>
            {t("desk.review_request_changes")}
          </Button>
        ) : null}
        {state.status !== "open" ? (
          <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onStatus("open")}>
            {t("desk.review_reopen_review")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- Wired to the session ---------- */

function listProps(api: SessionReviewApi) {
  return { me: api.me, busy: api.busy, onResolve: api.resolve, onRemove: api.remove };
}

/** Whether review can run here: a chat route has connected to the local server. No queries until then. */
function useReviewConnected(sessionId: string | null | undefined): boolean {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  return Boolean(client && workspaceId && sessionId);
}

type MessageReviewProps = { sessionId: string | null | undefined; messageId: string };

/** The comments on one message, and the box to add one when its comment button is pressed. */
export function MessageReview(props: MessageReviewProps) {
  return useReviewConnected(props.sessionId) ? <ConnectedMessageReview {...props} /> : null;
}

function ConnectedMessageReview(props: MessageReviewProps) {
  const api = useSessionReview(props.sessionId);
  const open = useReviewUi((state) => state.openFor === props.messageId);
  const close = useReviewUi((state) => state.close);
  if (!api) return null;
  const anchor: RedrobReviewAnchor = { kind: "message", messageId: props.messageId };
  const comments = commentsOn(api.review, anchor);
  if (!open && comments.length === 0) return null;
  return (
    <div className="desk-review" data-anchor="message">
      {comments.length > 0 ? <CommentList comments={comments} {...listProps(api)} /> : null}
      {open ? <CommentForm busy={api.busy} onSubmit={(text) => api.add(anchor, text)} onCancel={close} /> : null}
    </div>
  );
}

type ItemsReviewProps = {
  sessionId: string | null | undefined;
  messageId: string;
  kind: "plan-step" | "claim";
  items: readonly ReviewItem[];
};

/** Comments on a plan's steps or a fact check's claims, grouped by item, with a box to add one. */
export function ItemsReview(props: ItemsReviewProps) {
  return useReviewConnected(props.sessionId) && props.items.length > 0 ? <ConnectedItemsReview {...props} /> : null;
}

function ConnectedItemsReview(props: ItemsReviewProps) {
  const api = useSessionReview(props.sessionId);
  const [adding, setAdding] = useState(false);
  if (!api) return null;
  const groups = commentsByItem(api.review, props.kind, props.messageId, props.items);
  const pick = props.kind === "plan-step" ? t("desk.review_pick_step") : t("desk.review_pick_claim");
  return (
    <div className="desk-review" data-anchor={props.kind}>
      {groups.map((group) => (
        <div key={group.item.id} className="desk-review__group">
          <p className="desk-review__item">{group.item.label}</p>
          <CommentList comments={group.comments} {...listProps(api)} />
        </div>
      ))}
      {adding ? (
        <CommentForm
          items={props.items}
          itemLabelText={pick}
          busy={api.busy}
          onSubmit={(text, itemId) =>
            api.add(anchorFor({ kind: props.kind, messageId: props.messageId, itemId }), text).then((ok) => {
              if (ok) setAdding(false);
              return ok;
            })
          }
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            {props.kind === "plan-step" ? t("desk.review_comment_step") : t("desk.review_comment_claim")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Above the thread, once anyone has commented or given a verdict. The session is the thread's own. */
export function DeskReviewBar(props: { force?: boolean }) {
  const thread = useDeskThread();
  return useReviewConnected(thread?.sessionId) ? <ConnectedReviewBar sessionId={thread?.sessionId} force={props.force} /> : null;
}

function ConnectedReviewBar(props: { sessionId: string | undefined; force?: boolean }) {
  const api = useSessionReview(props.sessionId);
  if (!api?.review || (!props.force && !hasReviewActivity(api.review))) return null;
  return <ReviewBarView review={api.review} busy={api.busy} onStatus={(status) => api.setStatus(status)} />;
}

export { itemLabel };
