import { describe, expect, test } from "bun:test";

import type { RedrobRoomParticipant } from "../src/app/lib/redrob-server";
import { t } from "../src/i18n";
import {
  coworkFailureText,
  joinedChatPath,
  parseJoinLink,
  participantsInOrder,
  takeJoinLinks,
  unavailableText,
  withCapability,
} from "../src/react-app/desk/room/cowork-logic";

const INVITE = `redrob://join?h=${"a".repeat(64)}&r=https%3A%2F%2Frelay-apne2.redrob.ai%2F&w=ws_1&s=ses_1&k=${"A".repeat(43)}`;

describe("join links", () => {
  test("an invite names the chat; anything else is not ours", () => {
    expect(parseJoinLink(INVITE)).toEqual({ link: INVITE, workspaceId: "ws_1", sessionId: "ses_1" });
    expect(parseJoinLink(INVITE.replace("redrob://", "redrob-dev://"))?.sessionId).toBe("ses_1");
    expect(parseJoinLink(INVITE.replace("redrob://", "https://"))).toBeNull();
    expect(parseJoinLink("redrob://open-handoff?file=%2Ftmp%2Fa.redrobhandoff")).toBeNull();
    expect(parseJoinLink("redrob://join?h=x&w=ws_1&s=ses_1")).toBeNull();
    expect(parseJoinLink("not a link")).toBeNull();
  });

  test("taking invites leaves every other pending link", () => {
    const handoff = "redrob://open-handoff?file=%2Ftmp%2Fa.redrobhandoff";
    const target = { __REDROB__: { deepLinks: [handoff, INVITE] } };
    expect(takeJoinLinks(target).map((entry) => entry.link)).toEqual([INVITE]);
    expect(target.__REDROB__.deepLinks).toEqual([handoff]);
    expect(takeJoinLinks({})).toEqual([]);
  });
});

describe("what to say", () => {
  test("each reason the bridge gives has its own words", () => {
    expect(unavailableText("intel_mac")).toBe(t("desk.cowork_unavailable_intel"));
    expect(unavailableText("binding_missing")).toBe(t("desk.cowork_unavailable_build"));
    expect(unavailableText("self_check_failed")).toBe(t("desk.cowork_unavailable_check"));
    expect(coworkFailureText("intel_mac")).toBe(t("desk.cowork_unavailable_intel"));
    expect(coworkFailureText("knock_denied")).toBe(t("desk.cowork_failed_denied"));
    expect(coworkFailureText("invite_used")).toBe(t("desk.cowork_failed_used"));
    expect(coworkFailureText("host_unreachable")).toBe(t("desk.cowork_failed_unreachable"));
    expect(coworkFailureText("room_not_found")).toBe(t("desk.cowork_failed_ended"));
    expect(coworkFailureText("something_new")).toBe(t("desk.settings_try_again"));
  });
});

describe("guests and their rights", () => {
  test("capabilities keep the server's order and never repeat", () => {
    expect(withCapability(["stop"], "send", true)).toEqual(["send", "stop"]);
    expect(withCapability(["send", "stop"], "send", true)).toEqual(["send", "stop"]);
    expect(withCapability(["send", "approve", "stop"], "approve", false)).toEqual(["send", "stop"]);
    expect(withCapability([], "stop", false)).toEqual([]);
  });

  test("the host first, then who is here, then who is away", () => {
    const person = (displayName: string, role: "host" | "guest", present: boolean): RedrobRoomParticipant => ({
      participantId: `par_${displayName}`,
      displayName,
      role,
      present,
      typing: false,
    });
    const ordered = participantsInOrder([person("Yoon", "guest", false), person("Park", "guest", true), person("Kim", "host", false), person("Ahn", "guest", true)]);
    expect(ordered.map((entry) => entry.displayName)).toEqual(["Kim", "Ahn", "Park", "Yoon"]);
  });

  test("a joined chat opens in the workspace the desktop app just made active", () => {
    expect(joinedChatPath({ workspace: { activeId: "remote_1" }, sessionId: "ses_1" })).toBe("/workspace/remote_1/session/ses_1");
    expect(joinedChatPath({ workspace: null, sessionId: "ses_1" })).toBeNull();
  });
});
