/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Alert, Badge, Button, Checkbox, Skeleton } from "@redrob-labs/ui";

import type { RedrobHandoffFile, RedrobReplyInspection, RedrobSessionReview } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import { openCount, reviewStatusLabel, reviewStatusTone } from "../review/review-logic";
import type { DeskHandoffReplyClient } from "../shell/desk-connection";
import { DeskDialog } from "../shell/desk-dialog";
import { useFrameStore } from "../store/frame-store";
import { downloadBytes } from "./handoff-logic";

export type ReplySummaryProps = {
  review: RedrobSessionReview | undefined;
  continued: boolean;
  includeContinuation: boolean;
  onIncludeContinuation: (on: boolean) => void;
};

/** What a reply carries: the verdict, the comments, and the continued chat when there is one. */
export function ReplySummary(props: ReplySummaryProps) {
  const status = props.review?.state.status ?? "open";
  const comments = props.review?.comments.length ?? 0;
  return (
    <div className="desk-handoff">
      <p className="desk-hint">{t("desk.reply_lede")}</p>
      <div className="desk-review__state">
        <Badge tone={reviewStatusTone(status)} dot>
          {reviewStatusLabel(status)}
        </Badge>
        <span>{t("desk.reply_comments", { count: comments })}</span>
        {props.review ? <span>{t("desk.review_open_count", { count: openCount(props.review.comments) })}</span> : null}
      </div>
      {status === "open" ? <p className="desk-hint">{t("desk.reply_no_verdict")}</p> : null}
      {props.continued ? (
        <Checkbox
          label={t("desk.reply_include_continuation")}
          hint={t("desk.reply_include_continuation_hint")}
          checked={props.includeContinuation}
          onChange={(event) => props.onIncludeContinuation(event.currentTarget.checked)}
        />
      ) : null}
    </div>
  );
}

/** Send back: the reply file for the person who sent the work. */
export function ReplyDialog(props: {
  client: DeskHandoffReplyClient;
  workspaceId: string;
  sessionId: string;
  review: RedrobSessionReview | undefined;
  continued: boolean;
  onClose: () => void;
}) {
  const showToast = useFrameStore((state) => state.showToast);
  const [includeContinuation, setIncludeContinuation] = useState(props.continued);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    setBusy(true);
    setError(null);
    props.client
      .createHandoffReply(props.workspaceId, props.sessionId, { includeContinuation })
      .then((file) => {
        downloadBytes(file.filename ?? "reply.redrobreply", file.data, "application/zip");
        showToast(t("desk.reply_saved_title"), t("desk.reply_saved_text"));
        props.onClose();
      })
      .catch(() => setError(t("desk.settings_try_again")))
      .finally(() => setBusy(false));
  };
  return (
    <DeskDialog
      open
      title={t("desk.reply_title")}
      onClose={props.onClose}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {t("desk.reply_save")}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger" title={t("desk.reply_failed")}>{error}</Alert> : null}
      <ReplySummary
        review={props.review}
        continued={props.continued}
        includeContinuation={includeContinuation}
        onIncludeContinuation={setIncludeContinuation}
      />
    </DeskDialog>
  );
}

/* ---------- On the sender's side ---------- */

export function ReplyOpenView(props: { inspection: RedrobReplyInspection }) {
  const { reply } = props.inspection;
  const name = reply.from.displayName.trim() || t("desk.review_unnamed");
  return (
    <div className="desk-handoff">
      <p>
        <b>{t("desk.reply_open_from", { name })}</b>
      </p>
      <div className="desk-review__state">
        <Badge tone={reviewStatusTone(reply.state.status)} dot>
          {reviewStatusLabel(reply.state.status)}
        </Badge>
        <span>{t("desk.reply_comments", { count: reply.comments })}</span>
      </div>
      {reply.state.note ? <p className="desk-review__note">{reply.state.note}</p> : null}
      {reply.continued ? <p>{t("desk.reply_open_continued", { count: reply.continued.messages })}</p> : null}
      <p className="desk-hint">{t("desk.reply_open_where")}</p>
    </div>
  );
}

export function ReplyOpenDialog(props: { client: DeskHandoffReplyClient; file: RedrobHandoffFile; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const [inspection, setInspection] = useState<RedrobReplyInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { client, file } = props;

  useEffect(() => {
    let cancelled = false;
    client
      .inspectHandoffReply(file)
      .then((next) => !cancelled && setInspection(next))
      .catch((reason: unknown) => {
        if (cancelled) return;
        const code = (reason as { code?: string } | null)?.code;
        setError(code === "reply_unknown_handoff" ? t("desk.reply_open_unknown") : code === "handoff_tampered" ? t("desk.handoff_open_tampered") : t("desk.handoff_open_invalid"));
      });
    return () => {
      cancelled = true;
    };
  }, [client, file]);

  const apply = () => {
    if (!inspection) return;
    setBusy(true);
    client
      .applyHandoffReply(file, inspection.digest)
      .then((result) => {
        void queryClient.invalidateQueries({ queryKey: ["desk"] });
        showToast(
          t("desk.reply_applied_title"),
          result.continuationSessionId ? t("desk.reply_applied_continued", { count: result.added }) : t("desk.reply_applied_text", { count: result.added }),
        );
        props.onClose();
        navigate(`/workspace/${encodeURIComponent(result.workspaceId)}/session/${encodeURIComponent(result.sessionId)}`);
      })
      .catch(() => setError(t("desk.settings_try_again")))
      .finally(() => setBusy(false));
  };

  return (
    <DeskDialog
      open
      title={t("desk.reply_open_title")}
      onClose={props.onClose}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!inspection} onClick={apply}>
            {t("desk.reply_open_confirm")}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger" title={t("desk.handoff_open_failed")}>{error}</Alert> : null}
      {inspection ? <ReplyOpenView inspection={inspection} /> : !error ? <Skeleton variant="text" lines={4} /> : null}
    </DeskDialog>
  );
}
