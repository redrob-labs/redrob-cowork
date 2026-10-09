import type { CoworkUnavailableReason } from "../../../app/lib/desktop";
import type { RedrobGuestCapability, RedrobRoomParticipant } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";

/**
 * The co-working UI's decisions, apart from React: which links are invites, what to say when
 * something fails, and the order people are listed in. The bridge re-checks every invite in full;
 * this only decides which pending deep links are ours to take.
 */

export const GUEST_CAPABILITIES: readonly RedrobGuestCapability[] = ["send", "approve", "stop"];

/** `redrob://join?...` (or `redrob-dev://` in development), with the chat it names. */
export function parseJoinLink(raw: string): { link: string; workspaceId: string; sessionId: string } | null {
  try {
    const url = new URL(raw);
    if (!/^redrob(-dev)?:$/.test(url.protocol)) return null;
    const route = `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
    if (route !== "join") return null;
    const workspaceId = url.searchParams.get("w") ?? "";
    const sessionId = url.searchParams.get("s") ?? "";
    if (!workspaceId || !sessionId || !url.searchParams.get("h") || !url.searchParams.get("k")) return null;
    return { link: raw, workspaceId, sessionId };
  } catch {
    return null;
  }
}

type DeepLinkWindow = { __REDROB__?: { deepLinks?: string[] } };

/** Takes the invite links out of the pending deep links, leaving every other link where it was. */
export function takeJoinLinks(target: DeepLinkWindow): Array<{ link: string; workspaceId: string; sessionId: string }> {
  const pending = target.__REDROB__?.deepLinks ?? [];
  const taken: Array<{ link: string; workspaceId: string; sessionId: string }> = [];
  const rest: string[] = [];
  for (const link of pending) {
    const parsed = parseJoinLink(link);
    if (parsed) taken.push(parsed);
    else rest.push(link);
  }
  if (target.__REDROB__) target.__REDROB__.deepLinks = rest;
  return taken;
}

export function unavailableText(reason: CoworkUnavailableReason): string {
  if (reason === "intel_mac") return t("desk.cowork_unavailable_intel");
  if (reason === "self_check_failed") return t("desk.cowork_unavailable_check");
  return t("desk.cowork_unavailable_build");
}

/** A bridge or server failure code, in words a person can act on. */
export function coworkFailureText(code: string): string {
  switch (code) {
    case "intel_mac":
    case "binding_missing":
    case "self_check_failed":
      return unavailableText(code);
    case "invite_invalid":
      return t("desk.cowork_failed_invite");
    case "invite_used":
      return t("desk.cowork_failed_used");
    case "invite_own":
      return t("desk.cowork_failed_own");
    case "knock_denied":
      return t("desk.cowork_failed_denied");
    case "knock_timeout":
      return t("desk.cowork_failed_timeout");
    case "host_unreachable":
    case "tunnel_failed":
      return t("desk.cowork_failed_unreachable");
    case "room_not_found":
      return t("desk.cowork_failed_ended");
    case "invalid_payload":
      return t("desk.cowork_failed_name");
    default:
      return t("desk.settings_try_again");
  }
}

/** Adds or removes one capability, keeping the canonical order the server stores. */
export function withCapability(current: readonly RedrobGuestCapability[], capability: RedrobGuestCapability, on: boolean): RedrobGuestCapability[] {
  const next = new Set(current);
  if (on) next.add(capability);
  else next.delete(capability);
  return GUEST_CAPABILITIES.filter((entry) => next.has(entry));
}

export function capabilityLabel(capability: RedrobGuestCapability): string {
  if (capability === "send") return t("desk.cowork_can_send");
  if (capability === "approve") return t("desk.cowork_can_approve");
  return t("desk.cowork_can_stop");
}

/** The host first, then whoever is here, then whoever is away; by name within each. */
export function participantsInOrder(list: readonly RedrobRoomParticipant[]): RedrobRoomParticipant[] {
  const rank = (entry: RedrobRoomParticipant) => (entry.role === "host" ? 0 : entry.present ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
}

/** Where a joined chat opens: the new remote workspace the desktop app just made active. */
export function joinedChatPath(joined: { workspace: { activeId?: string | null } | null; sessionId: string }): string | null {
  const workspaceId = joined.workspace?.activeId;
  return workspaceId ? `/workspace/${encodeURIComponent(workspaceId)}/session/${encodeURIComponent(joined.sessionId)}` : null;
}
