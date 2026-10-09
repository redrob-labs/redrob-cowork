/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Badge, Button, Checkbox, Input, Skeleton, Timestamp, icons } from "@redrob-labs/ui";

import { coworkBridge, type CoworkHosted, type CoworkResult, type CoworkStatus } from "../../../app/lib/desktop";
import {
  RedrobServerError,
  type RedrobGuestCapability,
  type RedrobRoomEvent,
  type RedrobRoomParticipant,
  type RedrobRoomQueueItem,
  type RedrobRoomView,
} from "../../../app/lib/redrob-server";
import { formatMessageCost } from "../../../components/chat/message-usage";
import { reviewQueryKey } from "../review/use-session-review";
import { t } from "../../../i18n";
import { PROFILE_QUERY_KEY } from "../settings/profile-group";
import { deepLinkBridgeEvent } from "../../../app/lib/deep-link-bridge";
import { useDeskConnection, type DeskRoomClient } from "../shell/desk-connection";
import { DeskDialog } from "../shell/desk-dialog";
import { useFrameStore } from "../store/frame-store";
import { authorIndex } from "./room-logic";
import {
  applyRoomEvent,
  canChangeQueued,
  readQueueItems,
  roomEventEffect,
  GUEST_CAPABILITIES,
  capabilityLabel,
  coworkFailureText,
  joinedChatPath,
  participantsInOrder,
  takeJoinLinks,
  unavailableText,
  withCapability,
} from "./cowork-logic";

const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };
/** While the room's event stream is down the room is re-read on this beat; while it is up, rarely. */
const ROOM_REFETCH_MS = 5_000;
const ROOM_REFETCH_LIVE_MS = 30_000;
const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/** Chats whose room event stream is connected right now, so polling can back off. */
const useRoomLive = create<{ live: Record<string, true>; set(key: string, live: boolean): void }>()((set, get) => ({
  live: {},
  set: (key, live) => {
    if (Boolean(get().live[key]) === live) return;
    const next = { ...get().live };
    if (live) next[key] = true;
    else delete next[key];
    set({ live: next });
  },
}));

const liveKey = (workspaceId: string | null, sessionId: string | null | undefined) => `${workspaceId ?? ""}/${sessionId ?? ""}`;

export function roomCostsQueryKey(workspaceId: string | null, sessionId: string | null): readonly unknown[] {
  return ["desk", "room-costs", workspaceId ?? "", sessionId ?? ""];
}

export function roomQueueQueryKey(workspaceId: string | null, sessionId: string | null): readonly unknown[] {
  return ["desk", "room-queue", workspaceId ?? "", sessionId ?? ""];
}

export function roomKnocksQueryKey(workspaceId: string | null, sessionId: string | null): readonly unknown[] {
  return ["desk", "room-knocks", workspaceId ?? "", sessionId ?? ""];
}
const HEARTBEAT_MS = 15_000;

export function roomQueryKey(workspaceId: string | null, sessionId: string | null): readonly unknown[] {
  return ["desk", "room", workspaceId ?? "", sessionId ?? ""];
}

/** The chat's live room from the server the chat is on, or null. Shared by every caller. */
export function useRoom(sessionId: string | null | undefined): { room: RedrobRoomView | null; client: DeskRoomClient | null; workspaceId: string | null } {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const enabled = Boolean(client && workspaceId && sessionId);
  const live = useRoomLive((state) => Boolean(state.live[liveKey(workspaceId, sessionId)]));
  const query = useQuery({
    queryKey: roomQueryKey(workspaceId, sessionId ?? null),
    enabled,
    queryFn: () => (client && workspaceId && sessionId ? client.getRoom(workspaceId, sessionId) : Promise.resolve(null)),
    refetchInterval: (state) => (state.state.data ? (live ? ROOM_REFETCH_LIVE_MS : ROOM_REFETCH_MS) : false),
    staleTime: 2_000,
  });
  return { room: query.data ?? null, client: enabled ? client : null, workspaceId };
}

/**
 * Follows the room's event stream while a room is open on the chat, reconnecting with backoff.
 * Presence and authorship update the cached room in place; anything else re-reads what changed.
 */
