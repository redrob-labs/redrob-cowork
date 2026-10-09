import { recordAudit } from "../audit.js";
import {
  activeRoom,
  broadcast,
  costByAuthor,
  readCostMessages,
  closeRoomStreams,
  disconnect,
  dropPresence,
  endRoom,
  openRoom,
  presentIn,
  readAuthorship,
  roomEventStream,
  touchPresence,
} from "../cowork-room.js";
import { ApiError } from "../errors.js";
import {
  QueueError,
  clearQueue,
  editQueued,
  enqueue,
  queueView,
  removeQueued,
  scheduleDrain,
  type QueueEngine,
  type QueueItem,
} from "../cowork-queue.js";
import type { Room } from "../cowork-room.js";
import {
  InviteError,
  createInvite,
  decideKnock,
  forgetRoom,
  isEndpointId,
  knock,
  knockFor,
  pendingKnock,
  pendingKnocks,
  revokeInvites,
} from "../cowork-invites.js";
import { DEFAULT_GUEST_CAPABILITIES, readCapabilities, requireCapability, type GuestCapability } from "../guest-access.js";
import { isParticipantId, normalizeDisplayName } from "../participant-profile.js";
import { isSafeId, type ReviewAuthor } from "../review-store.js";
import type { ServerConfig, WorkspaceInfo } from "../types.js";
import { shortId } from "../utils.js";
import { addRoute, type RequestContext, type Route } from "./registry.js";

type JsonResponse = (data: unknown, status?: number) => Response;
type ReadJsonBody = (request: Request) => Promise<Record<string, unknown>>;

export interface RegisterRoomRoutesOptions {
  routes: Route[];
  config: ServerConfig;
  jsonResponse: JsonResponse;
  readJsonBody: ReadJsonBody;
  ensureWritable: (config: ServerConfig) => void;
  resolveWorkspaceWithoutBootstrap: (config: ServerConfig, id: string) => Promise<WorkspaceInfo>;
  resolveAuthor: (ctx: RequestContext) => Promise<ReviewAuthor>;
  /** The chat's messages from the engine, for cost per author. */
  sessionMessages: (workspace: WorkspaceInfo, sessionId: string) => Promise<unknown>;
  /** How the room's queue reaches the engine for this chat: whether it is busy, and sending. */
  queueEngine: (workspace: WorkspaceInfo, sessionId: string, room: Room) => QueueEngine;
}

function queueFailure(error: unknown): never {
  if (error instanceof QueueError) {
    const status = error.code === "queue_item_not_found" ? 404 : error.code === "not_queue_author" ? 403 : error.code === "queue_full" ? 409 : 400;
    throw new ApiError(status, error.code, error.message);
  }
  throw error;
}

const GUEST_TOKEN_MS = 24 * 60 * 60 * 1000;

/**
 * `/workspace/:id/sessions/:sessionId/room`: opening and ending a live room (host), who is in it,
 * presence, the room's event stream, and the host's guest list. Guests reach the reads, the
 * heartbeat and the stream through the guest route rules; everything that changes who is in the
 * room is host-only.
 */
