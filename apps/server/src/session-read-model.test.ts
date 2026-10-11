import { describe, expect, test } from "bun:test";
import type { Session, SessionStatus } from "@redrob-labs/sdk/v2/client";

import { buildSessionSnapshot, buildSessionStatuses } from "./session-read-model.js";

/**
 * The engine reports a turn the console refused, with something the user can act on, as `blocked`
 * (redrob-code since v0.4.0). A read model that only knew idle, busy and retry failed the whole
 * snapshot, and the session list's statuses, on the first refusal.
 */

const session: Session = {
  id: "s1",
  slug: "chat",
  projectID: "p1",
  directory: "/w",
  title: "Chat",
  version: "0.4.1",
  time: { created: 1, updated: 2 },
};
const blocked: SessionStatus = {
  type: "blocked",
  message: "Your Redrob balance is too low.",
  action: {
    reason: "credit",
    provider: "redrob",
    title: "Out of credit",
    message: "Top up to continue.",
    label: "Top up",
    link: "https://console.redrob.ai/billing",
  },
};

describe("session read model", () => {
  test("a blocked session's snapshot carries the status and its action", () => {
    const snapshot = buildSessionSnapshot({ session, messages: [], todos: [], statuses: { s1: blocked } });
    expect(snapshot.status).toEqual(blocked);
  });

  test("statuses accept blocked, with or without an action, next to the others", () => {
    const statuses: Record<string, SessionStatus> = {
      a: { type: "idle" },
      b: { type: "busy" },
      c: { type: "blocked", message: "No access." },
      d: blocked,
    };
    expect(buildSessionStatuses(statuses)).toEqual(statuses);
  });
});
