/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Alert, Button, Skeleton, Timestamp, icons } from "@redrob-labs/ui";

import { deepLinkBridgeEvent } from "../../../app/lib/deep-link-bridge";
import {
  RedrobServerError,
  type RedrobHandoffFile,
  type RedrobHandoffInspection,
  type RedrobReceivedHandoff,
} from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import { PROJECTS_QUERY_KEY } from "../projects/desk-projects";
import { Group, Row } from "../settings/desk-settings";
import {
  useDeskConnection,
  type DeskHandoffOpenClient,
  type DeskHandoffReplyClient,
  type DeskProjectClient,
  type DeskReviewClient,
} from "../shell/desk-connection";
import { reviewQueryKey } from "../review/use-session-review";
import { ReplyDialog, ReplyOpenDialog } from "./handoff-reply";
import { DeskDialog } from "../shell/desk-dialog";
import { useFrameStore } from "../store/frame-store";
import { useDeskThread } from "../thread/desk-thread-context";
import { askLabel, formatBytes } from "./handoff-logic";

const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };

export const HANDOFF_FILE_ACCEPT = ".redrobhandoff,.redrobreply,application/zip";

/** A handoff someone sent, or a reply to one this computer sent. Told apart by the file's extension. */
export type HandoffFileKind = "handoff" | "reply";

export function handoffFileKind(name: string): HandoffFileKind | null {
  const lower = name.trim().toLowerCase();
  if (lower.endsWith(".redrobhandoff")) return "handoff";
  if (lower.endsWith(".redrobreply")) return "reply";
  return null;
}

/** Which file is waiting to be opened, from the picker or from the desktop shell. */
export const useHandoffOpenStore = create<{
  file: RedrobHandoffFile | null;
  kind: HandoffFileKind;
  open(file: RedrobHandoffFile, kind?: HandoffFileKind): void;
  close(): void;
}>()((set) => ({
  file: null,
  kind: "handoff",
  open: (file, kind = "handoff") => set({ file, kind }),
  close: () => set({ file: null }),
}));

/**
 * Chats opened from a handoff and not yet continued. The composer reads this to stay closed until
 * the person presses Continue; the banner fills it from the server.
 */
export const useHandoffLock = create<{ locked: Record<string, true>; set(sessionId: string, locked: boolean): void }>()((set, get) => ({
  locked: {},
  set: (sessionId, locked) => {
    const current = get().locked;
    if (Boolean(current[sessionId]) === locked) return;
    const next = { ...current };
    if (locked) next[sessionId] = true;
    else delete next[sessionId];
    set({ locked: next });
  },
}));

export function isHandoffLocked(sessionId: string | null | undefined): boolean {
  return Boolean(sessionId && useHandoffLock.getState().locked[sessionId]);
}

