import { describe, expect, test } from "bun:test";

import { createRoomEventParser, type RedrobRoomEvent, type RedrobRoomParticipant, type RedrobRoomView } from "../src/app/lib/redrob-server";
import { t } from "../src/i18n";
import {
  applyRoomEvent,
  canChangeQueued,
  coworkFailureText,
  joinedChatPath,
  parseJoinLink,
  participantsInOrder,
  readQueueItems,
  roomEventEffect,
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

describe("the room's event stream", () => {
  const view: RedrobRoomView = {
    room: { roomId: "room_1", workspaceId: "ws_1", sessionId: "ses_1", host: { participantId: "par_host", displayName: "Kim" }, createdAt: 1 },
    me: { participantId: "par_host", displayName: "Kim" },
    participants: [
      { participantId: "par_host", displayName: "Kim", role: "host", present: true, typing: false },
      { participantId: "par_guest", displayName: "Park", role: "guest", present: false, typing: false },
    ],
    authorship: [{ messageId: "msg_1", participantId: "par_host", displayName: "Kim", at: 1 }],
  };

  test("presence and authorship update the cached room in place", () => {
    const present = applyRoomEvent(view, { type: "room.presence", present: [{ participantId: "par_guest", displayName: "Park", role: "guest", typing: true }] });
    expect(present.participants.map((entry) => [entry.participantId, entry.present, entry.typing])).toEqual([
      ["par_host", false, false],
      ["par_guest", true, true],
    ]);
    const entry = { messageId: "msg_2", participantId: "par_guest", displayName: "Park", at: 2 };
    const authored = applyRoomEvent(view, { type: "room.authorship", entry });
    expect(authored.authorship.map((item) => item.messageId)).toEqual(["msg_1", "msg_2"]);
    expect(applyRoomEvent(authored, { type: "room.authorship", entry })).toBe(authored);
    expect(applyRoomEvent(view, { type: "room.knocks" })).toBe(view);
  });

  test("other events say what to read again", () => {
    expect(roomEventEffect({ type: "room.knocks" })).toEqual({ room: false, knocks: true, costs: false, review: false });
    expect(roomEventEffect({ type: "room.participants" })).toEqual({ room: true, knocks: true, costs: false, review: false });
    expect(roomEventEffect({ type: "room.ended" }).room).toBe(true);
    expect(roomEventEffect({ type: "review.updated" }).review).toBe(true);
    expect(roomEventEffect({ type: "room.authorship", entry: view.authorship[0]! }).costs).toBe(true);
  });

  test("the parser splits events across chunks and skips comments and strangers", () => {
    const seen: RedrobRoomEvent[] = [];
    const feed = createRoomEventParser((event) => seen.push(event));
    feed(": connected\n\nevent: room.knocks\nda");
    expect(seen).toEqual([]);
    feed('ta: {"type":"room.knocks"}\n\n: keep-alive\n\nevent: x\ndata: {"type":"other"}\n\n');
    feed('event: room.ended\r\ndata: {"type":"room.ended"}\r\n\r\ndata: not json\n\n');
    expect(seen).toEqual([{ type: "room.knocks" }, { type: "room.ended" }]);
  });
});

describe("the shared queue", () => {
  const room = {
    room: { roomId: "room_1", workspaceId: "ws_1", sessionId: "ses_1", host: { participantId: "par_host", displayName: "Kim" }, createdAt: 1 },
    me: { participantId: "par_guest", displayName: "Park" },
  };

  test("reads the event's list and drops what is not an item", () => {
    expect(
      readQueueItems([
        { id: "rq_1", author: { participantId: "par_guest", displayName: "Park" }, preview: "next, the summary", createdAt: 5 },
        { id: "rq_2", author: { participantId: "par_host" } },
        { id: "rq_3" },
        "junk",
      ]),
    ).toEqual([
      { id: "rq_1", author: { participantId: "par_guest", displayName: "Park" }, preview: "next, the summary", createdAt: 5, editable: false },
      { id: "rq_2", author: { participantId: "par_host", displayName: "" }, preview: "", createdAt: 0, editable: false },
    ]);
    expect(readQueueItems([{ id: "rq_4", author: { participantId: "p" }, editable: true }])[0]?.editable).toBe(true);
  });

  test("its author and the host may change a waiting message, nobody else", () => {
    const mine = { id: "rq_1", author: { participantId: "par_guest", displayName: "Park" }, preview: "", createdAt: 0 };
    const theirs = { ...mine, author: { participantId: "par_other", displayName: "Lee" } };
    expect(canChangeQueued(mine, room)).toBe(true);
    expect(canChangeQueued(theirs, room)).toBe(false);
    expect(canChangeQueued(theirs, { ...room, me: room.room.host })).toBe(true);
  });

  test("the server's refusals have words", () => {
    expect(coworkFailureText("queue_full")).toBe(t("desk.cowork_failed_queue_full"));
    expect(coworkFailureText("guest_capability_missing")).toBe(t("desk.cowork_failed_cannot_send"));
    expect(coworkFailureText("guest_plan_only")).toBe(t("desk.cowork_failed_plan_only"));
  });
});