function useRoomEvents(client: DeskRoomClient | null, workspaceId: string | null, sessionId: string | null, open: boolean) {
  const queryClient = useQueryClient();
  const setLive = useRoomLive((state) => state.set);
  useEffect(() => {
    if (!client || !workspaceId || !sessionId || !open) return;
    const controller = new AbortController();
    const key = liveKey(workspaceId, sessionId);
    const onEvent = (event: RedrobRoomEvent) => {
      queryClient.setQueryData<RedrobRoomView | null>(roomQueryKey(workspaceId, sessionId), (current) => (current ? applyRoomEvent(current, event) : current));
      // The queue event carries the whole list, as the server's queueView gives it.
      if (event.type === "room.queue") queryClient.setQueryData(roomQueueQueryKey(workspaceId, sessionId), readQueueItems(event.queue));
      const effect = roomEventEffect(event);
      if (effect.room) void queryClient.invalidateQueries({ queryKey: roomQueryKey(workspaceId, sessionId) });
      if (effect.knocks) void queryClient.invalidateQueries({ queryKey: roomKnocksQueryKey(workspaceId, sessionId) });
      if (effect.costs) void queryClient.invalidateQueries({ queryKey: roomCostsQueryKey(workspaceId, sessionId) });
      if (effect.review) void queryClient.invalidateQueries({ queryKey: reviewQueryKey(workspaceId, sessionId) });
    };
    void (async () => {
      let attempt = 0;
      while (!controller.signal.aborted) {
        const started = Date.now();
        try {
          setLive(key, true);
          await client.followRoomEvents(workspaceId, sessionId, onEvent, controller.signal);
        } catch {
          // dropped, refused or aborted; the loop decides
        }
        setLive(key, false);
        if (controller.signal.aborted) return;
        // Whatever happened while it was down, read it once now.
        void queryClient.invalidateQueries({ queryKey: roomQueryKey(workspaceId, sessionId) });
        attempt = Date.now() - started > 60_000 ? 0 : attempt + 1;
        const wait = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)] ?? 30_000;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    })();
    return () => {
      controller.abort();
      setLive(key, false);
    };
  }, [client, workspaceId, sessionId, open, queryClient, setLive]);
}

function unwrap<T>(result: CoworkResult<T>): T {
  if (result.ok) return result.value;
  throw new CoworkFailure(result.code);
}

class CoworkFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function failureCode(error: unknown): string {
  if (error instanceof CoworkFailure || error instanceof RedrobServerError) return error.code;
  return "cowork_failed";
}

/* ---------- The host's panel ---------- */

function useCoworkStatus(open: boolean): CoworkStatus | null | "loading" {
  const [status, setStatus] = useState<CoworkStatus | null | "loading">("loading");
  useEffect(() => {
    if (!open) return;
    const bridge = coworkBridge();
    if (!bridge) {
      setStatus(null);
      return;
    }
    let live = true;
    void bridge.status().then((result) => {
      if (live) setStatus(result.ok ? result.value : { available: false, reason: "binding_missing" });
    });
    return () => {
      live = false;
    };
  }, [open]);
  return status;
}