/** `redrob://open-handoff?file=<path>`, as the desktop shell sends a double-clicked file. */
export function parseOpenHandoffLink(raw: string): { path: string } | null {
  try {
    const url = new URL(raw);
    if (!/^redrob(-dev)?:$/.test(url.protocol)) return null;
    const route = `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
    if (route !== "open-handoff") return null;
    const path = url.searchParams.get("file")?.trim();
    return path && handoffFileKind(path) ? { path } : null;
  } catch {
    return null;
  }
}

/** Takes the open-handoff links out of the pending deep links, leaving every other link where it was. */
export function takeOpenHandoffLinks(target: Window): Array<{ path: string }> {
  const pending = target.__REDROB__?.deepLinks ?? [];
  const taken: Array<{ path: string }> = [];
  const rest: string[] = [];
  for (const link of pending) {
    const parsed = parseOpenHandoffLink(link);
    if (parsed) taken.push(parsed);
    else rest.push(link);
  }
  if (target.__REDROB__) target.__REDROB__.deepLinks = rest;
  return taken;
}

export function openFailureText(error: unknown): string {
  if (error instanceof RedrobServerError) {
    if (error.code === "handoff_tampered") return t("desk.handoff_open_tampered");
    if (error.code === "handoff_unsupported") return t("desk.handoff_open_newer");
    if (error.code === "handoff_too_large") return t("desk.handoff_failed_large");
    if (error.code === "handoff_invalid") return t("desk.handoff_open_invalid");
  }
  return t("desk.settings_try_again");
}

/* ---------- The preview ---------- */

export function HandoffOpenView(props: { inspection: RedrobHandoffInspection; onGoToOpened?: () => void }) {
  const { handoff, compatibility, alreadyOpened } = props.inspection;
  const name = handoff.from.displayName.trim() || t("desk.review_unnamed");
  return (
    <div className="desk-handoff">
      <p>
        <b>{t("desk.handoff_open_from", { name })}</b> · <Timestamp at={handoff.createdAt} precision="minute" />
      </p>
      <p className="desk-hint">{t("desk.handoff_open_unverified")}</p>
      <dl className="desk-handoff__facts">
        <div>
          <dt>{t("desk.handoff_ask_label")}</dt>
          <dd>{askLabel(handoff.ask)}</dd>
        </div>
        <div>
          <dt>{t("desk.handoff_open_chat")}</dt>
          <dd>{t("desk.handoff_open_chat_value", { title: handoff.session.title || t("desk.handoff_open_untitled"), count: handoff.session.messages })}</dd>
        </div>
        {handoff.note ? (
          <div>
            <dt>{t("desk.handoff_note_label")}</dt>
            <dd className="desk-review__note">{handoff.note}</dd>
          </div>
        ) : null}
      </dl>
      {handoff.files.length + handoff.skills.length + handoff.commands.length > 0 ? (
        <section className="desk-handoff__group">
          <b>{t("desk.handoff_contents_title")}</b>
          <ul className="list-disc pl-5">
            {handoff.files.map((file) => (
              <li key={file.path}>
                {file.path} · {formatBytes(file.bytes)}
              </li>
            ))}
            {handoff.skills.map((skill) => (
              <li key={`skill-${skill}`}>{t("desk.handoff_open_skill", { name: skill })}</li>
            ))}
            {handoff.commands.map((command) => (
              <li key={`command-${command}`}>{t("desk.handoff_open_playbook", { name: command })}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {handoff.comments > 0 ? <p>{t("desk.handoff_open_comments", { count: handoff.comments })}</p> : null}
      {compatibility === "different" ? (
        <Alert tone="info" title={t("desk.handoff_open_version_title")}>
          {t("desk.handoff_open_version_text")}
        </Alert>
      ) : null}
      {alreadyOpened ? (
        <Alert
          tone="info"
          title={t("desk.handoff_open_again_title")}
          action={
            props.onGoToOpened ? (
              <Button size="sm" variant="secondary" onClick={props.onGoToOpened}>
                {t("desk.handoff_open_go")}
              </Button>
            ) : undefined
          }
        >
          {t("desk.handoff_open_again_text")}
        </Alert>
      ) : null}
      <p className="desk-settings__note">
        {icons.folder(BUTTON_ICON)}
        {t("desk.handoff_open_where")}
      </p>
    </div>
  );
}

/** `Handoff: Lease review`, bounded for a project name. Mirrors handoffProjectName on the server. */
export function handoffProjectName(title: string): string {
  const base = title.trim() || t("desk.handoff_open_untitled");
  return t("desk.handoff_open_project", { title: Array.from(base).slice(0, 80).join("") });
}

export function sessionRoute(workspaceId: string, sessionId: string): string {
  return `/workspace/${encodeURIComponent(workspaceId)}/session/${encodeURIComponent(sessionId)}`;
}

function HandoffOpenDialog(props: { client: DeskHandoffOpenClient & DeskProjectClient; file: RedrobHandoffFile; onClose: () => void }) {
  const navigate = useNavigate();
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const [inspection, setInspection] = useState<RedrobHandoffInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { client, file } = props;

  useEffect(() => {
    let cancelled = false;
    client
      .inspectHandoff(file)
      .then((next) => !cancelled && setInspection(next))
      .catch((reason: unknown) => !cancelled && setError(openFailureText(reason)));
    return () => {
      cancelled = true;
    };
  }, [client, file]);

  const open = async () => {
    if (!inspection) return;
    setBusy(true);
    setError(null);
    try {
      const project = await client.createManagedProject(handoffProjectName(inspection.handoff.session.title));
      const result = await client.openHandoff(project.workspace.id, file, inspection.digest);
      void queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });
      showToast(
        t("desk.handoff_opened_title"),
        result.fallback ? t("desk.handoff_opened_fallback") : t("desk.handoff_opened_text", { name: inspection.handoff.from.displayName || t("desk.review_unnamed") }),
      );
      props.onClose();
      navigate(sessionRoute(result.workspaceId, result.sessionId));
    } catch (reason) {
      setError(openFailureText(reason));
    } finally {
      setBusy(false);
    }
  };

  const goToOpened = inspection?.alreadyOpened
    ? () => {
        const target = inspection.alreadyOpened!;
        props.onClose();
        navigate(sessionRoute(target.workspaceId, target.sessionId));
      }
    : undefined;

  return (
    <DeskDialog
      open
      title={t("desk.handoff_open_title")}
      onClose={props.onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!inspection} onClick={() => void open()}>
            {t("desk.handoff_open_confirm")}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger" title={t("desk.handoff_open_failed")}>{error}</Alert> : null}
      {inspection ? <HandoffOpenView inspection={inspection} onGoToOpened={goToOpened} /> : !error ? <Skeleton variant="text" lines={6} /> : null}
    </DeskDialog>
  );
}

/** Mounted once in the Desk layer: the open dialog, and the desktop shell's open-handoff links. */
export function HandoffOpenHost() {
  const client = useDeskConnection((state) => state.client);
  const file = useHandoffOpenStore((state) => state.file);
  const kind = useHandoffOpenStore((state) => state.kind);
  const openFile = useHandoffOpenStore((state) => state.open);
  const close = useHandoffOpenStore((state) => state.close);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const take = () => {
      const [first] = takeOpenHandoffLinks(window);
      if (first) openFile(first, handoffFileKind(first.path) ?? "handoff");
    };
    take();
    window.addEventListener(deepLinkBridgeEvent, take);
    return () => window.removeEventListener(deepLinkBridgeEvent, take);
  }, [openFile]);

  if (!client || !file) return null;
  if (kind === "reply") return <ReplyOpenDialog client={client} file={file} onClose={close} />;
  return <HandoffOpenDialog client={client} file={file} onClose={close} />;
}

/** Settings > General: open a handoff file a teammate sent. */
export function HandoffOpenGroup() {
  const client = useDeskConnection((state) => state.client);
  const openFile = useHandoffOpenStore((state) => state.open);
  const input = useRef<HTMLInputElement>(null);
  if (!client) return null;
  return (
    <Group title={t("desk.handoff_group_title")}>
      <Row title={t("desk.handoff_open_row")} description={t("desk.handoff_open_row_text")}>
        <Button size="sm" variant="secondary" iconLeft={icons.upload(BUTTON_ICON)} onClick={() => input.current?.click()}>
          {t("desk.handoff_open_pick")}
        </Button>
        <input
          ref={input}
          type="file"
          accept={HANDOFF_FILE_ACCEPT}
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const picked = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (picked) void picked.arrayBuffer().then((bytes) => openFile({ bytes }, handoffFileKind(picked.name) ?? "handoff"));
          }}
        />
      </Row>
    </Group>
  );
}

/* ---------- In the chat ---------- */

export const HANDOFF_STATUS_KEY = "desk-handoff-status";

export type HandoffBannerViewProps = {
  handoff: RedrobReceivedHandoff;
  busy: boolean;
  onContinue: () => void;
  onReply?: () => void;
};

/** Above a chat opened from a handoff: who sent it, what for, and Continue. */
export function HandoffBannerView(props: HandoffBannerViewProps) {
  const { handoff } = props;
  const name = handoff.fromName.trim() || t("desk.review_unnamed");
  const continued = handoff.continuedAt !== undefined;
  return (
    <section className="desk-review__bar" aria-label={t("desk.handoff_banner_label")}>
      <div className="desk-review__state">
        <b>{t("desk.handoff_banner_from", { name, ask: askLabel(handoff.ask) })}</b>
      </div>
      {handoff.note ? <p className="desk-review__note">{handoff.note}</p> : null}
      {handoff.fallback ? <p className="desk-hint">{t("desk.handoff_banner_fallback")}</p> : null}
      {continued ? <p className="desk-hint">{t("desk.handoff_banner_continued")}</p> : <p className="desk-hint">{t("desk.handoff_banner_review_mode")}</p>}
      <div className="desk-review__actions">
        {continued ? null : (
          <Button size="sm" variant="primary" loading={props.busy} onClick={props.onContinue}>
            {t("desk.handoff_continue")}
          </Button>
        )}
        {props.onReply ? (
          <Button size="sm" variant="secondary" onClick={props.onReply}>
            {t("desk.reply_action", { name })}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function ConnectedHandoffBanner(props: { client: DeskHandoffOpenClient & DeskHandoffReplyClient & DeskReviewClient; workspaceId: string; sessionId: string }) {
  const queryClient = useQueryClient();
  const setLock = useHandoffLock((state) => state.set);
  const showToast = useFrameStore((state) => state.showToast);
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);
  const review = useQuery({
    queryKey: reviewQueryKey(props.workspaceId, props.sessionId),
    queryFn: () => props.client.getSessionReview(props.workspaceId, props.sessionId),
    enabled: replying,
  });
  const key = ["desk", HANDOFF_STATUS_KEY, props.workspaceId, props.sessionId];
  const status = useQuery({
    queryKey: key,
    queryFn: () => props.client.getSessionHandoff(props.workspaceId, props.sessionId),
    staleTime: 60_000,
  });
  const handoff = status.data ?? null;
  const locked = Boolean(handoff && handoff.continuedAt === undefined);
  useEffect(() => {
    setLock(props.sessionId, locked);
  }, [locked, props.sessionId, setLock]);
  useEffect(() => () => setLock(props.sessionId, false), [props.sessionId, setLock]);

  if (!handoff) return null;
  const onContinue = () => {
    setBusy(true);
    props.client
      .continueHandoff(props.workspaceId, props.sessionId)
      .then((next) => queryClient.setQueryData(key, next))
      .catch(() => showToast(t("desk.review_failed"), t("desk.settings_try_again"), "danger"))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <HandoffBannerView handoff={handoff} busy={busy} onContinue={onContinue} onReply={() => setReplying(true)} />
      {replying ? (
        <ReplyDialog
          client={props.client}
          workspaceId={props.workspaceId}
          sessionId={props.sessionId}
          review={review.data}
          continued={handoff.continuedAt !== undefined}
          onClose={() => setReplying(false)}
        />
      ) : null}
    </>
  );
}

/** The banner for the thread's own chat. */
export function DeskHandoffBanner() {
  const thread = useDeskThread();
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  if (!client || !workspaceId || !thread?.sessionId) return null;
  return <ConnectedHandoffBanner client={client} workspaceId={workspaceId} sessionId={thread.sessionId} />;
}
