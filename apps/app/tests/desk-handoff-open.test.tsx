import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { RedrobServerError, type RedrobHandoffInspection, type RedrobReceivedHandoff } from "../src/app/lib/redrob-server";
import { t } from "../src/i18n";
import {
  HandoffBannerView,
  HandoffOpenView,
  handoffProjectName,
  isHandoffLocked,
  openFailureText,
  parseOpenHandoffLink,
  sessionRoute,
  takeOpenHandoffLinks,
  useHandoffLock,
} from "../src/react-app/desk/handoff/handoff-open";

const INSPECTION: RedrobHandoffInspection = {
  handoff: {
    id: "hof_000000000000000000000001",
    createdAt: "2026-10-08T09:00:00Z",
    from: { participantId: "par_000000000000000000000001", displayName: "Kim Jiwon" },
    ask: "review",
    note: "Check clause 4",
    workspaceName: "Client A",
    session: { id: "ses_1", title: "Lease review", messages: 4 },
    engine: { redrobCodeVersion: "0.1.0" },
    files: [{ path: "memo.md", kind: "produced", bytes: 2048 }],
    skills: ["house-style"],
    commands: ["weekly-update"],
    comments: 2,
    state: "open",
  },
  digest: "d",
  compatibility: "same",
  alreadyOpened: null,
};

const RECEIVED: RedrobReceivedHandoff = {
  id: "hof_000000000000000000000001",
  direction: "received",
  workspaceId: "ws",
  sessionId: "ses_1",
  originSessionId: "ses_1",
  createdAt: 1,
  fromName: "Kim Jiwon",
  fromParticipantId: "par_000000000000000000000001",
  ask: "continue",
  note: "Over to you",
};

describe("open-handoff links", () => {
  test("only a .redrobhandoff path on the app's own scheme", () => {
    expect(parseOpenHandoffLink("redrob://open-handoff?file=%2FUsers%2Fme%2Fa.redrobhandoff")).toEqual({ path: "/Users/me/a.redrobhandoff" });
    expect(parseOpenHandoffLink("redrob-dev://open-handoff?file=C%3A%5Ca.redrobhandoff")).toEqual({ path: "C:\\a.redrobhandoff" });
    expect(parseOpenHandoffLink("redrob://open-handoff?file=%2Fetc%2Fpasswd")).toBeNull();
    expect(parseOpenHandoffLink("https://open-handoff?file=a.redrobhandoff")).toBeNull();
    expect(parseOpenHandoffLink("redrob://connect-remote?x=1")).toBeNull();
  });

  test("taking them leaves every other pending link in place", () => {
    const target = { __REDROB__: { deepLinks: ["redrob://connect-remote?x=1", "redrob://open-handoff?file=%2Fa.redrobhandoff"] } } as unknown as Window;
    expect(takeOpenHandoffLinks(target)).toEqual([{ path: "/a.redrobhandoff" }]);
    expect(target.__REDROB__?.deepLinks).toEqual(["redrob://connect-remote?x=1"]);
  });
});

describe("opening", () => {
  test("the preview names the sender as unverified, the ask, the note and what comes with it", () => {
    const html = renderToStaticMarkup(<HandoffOpenView inspection={INSPECTION} />);
    expect(html).toContain(t("desk.handoff_open_from", { name: "Kim Jiwon" }));
    expect(html).toContain(t("desk.handoff_open_unverified"));
    expect(html).toContain(t("desk.handoff_ask_review"));
    expect(html).toContain("Check clause 4");
    expect(html).toContain("memo.md");
    expect(html).toContain(t("desk.handoff_open_skill", { name: "house-style" }));
    expect(html).toContain(t("desk.handoff_open_comments", { count: 2 }));
    expect(html).not.toContain(t("desk.handoff_open_version_title"));
  });

  test("another engine version and an earlier open are said", () => {
    const html = renderToStaticMarkup(
      <HandoffOpenView inspection={{ ...INSPECTION, compatibility: "different", alreadyOpened: { workspaceId: "w", sessionId: "s" } }} onGoToOpened={() => {}} />,
    );
    expect(html).toContain(t("desk.handoff_open_version_title"));
    expect(html).toContain(t("desk.handoff_open_again_title"));
    expect(html).toContain(t("desk.handoff_open_go"));
  });

  test("failures say what happened", () => {
    expect(openFailureText(new RedrobServerError(400, "handoff_tampered", "x"))).toBe(t("desk.handoff_open_tampered"));
    expect(openFailureText(new RedrobServerError(422, "handoff_unsupported", "x"))).toBe(t("desk.handoff_open_newer"));
    expect(openFailureText(new RedrobServerError(400, "handoff_invalid", "x"))).toBe(t("desk.handoff_open_invalid"));
  });

  test("the project and the route", () => {
    expect(handoffProjectName("Lease review")).toBe(t("desk.handoff_open_project", { title: "Lease review" }));
    expect(handoffProjectName("  ")).toBe(t("desk.handoff_open_project", { title: t("desk.handoff_open_untitled") }));
    expect(sessionRoute("ws 1", "ses_1")).toBe("/workspace/ws%201/session/ses_1");
  });
});

describe("in the chat", () => {
  test("the banner offers Continue until continued, and says when it is text only", () => {
    const open = renderToStaticMarkup(<HandoffBannerView handoff={{ ...RECEIVED, fallback: true }} busy={false} onContinue={() => {}} />);
    expect(open).toContain(t("desk.handoff_banner_from", { name: "Kim Jiwon", ask: t("desk.handoff_ask_continue") }));
    expect(open).toContain("Over to you");
    expect(open).toContain(t("desk.handoff_continue"));
    expect(open).toContain(t("desk.handoff_banner_fallback"));
    const continued = renderToStaticMarkup(<HandoffBannerView handoff={{ ...RECEIVED, continuedAt: 5 }} busy={false} onContinue={() => {}} />);
    expect(continued).toContain(t("desk.handoff_banner_continued"));
    expect(continued).not.toContain(`>${t("desk.handoff_continue")}<`);
  });

  test("the lock is per chat", () => {
    useHandoffLock.getState().set("ses_1", true);
    expect(isHandoffLocked("ses_1")).toBe(true);
    expect(isHandoffLocked("ses_2")).toBe(false);
    useHandoffLock.getState().set("ses_1", false);
    expect(isHandoffLocked("ses_1")).toBe(false);
  });
});