export function registerRoomRoutes(options: RegisterRoomRoutesOptions): void {
  const { routes, config, jsonResponse, readJsonBody, ensureWritable, resolveWorkspaceWithoutBootstrap, resolveAuthor } = options;

  const target = async (ctx: RequestContext) => {
    const workspace = await resolveWorkspaceWithoutBootstrap(config, ctx.params.id ?? "");
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!isSafeId(sessionId)) throw new ApiError(400, "invalid_payload", "sessionId is invalid");
    return { workspace, sessionId };
  };

  const requireRoom = async (ctx: RequestContext) => {
    const { workspace, sessionId } = await target(ctx);
    const room = await activeRoom(config, workspace.id, sessionId);
    if (!room) throw new ApiError(404, "room_not_found", "No live room is open on this chat");
    return { workspace, sessionId, room };
  };

  const isHost = (ctx: RequestContext) => !ctx.actor?.guest;

  const participants = async (ctx: RequestContext, workspaceId: string, sessionId: string, roomId: string) => {
    const present = new Map(presentIn(roomId).map((entry) => [entry.participantId, entry]));
    const host = await resolveAuthorForHost();
    const guests = (await ctx.tokens.guestsFor(workspaceId, sessionId)).filter(
      (token) => token.guest?.roomId === roomId && (token.expiresAt === undefined || token.expiresAt > Date.now()),
    );
    return [
      { ...host, role: "host" as const, present: present.has(host.participantId), typing: present.get(host.participantId)?.typing ?? false },
      ...guests.map((token) => ({
        participantId: token.guest!.participant.participantId,
        displayName: token.guest!.participant.displayName,
        role: "guest" as const,
        capabilities: token.guest!.capabilities,
        present: present.has(token.guest!.participant.participantId),
        typing: present.get(token.guest!.participant.participantId)?.typing ?? false,
        // Only the host manages guests, so only the host sees the token ids.
        ...(isHost(ctx) ? { tokenId: token.id, expiresAt: token.expiresAt } : {}),
      })),
    ];
  };

  // The host's own name, the same one handoffs carry.
  const resolveAuthorForHost = () => resolveAuthor({ actor: { type: "host" } } as RequestContext);

  /** Mints a guest's token for the room and tells everyone. Shared by the guest list and knocks. */
  const admitGuest = async (
    ctx: RequestContext,
    input: { workspace: WorkspaceInfo; sessionId: string; room: Room; participant: { participantId: string; displayName: string }; capabilities: GuestCapability[]; endpointId?: string },
  ) => {
    const { workspace, sessionId, room, participant, capabilities, endpointId } = input;
    const issued = await ctx.tokens.create("collaborator", {
      label: `Guest: ${participant.displayName || participant.participantId}`,
      expiresAt: Date.now() + GUEST_TOKEN_MS,
      guest: { workspaceId: workspace.id, sessionId, participant, capabilities, roomId: room.roomId, ...(endpointId ? { endpointId } : {}) },
    });
    broadcast(room.roomId, { type: "room.participants" });
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "room.joined",
      target: sessionId,
      summary: `${participant.displayName || "A guest"} joined the live room`,
      timestamp: Date.now(),
    });
    return issued;
  };

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/room", "host", async (ctx) => {
    ensureWritable(config);
    const { workspace, sessionId } = await target(ctx);
    const room = await openRoom(config, { workspaceId: workspace.id, sessionId, host: await resolveAuthorForHost() });
    return jsonResponse({ room }, 201);
  });

  addRoute(routes, "DELETE", "/workspace/:id/sessions/:sessionId/room", "host", async (ctx) => {
    ensureWritable(config);
    const { workspace, sessionId, room } = await requireRoom(ctx);
    for (const token of await ctx.tokens.guestsFor(workspace.id, sessionId)) {
      if (token.guest?.roomId === room.roomId) await ctx.tokens.revoke(token.id);
    }
    broadcast(room.roomId, { type: "room.ended" });
    closeRoomStreams(room.roomId);
    clearQueue(room.roomId);
    forgetRoom(room.roomId);
    await endRoom(config, workspace.id, sessionId);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "room.ended",
      target: sessionId,
      summary: "Ended the live room",
      timestamp: Date.now(),
    });
    return jsonResponse({ ok: true });
  });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/room", "client", async (ctx) => {
    const { workspace, sessionId } = await target(ctx);
    const room = await activeRoom(config, workspace.id, sessionId);
    if (!room) return jsonResponse({ room: null });
    const authorship = await readAuthorship(config, workspace.id, sessionId);
    // Costs read the whole chat from the engine, so only when asked (the room panel, not the poll).
    const costs =
      ctx.url.searchParams.get("costs") === "1"
        ? costByAuthor(readCostMessages(await options.sessionMessages(workspace, sessionId).catch(() => [])), authorship)
        : undefined;
    return jsonResponse({
      room,
      me: await resolveAuthor(ctx),
      participants: await participants(ctx, workspace.id, sessionId, room.roomId),
      authorship,
      ...(costs ? { costs } : {}),
    });
  });

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/room/heartbeat", "client", async (ctx) => {
    const { room } = await requireRoom(ctx);
    const body = await readJsonBody(ctx.request).catch(() => ({}) as Record<string, unknown>);
    const who = await resolveAuthor(ctx);
    const reading = typeof body.reading === "string" && isSafeId(body.reading) ? body.reading : null;
    const { changed } = touchPresence(room.roomId, { ...who, role: isHost(ctx) ? "host" : "guest" }, { typing: body.typing === true, reading });
    const present = presentIn(room.roomId);
    if (changed) broadcast(room.roomId, { type: "room.presence", present });
    return jsonResponse({ present });
  });

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/room/leave", "client", async (ctx) => {
    const { room } = await requireRoom(ctx);
    const who = await resolveAuthor(ctx);
    dropPresence(room.roomId, who.participantId);
    broadcast(room.roomId, { type: "room.presence", present: presentIn(room.roomId) });
    return jsonResponse({ ok: true });
  });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/room/events", "client", async (ctx) => {
    const { room } = await requireRoom(ctx);
    const who = await resolveAuthor(ctx);
    const stream = roomEventStream(room.roomId, who.participantId, ctx.request.signal, [{ type: "room.presence", present: presentIn(room.roomId) }]);
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  });

  // The host's guest list. The bridge (L4) adds a guest when the host allows a knock; this route is
  // the same step for a guest on the loopback (tests, two app instances on one machine).
  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/room/guests", "host", async (ctx) => {
    ensureWritable(config);
    const { workspace, sessionId, room } = await requireRoom(ctx);
    const body = await readJsonBody(ctx.request);
    const participant = body.participant && typeof body.participant === "object" ? (body.participant as Record<string, unknown>) : null;
    const name = normalizeDisplayName(participant?.displayName ?? "");
    const capabilities = body.capabilities === undefined ? [...DEFAULT_GUEST_CAPABILITIES] : readCapabilities(body.capabilities);
    if (!participant || !isParticipantId(participant.participantId) || !name.ok || !capabilities) {
      throw new ApiError(400, "invalid_payload", "participant and capabilities are required");
    }
    const endpointId = typeof body.endpointId === "string" && body.endpointId.trim() ? body.endpointId.trim() : undefined;
    const issued = await admitGuest(ctx, { workspace, sessionId, room, participant: { participantId: participant.participantId as string, displayName: name.value }, capabilities, endpointId });
    return jsonResponse({ token: issued.token, tokenId: issued.id, expiresAt: issued.expiresAt }, 201);
  });

  addRoute(routes, "PATCH", "/workspace/:id/sessions/:sessionId/room/guests/:tokenId", "host", async (ctx) => {
    ensureWritable(config);
    const { workspace, sessionId, room } = await requireRoom(ctx);
    const body = await readJsonBody(ctx.request);
    const capabilities = readCapabilities(body.capabilities);
    if (!capabilities) throw new ApiError(400, "invalid_payload", "capabilities must be a list of send, approve and stop");
    const guest = (await ctx.tokens.guestsFor(workspace.id, sessionId)).find((token) => token.id === ctx.params.tokenId && token.guest?.roomId === room.roomId);
    if (!guest) throw new ApiError(404, "guest_not_found", "That guest is not in this room");
    await ctx.tokens.updateGuest(guest.id, { capabilities });
    broadcast(room.roomId, { type: "room.participants" });
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "guest.capabilities_changed",
      target: sessionId,
      summary: `${guest.guest?.participant.displayName || "A guest"} may now: ${capabilities.join(", ") || "only read"}`,
      timestamp: Date.now(),
    });
    return jsonResponse({ ok: true, capabilities });
  });

  addRoute(routes, "DELETE", "/workspace/:id/sessions/:sessionId/room/guests/:tokenId", "host", async (ctx) => {
    ensureWritable(config);
    const { workspace, sessionId, room } = await requireRoom(ctx);
    const guest = (await ctx.tokens.guestsFor(workspace.id, sessionId)).find((token) => token.id === ctx.params.tokenId && token.guest?.roomId === room.roomId);
    if (!guest?.guest) throw new ApiError(404, "guest_not_found", "That guest is not in this room");
    await ctx.tokens.revoke(guest.id);
    disconnect(room.roomId, guest.guest.participant.participantId);
    dropPresence(room.roomId, guest.guest.participant.participantId);
    broadcast(room.roomId, { type: "room.participants" });
    broadcast(room.roomId, { type: "room.presence", present: presentIn(room.roomId) });
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "guest.removed",
      target: sessionId,
      summary: `Removed ${guest.guest.participant.displayName || "a guest"} from the live room`,
      timestamp: Date.now(),
    });
    return jsonResponse({ ok: true });
  });

  /* ---------- Invites and knocks (L4) ---------- */

  const inviteFailure = (error: unknown): never => {
    if (error instanceof InviteError) {
      const status = error.code === "knock_not_found" ? 404 : error.code === "invite_invalid" ? 403 : 409;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  };

  /**
   * The device asking, as the host's bridge named it. A knock that did not come through the bridge
   * has none, and is refused: knocking is how a device on another machine gets in, not a way round
   * the guest list for something on this one.
   */
  const knockingEndpoint = (ctx: RequestContext) => {
    const endpointId = (ctx.request.headers.get("x-redrob-endpoint-id") ?? "").trim();
    if (!isEndpointId(endpointId)) throw new ApiError(400, "knock_needs_bridge", "Knocks come through the co-working bridge");
    return endpointId;
  };

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/room/invites", "host", async (ctx) => {
    ensureWritable(config);
    const { room } = await requireRoom(ctx);
    try {
      return jsonResponse(createInvite(room.roomId), 201);
    } catch (error) {
      return inviteFailure(error);
    }
  });

  addRoute(routes, "DELETE", "/workspace/:id/sessions/:sessionId/room/invites", "host", async (ctx) => {
    ensureWritable(config);
    const { room } = await requireRoom(ctx);
    revokeInvites(room.roomId);
    broadcast(room.roomId, { type: "room.knocks" });
    return jsonResponse({ ok: true });
  });

  // No token: the invite secret is the credential, and the bridge has named the device.
  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/room/knock", "none", async (ctx) => {
    const endpointId = knockingEndpoint(ctx);
    const { room } = await requireRoom(ctx);
    const body = await readJsonBody(ctx.request);
    const participant = body.participant && typeof body.participant === "object" ? (body.participant as Record<string, unknown>) : null;
    const name = normalizeDisplayName(participant?.displayName ?? "");
    if (!participant || !isParticipantId(participant.participantId) || !name.ok || typeof body.secret !== "string") {
      throw new ApiError(400, "invalid_payload", "secret and participant are required");
    }
    try {
      const entry = knock({
        roomId: room.roomId,
        secret: body.secret,
        endpointId,
        participant: { participantId: participant.participantId as string, displayName: name.value },
      });
      broadcast(room.roomId, { type: "room.knocks" });
      return jsonResponse({ knockId: entry.knockId, status: entry.status }, 202);
    } catch (error) {
      return inviteFailure(error);
    }
  });

  // The knocking device collects its answer here. The knock id is unguessable and bound to the device.
  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/room/knock/:knockId", "none", async (ctx) => {
    const endpointId = knockingEndpoint(ctx);
    const entry = knockFor(ctx.params.knockId ?? "", endpointId);
    if (!entry) throw new ApiError(404, "knock_not_found", "Nobody is waiting with that knock");
    if (entry.status !== "allowed" || !entry.grant) return jsonResponse({ status: entry.status });
    const { room } = await requireRoom(ctx);
    if (room.roomId !== entry.roomId) throw new ApiError(404, "knock_not_found", "Nobody is waiting with that knock");
    return jsonResponse({ status: entry.status, token: entry.grant.token, tokenId: entry.grant.tokenId, expiresAt: entry.grant.expiresAt });
  });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/room/knocks", "host", async (ctx) => {
    const { room } = await requireRoom(ctx);
    return jsonResponse({
      knocks: pendingKnocks(room.roomId).map(({ knockId, participant, endpointId, createdAt }) => ({ knockId, participant, endpointId, createdAt })),
    });
  });

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/room/knocks/:knockId", "host", async (ctx) => {
    ensureWritable(config);
    const { workspace, sessionId, room } = await requireRoom(ctx);
    const body = await readJsonBody(ctx.request);
    if (typeof body.allow !== "boolean") throw new ApiError(400, "invalid_payload", "allow must be true or false");
    const capabilities = body.capabilities === undefined ? [...DEFAULT_GUEST_CAPABILITIES] : readCapabilities(body.capabilities);
    if (!capabilities) throw new ApiError(400, "invalid_payload", "capabilities must be a list of send, approve and stop");
    let entry;
    try {
      entry = pendingKnock(room.roomId, ctx.params.knockId ?? "");
    } catch (error) {
      return inviteFailure(error);
    }
    if (!body.allow) {
      decideKnock(entry, { allow: false });
      broadcast(room.roomId, { type: "room.knocks" });
      return jsonResponse({ ok: true, status: "denied" });
    }
    const issued = await admitGuest(ctx, { workspace, sessionId, room, participant: entry.participant, capabilities, endpointId: entry.endpointId });
    decideKnock(entry, { allow: true, grant: { token: issued.token, tokenId: issued.id, expiresAt: issued.expiresAt } });
    broadcast(room.roomId, { type: "room.knocks" });
    return jsonResponse({ ok: true, status: "allowed", tokenId: issued.id });
  });

  /* ---------- The shared queue ---------- */

  const announceQueue = (roomId: string) => broadcast(roomId, { type: "room.queue", queue: queueView(roomId) });

  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/room/queue", "client", async (ctx) => {
    const { room } = await requireRoom(ctx);
    return jsonResponse({ queue: queueView(room.roomId) });
  });

  // A message for when the agent is free. Sent in order, by the server, under its author's name.
  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/room/queue", "client", async (ctx) => {
    const { workspace, sessionId, room } = await requireRoom(ctx);
    if (ctx.actor?.guest) requireCapability(ctx.actor.guest, "send");
    else if (ctx.actor?.scope === "viewer") throw new ApiError(403, "forbidden", "Viewer tokens are read-only");
    const body = await readJsonBody(ctx.request);
    const author = await resolveAuthor(ctx);
    let item: QueueItem;
    try {
      item = enqueue(room.roomId, author, body.body);
    } catch (error) {
      return queueFailure(error);
    }
    announceQueue(room.roomId);
    scheduleDrain(room.roomId, () => options.queueEngine(workspace, sessionId, room), () => announceQueue(room.roomId));
    const { body: _body, ...view } = item;
    return jsonResponse({ item: view, queue: queueView(room.roomId) }, 201);
  });

  addRoute(routes, "PATCH", "/workspace/:id/sessions/:sessionId/room/queue/:itemId", "client", async (ctx) => {
    const { room } = await requireRoom(ctx);
    const body = await readJsonBody(ctx.request);
    if (typeof body.text !== "string") throw new ApiError(400, "invalid_payload", "text is required");
    try {
      editQueued(room.roomId, ctx.params.itemId ?? "", body.text, await resolveAuthor(ctx), isHost(ctx));
    } catch (error) {
      return queueFailure(error);
    }
    announceQueue(room.roomId);
    return jsonResponse({ queue: queueView(room.roomId) });
  });

  addRoute(routes, "DELETE", "/workspace/:id/sessions/:sessionId/room/queue/:itemId", "client", async (ctx) => {
    const { room } = await requireRoom(ctx);
    try {
      removeQueued(room.roomId, ctx.params.itemId ?? "", await resolveAuthor(ctx), isHost(ctx));
    } catch (error) {
      return queueFailure(error);
    }
    announceQueue(room.roomId);
    return jsonResponse({ queue: queueView(room.roomId) });
  });
}
