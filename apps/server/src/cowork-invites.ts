import { randomBytes } from "node:crypto";
import { hashInviteSecret, type RoomParticipant } from "./cowork-room.js";

/**
 * Invites and knocks for a live room (L4).
 *
 * The host copies an invite: a single-use secret that lasts a day. A guest who opens it dials the
 * host over iroh and knocks with that secret; the host's bridge has already put the guest's
 * endpoint id on the request, so the knock names the device as well as the person. The host
 * allows or denies; an allowed knock gets a guest token bound to that endpoint and uses the invite
 * up. Only the secret's hash is kept.
 *
 * In memory on purpose: a restart of the host's server drops every live connection anyway, and an
 * invite that outlives its host's process is one nobody can see or revoke.
 */

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a knock waits for the host, and how long an answer stays collectable. */
export const KNOCK_TTL_MS = 10 * 60 * 1000;
const MAX_INVITES_PER_ROOM = 50;
const MAX_PENDING_KNOCKS_PER_ROOM = 20;

const ENDPOINT_ID_RE = /^[0-9a-f]{64}$/;
export function isEndpointId(value: unknown): value is string {
  return typeof value === "string" && ENDPOINT_ID_RE.test(value);
}

type Invite = { hash: string; roomId: string; expiresAt: number; usedBy?: string };

export type KnockStatus = "pending" | "allowed" | "denied";

export type Knock = {
  knockId: string;
  roomId: string;
  inviteHash: string;
  endpointId: string;
  participant: RoomParticipant;
  createdAt: number;
  status: KnockStatus;
  decidedAt?: number;
  grant?: { token: string; tokenId: string; expiresAt?: number };
};

export class InviteError extends Error {
  constructor(
    readonly code: "invite_invalid" | "invite_used" | "knock_not_found" | "knock_decided" | "too_many_knocks" | "too_many_invites",
    message: string,
  ) {
    super(message);
  }
}

const invites = new Map<string, Invite>();
const knocks = new Map<string, Knock>();

function prune(now: number): void {
  for (const [hash, invite] of invites) if (invite.expiresAt <= now) invites.delete(hash);
  for (const [id, knock] of knocks) {
    const since = knock.decidedAt ?? knock.createdAt;
    if (now - since > KNOCK_TTL_MS) knocks.delete(id);
  }
}

export function createInvite(roomId: string, now = Date.now()): { secret: string; expiresAt: number } {
  prune(now);
  if ([...invites.values()].filter((invite) => invite.roomId === roomId).length >= MAX_INVITES_PER_ROOM) {
    throw new InviteError("too_many_invites", "This room has too many open invites; revoke them and copy a new one");
  }
  const secret = randomBytes(32).toString("base64url");
  const invite: Invite = { hash: hashInviteSecret(secret), roomId, expiresAt: now + INVITE_TTL_MS };
  invites.set(invite.hash, invite);
  return { secret, expiresAt: invite.expiresAt };
}

/** Every unused invite to the room stops working. Pending knocks are denied. */
export function revokeInvites(roomId: string): void {
  for (const [hash, invite] of invites) if (invite.roomId === roomId) invites.delete(hash);
  for (const knock of knocks.values()) {
    if (knock.roomId === roomId && knock.status === "pending") Object.assign(knock, { status: "denied", decidedAt: Date.now() });
  }
}

/** Forgets the room: its invites and its knocks, answered or not. For when the room ends. */
export function forgetRoom(roomId: string): void {
  for (const [hash, invite] of invites) if (invite.roomId === roomId) invites.delete(hash);
  for (const [id, knock] of knocks) if (knock.roomId === roomId) knocks.delete(id);
}

/**
 * A device asks to come in. The same device knocking again with the same invite gets the knock it
 * already has, so a retry after a dropped connection does not queue a second one.
 */
export function knock(input: { roomId: string; secret: string; endpointId: string; participant: RoomParticipant; now?: number }): Knock {
  const now = input.now ?? Date.now();
  prune(now);
  const invite = typeof input.secret === "string" && input.secret ? invites.get(hashInviteSecret(input.secret)) : undefined;
  if (!invite || invite.roomId !== input.roomId) throw new InviteError("invite_invalid", "This invite is not valid; ask the host for a new one");
  if (invite.usedBy) {
    const previous = knocks.get(invite.usedBy);
    if (previous && previous.endpointId === input.endpointId) return previous;
    throw new InviteError("invite_used", "This invite has already been used; ask the host for a new one");
  }
  const pending = [...knocks.values()].filter((entry) => entry.inviteHash === invite.hash && entry.status === "pending");
  const mine = pending.find((entry) => entry.endpointId === input.endpointId);
  if (mine) return mine;
  if ([...knocks.values()].filter((entry) => entry.roomId === input.roomId && entry.status === "pending").length >= MAX_PENDING_KNOCKS_PER_ROOM) {
    throw new InviteError("too_many_knocks", "The host has too many people waiting; try again shortly");
  }
  const entry: Knock = {
    knockId: `knock_${randomBytes(12).toString("hex")}`,
    roomId: input.roomId,
    inviteHash: invite.hash,
    endpointId: input.endpointId,
    participant: input.participant,
    createdAt: now,
    status: "pending",
  };
  knocks.set(entry.knockId, entry);
  return entry;
}

export function pendingKnocks(roomId: string, now = Date.now()): Knock[] {
  prune(now);
  return [...knocks.values()].filter((entry) => entry.roomId === roomId && entry.status === "pending");
}

/** The knock as its own device may see it. Another device asking gets nothing. */
export function knockFor(knockId: string, endpointId: string, now = Date.now()): Knock | null {
  prune(now);
  const entry = knocks.get(knockId);
  return entry && entry.endpointId === endpointId ? entry : null;
}

export function pendingKnock(roomId: string, knockId: string): Knock {
  const entry = knocks.get(knockId);
  if (!entry || entry.roomId !== roomId) throw new InviteError("knock_not_found", "Nobody is waiting with that knock");
  if (entry.status !== "pending") throw new InviteError("knock_decided", "That knock has already been answered");
  return entry;
}

/** Allowing uses the invite up; a denied guest may knock again with the same invite. */
export function decideKnock(entry: Knock, decision: { allow: false } | { allow: true; grant: NonNullable<Knock["grant"]> }, now = Date.now()): void {
  entry.decidedAt = now;
  if (!decision.allow) {
    entry.status = "denied";
    return;
  }
  entry.status = "allowed";
  entry.grant = decision.grant;
  const invite = invites.get(entry.inviteHash);
  if (invite) invite.usedBy = entry.knockId;
  // Anyone else waiting on the same invite is turned away: it was single-use.
  for (const other of knocks.values()) {
    if (other !== entry && other.inviteHash === entry.inviteHash && other.status === "pending") Object.assign(other, { status: "denied", decidedAt: now });
  }
}

export const inviteInternals = { invites, knocks, reset: () => (invites.clear(), knocks.clear()) };