function ParticipantRow(props: {
  participant: RedrobRoomParticipant;
  me: string;
  hostView: boolean;
  busy: boolean;
  onCapabilities: (next: RedrobGuestCapability[]) => void;
  onPlanOnly: (next: boolean) => void;
  onRemove: () => void;
}) {
  const { participant, me, hostView } = props;
  const name = participant.displayName.trim() || t("desk.review_unnamed");
  const capabilities = participant.capabilities ?? [];
  return (
    <li className="desk-cowork__person">
      <Avatar size="xs" name={name} seed={participant.participantId} />
      <span className="desk-cowork__name">
        <b>{name}</b>
        {participant.participantId === me ? ` · ${t("desk.cowork_you")}` : ""}
      </span>
      <Badge tone={participant.role === "host" ? "brand" : "neutral"} size="sm">
        {participant.role === "host" ? t("desk.cowork_role_host") : t("desk.cowork_role_guest")}
      </Badge>
      <span className="desk-hint">
        {participant.typing ? t("desk.cowork_typing") : participant.present ? t("desk.cowork_here") : t("desk.cowork_away")}
      </span>
      {participant.planOnly ? (
        <Badge tone="info" size="sm">
          {t("desk.cowork_plan_only")}
        </Badge>
      ) : null}
      {hostView && participant.role === "guest" && participant.tokenId ? (
        <div className="desk-cowork__controls">
          {GUEST_CAPABILITIES.map((capability) => (
            <Checkbox
              key={capability}
              label={capabilityLabel(capability)}
              checked={capabilities.includes(capability)}
              disabled={props.busy}
              onChange={(event) => props.onCapabilities(withCapability(capabilities, capability, event.currentTarget.checked))}
            />
          ))}
          <Checkbox
            label={t("desk.cowork_plan_only")}
            hint={t("desk.cowork_plan_only_hint")}
            checked={participant.planOnly === true}
            disabled={props.busy}
            onChange={(event) => props.onPlanOnly(event.currentTarget.checked)}
          />
          <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onRemove}>
            {t("desk.cowork_remove")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function CoworkDialog(props: { client: DeskRoomClient; workspaceId: string; sessionId: string; local: boolean; onClose: () => void }) {
  const { client, workspaceId, sessionId, local } = props;
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const { room } = useRoom(sessionId);
  const status = useCoworkStatus(true);
  const [invite, setInvite] = useState<CoworkHosted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hostView = Boolean(room && room.me.participantId === room.room.host.participantId);
  const live = useRoomLive((state) => Boolean(state.live[liveKey(workspaceId, sessionId)]));
  const knocks = useQuery({
    queryKey: roomKnocksQueryKey(workspaceId, sessionId),
    enabled: Boolean(room && hostView),
    queryFn: () => client.listRoomKnocks(workspaceId, sessionId),
    // A knock is announced on the event stream; the beat is for when it is down.
    refetchInterval: live ? 30_000 : 3_000,
  });
  const costs = useQuery({
    queryKey: roomCostsQueryKey(workspaceId, sessionId),
    enabled: Boolean(room),
    queryFn: async () => (await client.getRoom(workspaceId, sessionId, { costs: true }))?.costs ?? null,
    staleTime: 10_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: roomQueryKey(workspaceId, sessionId) });
    void knocks.refetch();
  };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (reason) {
      setError(coworkFailureText(failureCode(reason)));
    } finally {
      setBusy(false);
    }
  };

  const bridge = coworkBridge();
  const start = () =>
    run(async () => {
      if (!bridge) throw new CoworkFailure("binding_missing");
      setInvite(unwrap(await bridge.host({ workspaceId, sessionId })));
    });
  const copy = (link: string) =>
    void navigator.clipboard.writeText(link).then(
      () => showToast(t("desk.cowork_copied_title"), t("desk.cowork_copied_text")),
      () => setError(t("desk.settings_try_again")),
    );
  const revoke = async () => {
    await client.revokeRoomInvites(workspaceId, sessionId);
    setInvite(null);
  };
  const end = () =>
    run(async () => {
      await client.endRoom(workspaceId, sessionId);
      if (bridge) unwrap(await bridge.stopHosting({ workspaceId }));
      setInvite(null);
      showToast(t("desk.cowork_ended_title"), t("desk.cowork_ended_text"));
      props.onClose();
    });
  const leave = () =>
    run(async () => {
      await client.leaveRoom(workspaceId, sessionId).catch(() => undefined);
      if (bridge && room) {
        const current = unwrap(await bridge.status());
        const joined = current.available ? current.joined.find((entry) => entry.workspaceId === room.room.workspaceId && entry.sessionId === sessionId) : undefined;
        if (joined) unwrap(await bridge.leave({ hostEndpointId: joined.hostEndpointId, workspaceId: joined.workspaceId, sessionId }));
      }
      props.onClose();
    });

  const unavailable = status && status !== "loading" && !status.available ? unavailableText(status.reason) : null;
  const canHost = local && !unavailable && status !== "loading";

  return (
    <DeskDialog
      open
      title={t("desk.cowork_title")}
      onClose={props.onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("common.close")}
          </Button>
          {room && hostView ? (
            <Button variant="danger" loading={busy} onClick={() => void end()}>
              {t("desk.cowork_end")}
            </Button>
          ) : room ? (
            <Button variant="secondary" loading={busy} onClick={() => void leave()}>
              {t("desk.cowork_leave")}
            </Button>
          ) : (
            <Button variant="primary" loading={busy} disabled={!canHost} onClick={() => void start()}>
              {t("desk.cowork_start")}
            </Button>
          )}
        </>
      }
    >
      <div className="desk-cowork">
        {error ? <Alert tone="danger" title={t("desk.cowork_failed")}>{error}</Alert> : null}
        {unavailable && !room ? <Alert tone="warning" title={t("desk.cowork_unavailable")}>{unavailable}</Alert> : null}
        {!room ? (
          <>
            <p>{t("desk.cowork_lede")}</p>
            <p className="desk-hint">{local ? t("desk.cowork_privacy") : t("desk.cowork_remote_only")}</p>
            {status === "loading" && local ? <Skeleton variant="text" lines={2} /> : null}
          </>
        ) : null}

        {room && hostView ? (
          <section className="desk-cowork__group" aria-labelledby="desk-cowork-invite">
            <b id="desk-cowork-invite">{t("desk.cowork_invite_title")}</b>
            {invite ? (
              <>
                <Input id="desk-cowork-link" label={t("desk.cowork_invite_label")} value={invite.link} readOnly onFocus={(event) => event.currentTarget.select()} />
                <p className="desk-hint">
                  {t("desk.cowork_invite_hint")} <Timestamp at={invite.expiresAt} precision="minute" />
                </p>
                <div className="desk-cowork__row">
                  <Button size="sm" variant="primary" iconLeft={icons.copy(BUTTON_ICON)} onClick={() => copy(invite.link)}>
                    {t("desk.cowork_copy")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void start()}>
                    {t("desk.cowork_new_invite")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(revoke)}>
                    {t("desk.cowork_revoke")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="desk-cowork__row">
                <Button size="sm" variant="secondary" iconLeft={icons.link(BUTTON_ICON)} disabled={!canHost || busy} onClick={() => void start()}>
                  {t("desk.cowork_new_invite")}
                </Button>
              </div>
            )}
          </section>
        ) : null}

        {room && hostView && (knocks.data?.length ?? 0) > 0 ? (
          <section className="desk-cowork__group" aria-labelledby="desk-cowork-knocks">
            <b id="desk-cowork-knocks">{t("desk.cowork_knocks_title")}</b>
            <ul className="desk-cowork__people">
              {knocks.data?.map((knock) => {
                const name = knock.participant.displayName.trim() || t("desk.review_unnamed");
                return (
                  <li key={knock.knockId} className="desk-cowork__person">
                    <Avatar size="xs" name={name} seed={knock.participant.participantId} />
                    <span className="desk-cowork__name">
                      {t("desk.cowork_knock_text", { name })} · <code>{knock.endpointId.slice(0, 10)}</code>
                    </span>
                    <div className="desk-cowork__controls">
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => void run(() => client.answerRoomKnock(workspaceId, sessionId, knock.knockId, { allow: true }))}>
                        {t("desk.cowork_allow")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => client.answerRoomKnock(workspaceId, sessionId, knock.knockId, { allow: false }))}>
                        {t("desk.cowork_deny")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="desk-hint">{t("desk.cowork_knock_hint")}</p>
          </section>
        ) : null}

        {room ? (
          <section className="desk-cowork__group" aria-labelledby="desk-cowork-people">
            <b id="desk-cowork-people">{t("desk.cowork_people_title")}</b>
            <ul className="desk-cowork__people">
              {participantsInOrder(room.participants).map((participant) => (
                <ParticipantRow
                  key={participant.participantId}
                  participant={participant}
                  me={room.me.participantId}
                  hostView={hostView}
                  busy={busy}
                  onCapabilities={(next) => void run(() => client.setGuestCapabilities(workspaceId, sessionId, participant.tokenId ?? "", next))}
                  onPlanOnly={(next) => void run(() => client.setGuestPlanOnly(workspaceId, sessionId, participant.tokenId ?? "", next))}
                  onRemove={() => void run(() => client.removeGuest(workspaceId, sessionId, participant.tokenId ?? ""))}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {room && costs.data && costs.data.total > 0 ? (
          <section className="desk-cowork__group" aria-labelledby="desk-cowork-costs">
            <b id="desk-cowork-costs">{t("desk.cowork_costs_title")}</b>
            <ul className="desk-cowork__people">
              {costs.data.authors.map((author) => (
                <li key={author.participantId} className="desk-cowork__person">
                  <span className="desk-cowork__name">
                    {author.participantId === room.me.participantId ? t("desk.cowork_you") : author.displayName.trim() || t("desk.review_unnamed")}
                  </span>
                  <span className="desk-hint">{t("desk.cowork_costs_messages", { count: author.messages })}</span>
                  <b>{formatMessageCost(author.cost)}</b>
                </li>
              ))}
            </ul>
            <p className="desk-hint">{t("desk.cowork_costs_total", { amount: formatMessageCost(costs.data.total) ?? "" })}</p>
          </section>
        ) : null}
      </div>
    </DeskDialog>
  );
}

/** Keeps this person marked as here while the chat is open in a room. */
function useRoomHeartbeat(client: DeskRoomClient | null, workspaceId: string | null, sessionId: string | null, open: boolean) {
  useEffect(() => {
    if (!client || !workspaceId || !sessionId || !open) return;
    const beat = () => void client.roomHeartbeat(workspaceId, sessionId).catch(() => undefined);
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [client, workspaceId, sessionId, open]);
}

/** "Co-work" in the chat's header: in the desktop app, for a chat on a server this app can reach. */
export function CoworkAction(props: { chatId: string | null }) {
  const connected = useDeskConnection((state) => Boolean(state.client && state.workspaceId));
  return connected && props.chatId && coworkBridge() ? <ConnectedCoworkAction chatId={props.chatId} /> : null;
}

function ConnectedCoworkAction(props: { chatId: string }) {
  const workspaceRoot = useDeskConnection((state) => state.workspaceRoot);
  const { room, client, workspaceId } = useRoom(props.chatId);
  const [open, setOpen] = useState(false);
  useRoomHeartbeat(client, workspaceId, props.chatId, Boolean(room));
  useRoomEvents(client, workspaceId, props.chatId, Boolean(room));
  // A guest's chat is on a remote workspace; only show the action there once a room is open.
  if (!client || !workspaceId) return null;
  if (!workspaceRoot && !room) return null;
  const here = room?.participants.filter((entry) => entry.present).length ?? 0;
  return (
    <>
      <Button size="sm" variant={room ? "secondary" : "ghost"} iconLeft={icons.users(BUTTON_ICON)} onClick={() => setOpen(true)}>
        {room ? t("desk.cowork_live", { count: Math.max(here, 1) }) : t("desk.cowork_action")}
      </Button>
      {open ? <CoworkDialog client={client} workspaceId={workspaceId} sessionId={props.chatId} local={Boolean(workspaceRoot)} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/* ---------- Joining ---------- */

type JoinPhase = "idle" | "dialing" | "waiting";

export function CoworkJoinDialog(props: { link: string; onClose: () => void }) {
  const client = useDeskConnection((state) => state.client);
  const navigate = useNavigate();
  const showToast = useFrameStore((state) => state.showToast);
  const [phase, setPhase] = useState<JoinPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const profile = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    enabled: Boolean(client),
    queryFn: () => (client ? client.getProfile() : Promise.resolve(null)),
    staleTime: 60_000,
  });
  const bridge = coworkBridge();
  const status = useCoworkStatus(true);
  const unavailable = status && status !== "loading" && !status.available ? unavailableText(status.reason) : null;

  useEffect(() => {
    if (!bridge) return;
    return bridge.onEvent((event) => {
      if (event.type === "join" && (event.phase === "dialing" || event.phase === "waiting")) setPhase(event.phase);
    });
  }, [bridge]);

  const me = profile.data;
  const named = Boolean(me?.displayName.trim());
  const join = async () => {
    if (!bridge || !me) return;
    setPhase("dialing");
    setError(null);
    const result = await bridge.join({ link: props.link, participant: { participantId: me.participantId, displayName: me.displayName } });
    if (!result.ok) {
      setPhase("idle");
      if (result.code !== "knock_cancelled") setError(coworkFailureText(result.code));
      return;
    }
    showToast(t("desk.cowork_joined_title"), t("desk.cowork_joined_text"));
    // The desktop app added and selected the host's workspace; the chat route re-reads the list.
    window.dispatchEvent(new Event("redrob-server-settings-changed"));
    const path = joinedChatPath(result.value);
    props.onClose();
    if (path) navigate(path);
  };
  const cancel = () => {
    if (phase !== "idle" && bridge) void bridge.cancelJoin({ link: props.link });
    props.onClose();
  };

  return (
    <DeskDialog
      open
      title={t("desk.cowork_join_title")}
      onClose={cancel}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={phase !== "idle"} disabled={!named || Boolean(unavailable) || status === "loading"} onClick={() => void join()}>
            {t("desk.cowork_join")}
          </Button>
        </>
      }
    >
      <div className="desk-cowork">
        {error ? <Alert tone="danger" title={t("desk.cowork_failed")}>{error}</Alert> : null}
        {unavailable ? <Alert tone="warning" title={t("desk.cowork_unavailable")}>{unavailable}</Alert> : null}
        <p>{t("desk.cowork_join_lede")}</p>
        {me && named ? (
          <p className="desk-hint">{t("desk.cowork_join_as", { name: me.displayName.trim() })}</p>
        ) : (
          <Alert tone="info" title={t("desk.cowork_join_name_title")}>{t("desk.cowork_join_name_text")}</Alert>
        )}
        {phase === "dialing" ? <p className="desk-hint">{t("desk.cowork_join_dialing")}</p> : null}
        {phase === "waiting" ? <p className="desk-hint">{t("desk.cowork_join_waiting")}</p> : null}
      </div>
    </DeskDialog>
  );
}

/** Mounted once in the Desk layer: takes `join` invites from the desktop shell's deep links. */
export function CoworkJoinHost() {
  const [link, setLink] = useState<string | null>(null);
  const showToast = useFrameStore((state) => state.showToast);
  useEffect(() => {
    const bridge = coworkBridge();
    if (!bridge) return;
    return bridge.onEvent((event) => {
      if (event.type !== "join") return;
      // A joined chat came back after a restart or a drop, maybe on a new port: re-read the list.
      if (event.phase === "reconnected") window.dispatchEvent(new Event("redrob-server-settings-changed"));
      // The host removed this guest or ended the room while it was away: stop, and say so once.
      if (event.phase === "ended") showToast(t("desk.cowork_ended_guest_title"), t("desk.cowork_ended_guest_text"));
    });
  }, [showToast]);
  useEffect(() => {
    if (typeof window === "undefined" || !coworkBridge()) return;
    const take = () => {
      const [first] = takeJoinLinks(window);
      if (first) setLink(first.link);
    };
    take();
    window.addEventListener(deepLinkBridgeEvent, take);
    return () => window.removeEventListener(deepLinkBridgeEvent, take);
  }, []);
  if (!link) return null;
  return <CoworkJoinDialog link={link} onClose={() => setLink(null)} />;
}

/* ---------- In the chat ---------- */

/** Who sent a message, in a live room. Nothing outside one, or before the room opened. */
export function MessageAuthor(props: { sessionId: string | null | undefined; messageId: string }) {
  // Outside a connected chat (previews, tests) there is no server to ask, so no query at all.
  const connected = useDeskConnection((state) => Boolean(state.client && state.workspaceId));
  return connected && props.sessionId ? <ConnectedMessageAuthor {...props} /> : null;
}

function ConnectedMessageAuthor(props: { sessionId: string | null | undefined; messageId: string }) {
  const { room } = useRoom(props.sessionId);
  if (!room) return null;
  const author = authorIndex(room.authorship).get(props.messageId);
  if (!author) return null;
  const name = author.displayName.trim() || t("desk.review_unnamed");
  return (
    <span className="desk-cowork__author" title={t("desk.cowork_sent_by", { name })}>
      <Avatar size="xs" name={name} seed={author.participantId} />
      {author.participantId === room.me.participantId ? t("desk.cowork_you") : name}
    </span>
  );
}

/* ---------- The shared queue ---------- */

export type RoomQueueApi = {
  items: RedrobRoomQueueItem[];
  /** Queues a message (its text, or its prompt parts) in the room. False (with a toast) when refused. */
  enqueue(message: string | ReadonlyArray<Record<string, unknown>>): Promise<boolean>;
  remove(itemId: string): void;
  /** Replaces a waiting message's text. False (with a toast) when the server refused it. */
  edit(itemId: string, text: string): Promise<boolean>;
  canChange(item: RedrobRoomQueueItem): boolean;
};

/**
 * The room's shared queue for a chat, or null when no room is open: messages wait on the host's
 * server under their author's name and are sent in order when the agent is free.
 */
export function useRoomQueue(sessionId: string | null | undefined): RoomQueueApi | null {
  const { room, client, workspaceId } = useRoom(sessionId);
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const live = useRoomLive((state) => Boolean(state.live[liveKey(workspaceId, sessionId)]));
  const key = roomQueueQueryKey(workspaceId, sessionId ?? null);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(room && client && workspaceId && sessionId),
    queryFn: () => (client && workspaceId && sessionId ? client.getRoomQueue(workspaceId, sessionId) : Promise.resolve([])),
    refetchInterval: live ? 30_000 : 5_000,
  });
  if (!room || !client || !workspaceId || !sessionId) return null;
  const fail = (error: unknown) => {
    showToast(t("desk.cowork_queue_failed"), coworkFailureText(failureCode(error)), "danger");
  };
  return {
    items: query.data ?? [],
    enqueue: async (message) => {
      try {
        queryClient.setQueryData(key, await client.enqueueRoomMessage(workspaceId, sessionId, message));
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    remove: (itemId) =>
      void client.removeRoomQueued(workspaceId, sessionId, itemId).then(
        (next) => queryClient.setQueryData(key, next),
        fail,
      ),
    edit: async (itemId, text) => {
      try {
        queryClient.setQueryData(key, await client.editRoomQueued(workspaceId, sessionId, itemId, text));
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    canChange: (item) => canChangeQueued(item, room),
  };
}

function RoomQueueRow(props: { item: RedrobRoomQueueItem; queue: RoomQueueApi; me: string | null }) {
  const { item, queue } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = item.author.displayName.trim() || t("desk.review_unnamed");
  const save = async () => {
    const text = editing?.trim() ?? "";
    if (!text) return;
    setSaving(true);
    if (await queue.edit(item.id, text)) setEditing(null);
    setSaving(false);
  };
  return (
    <li className="desk-cowork__person">
      <Avatar size="xs" name={name} seed={item.author.participantId} />
      {editing === null ? (
        <span className="desk-cowork__name">
          <b>{item.author.participantId === props.me ? t("desk.cowork_you") : name}</b> {item.preview}
        </span>
      ) : (
        <span className="desk-cowork__name">
          <Input
            id={`desk-cowork-queue-${item.id}`}
            label={t("desk.cowork_queue_edit_label")}
            value={editing}
            onChange={(event) => setEditing(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
              if (event.key === "Escape") setEditing(null);
            }}
          />
        </span>
      )}
      {queue.canChange(item) ? (
        <div className="desk-cowork__row">
          {editing === null ? (
            <>
              {item.editable ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(item.preview)}>
                  {t("desk.cowork_queue_edit")}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => queue.remove(item.id)}>
                {t("desk.cowork_queue_remove")}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" loading={saving} disabled={!editing.trim()} onClick={() => void save()}>
                {t("desk.cowork_queue_save")}
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** The room's waiting messages, above the composer, with who wrote each. */
export function RoomQueuePanel(props: { queue: RoomQueueApi; me: string | null }) {
  const { queue } = props;
  if (queue.items.length === 0) return null;
  return (
    <section className="desk-cowork__queue" aria-label={t("desk.cowork_queue_title")}>
      <b>{t("desk.cowork_queue_title")}</b>
      <ol className="desk-cowork__people">
        {queue.items.map((item) => (
          <RoomQueueRow key={item.id} item={item} queue={queue} me={props.me} />
        ))}
      </ol>
      <p className="desk-hint">{t("desk.cowork_queue_hint")}</p>
    </section>
  );
}

/** The panel for a chat, when a room is open on it. For the composer, which has no room of its own. */
export function ConnectedRoomQueue(props: { queue: RoomQueueApi | null; sessionId: string }) {
  const { room } = useRoom(props.sessionId);
  if (!props.queue || !room) return null;
  return <RoomQueuePanel queue={props.queue} me={room.me.participantId} />;
}
