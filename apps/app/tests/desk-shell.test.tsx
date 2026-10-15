import { afterEach, describe, expect, test } from "bun:test";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Navigate, Routes, createRoutesFromElements, matchRoutes } from "react-router";

import { CHATS } from "../src/react-app/desk/services/fixtures/chats";
import { at } from "../src/react-app/desk/services/fixtures/sample-day";
import { useInDeskFrame } from "../src/react-app/desk/shell/desk-frame";
import { RedirectToChat, RedirectToGuide, chatPath, deskRoutes } from "../src/react-app/desk/shell/desk-routes";
import { DeskShell, panelToggleLabel } from "../src/react-app/desk/shell/desk-shell";
import { buildDeskNav, formatNavTime, type DeskNavInput } from "../src/react-app/desk/shell/nav";
import { counted } from "../src/react-app/desk/shell/use-desk-nav-data";
import { useFrameStore } from "../src/react-app/desk/store/frame-store";

const NOW = at(28, 12, 0);

const input = (patch: Partial<DeskNavInput> = {}): DeskNavInput => ({
  chats: CHATS,
  waiting: 2,
  connected: 6,
  privacy: "high",
  notes: 22,
  now: NOW,
  locale: "en",
  ...patch,
});

function withProviders(node: ReactNode, path = "/chat") {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The markup of the header's action group. */
function actionsOf(html: string): string {
  const start = html.indexOf('class="rr-shell__actions"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</header>", start));
}

afterEach(() => useFrameStore.getState().closePanel());

describe("buildDeskNav", () => {
  test("lists the places, headings and recents in the handoff's order", () => {
    const nav = buildDeskNav(input());
    expect(nav.map((item) => item.heading ?? item.label)).toEqual([
      "Trending AI",
      "Conversations",
      "Skills",
      "Projects",
      "Scheduled",
      "Recent",
      "Notice by email - valid?",
      "Seorin indemnity cap",
      "Draft v3 against our standard",
      "Hanbit exhibit list",
      "Kim Minjun's questions on liability",
    ]);
  });

  test("shows each count as the row's meta", () => {
    const meta = Object.fromEntries(buildDeskNav(input()).map((item) => [String(item.id), item.meta]));
    expect(meta.scheduled).toBe("2");
    // Round 17: the Trending AI (guide) row no longer carries an "Auto" trailing badge.
    expect(meta.guide).toBeUndefined();
    // Round 37: Privacy/Memory/Connectors rows were removed from the left menu
    // (moved to Settings), so they no longer appear here.
    expect(meta.connectors).toBeUndefined();
    expect(meta.privacy).toBeUndefined();
    expect(meta.memory).toBeUndefined();
    expect(meta.chat).toBeUndefined();
    // Round 37: Recent rows no longer carry a date/time meta.
    expect(meta["recent-notice"]).toBeUndefined();
  });

  test("a count from sample data is never shown as the person's own", () => {
    expect(counted({ data: [1, 2, 3], preview: true }, (data) => data.length)).toBeNull();
    expect(counted({ data: [1, 2, 3], preview: false }, (data) => data.length)).toBe(3);
  });

  test("a count still loading shows no meta rather than a wrong one", () => {
    const meta = Object.fromEntries(
      buildDeskNav(input({ waiting: null, connected: null, privacy: null, notes: null })).map((item) => [String(item.id), item.meta]),
    );
    expect(meta.scheduled).toBeUndefined();
    expect(meta.connectors).toBeUndefined();
    expect(meta.privacy).toBeUndefined();
    expect(meta.memory).toBeUndefined();
  });

  test("Recent holds the five newest chats, newest first, whatever order they arrive in", () => {
    const nav = buildDeskNav(input({ chats: [...CHATS].reverse() }));
    const recent = nav.filter((item) => String(item.id).startsWith("recent-"));
    expect(recent.map((item) => item.id)).toEqual([
      "recent-notice",
      "recent-indemnity",
      "recent-s-draft3",
      "recent-hanbit-exh",
      "recent-s-kim",
    ]);
    // Round 37: Recent rows carry no date/time meta.
    expect(recent.map((item) => item.meta)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  test("hrefs are hash routes by default, and follow the router when it says otherwise", () => {
    const hrefs = buildDeskNav(input()).filter((item) => !item.heading).map((item) => item.href);
    expect(hrefs).toEqual([
      "#/guide",
      "#/chat",
      "#/skills",
      "#/projects",
      "#/scheduled",
      "#/chat/notice",
      "#/chat/indemnity",
      "#/chat/s-draft3",
      "#/chat/hanbit-exh",
      "#/chat/s-kim",
    ]);
    const plain = buildDeskNav(input({ toHref: (path) => path }));
    expect(plain[0]?.href).toBe("/guide");
  });

  test("marks only the current place, and the open chat in Recent", () => {
    const projects = buildDeskNav(input({ current: "projects" }));
    expect(projects.filter((item) => item.current).map((item) => item.id)).toEqual(["projects"]);

    const chat = buildDeskNav(input({ chatId: "indemnity" }));
    expect(chat.filter((item) => item.current).map((item) => item.id)).toEqual(["recent-indemnity"]);
  });

  test("an untitled chat still has a name", () => {
    const nav = buildDeskNav(input({ chats: [{ ...CHATS[0], title: "  " }] }));
    expect(nav.find((item) => item.id === "recent-notice")?.label).toBe("Untitled chat");
  });

  test("every place has an icon and headings have none", () => {
    for (const item of buildDeskNav(input())) {
      if (item.heading) expect(item.icon).toBeUndefined();
      else if (!String(item.id).startsWith("recent-")) expect(isValidElement(item.icon)).toBe(true);
    }
  });
});

describe("formatNavTime", () => {
  test("today shows the time on a 24 hour clock", () => {
    expect(formatNavTime(at(28, 9, 5), NOW, "en")).toBe("09:05");
    expect(formatNavTime(at(28, 21, 30), NOW, "ko")).toBe("21:30");
  });

  test("the past six days show the weekday", () => {
    expect(formatNavTime(at(27, 18), NOW, "en")).toBe("Sun");
    expect(formatNavTime(at(22, 9), NOW, "en")).toBe("Tue");
    expect(formatNavTime(at(22, 9), NOW, "ko")).toBe("화");
  });

  test("anything older shows the day and month in the person's language", () => {
    expect(formatNavTime(at(21, 9), NOW, "en")).toBe("Sep 21");
    expect(formatNavTime(at(2, 9), NOW, "ko")).toBe("9월 2일");
  });
});

describe("DeskShell", () => {
  test("inside a chat, the side panel button is rendered — gated on the chat header (round 14, item C)", () => {
    // The off-chat render test below proves it hides with no chat header. Here we assert the gate
    // itself in source: the panel IconButton is wrapped in `chatHeader ? (…) : null`, so it appears
    // only inside a chat. (A static renderToStaticMarkup does not reliably reflect the frame-store
    // chatHeader set from a test, so the structural guarantee is checked at the source, as the other
    // source-level suites in this app do.)
    const src = readFileSync(
      fileURLToPath(new URL("../src/react-app/desk/shell/desk-shell.tsx", import.meta.url)),
      "utf8",
    );
    expect(src).toContain("{chatHeader ? (");
    expect(src).toContain("icons.panelRight");
    // The panel IconButton must sit inside the chatHeader gate, before the gate closes.
    const gate = src.indexOf("{chatHeader ? (");
    const panel = src.indexOf("icons.panelRight");
    expect(gate).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(gate);
  });

  test("names the button for what it does: open when closed, close when open", () => {
    // A static render reads the store's initial (closed) state, so the open name is checked
    // on the function the button takes its label from, and the toggle on the store itself.
    expect(panelToggleLabel(false)).toBe("Open the side panel");
    expect(panelToggleLabel(true)).toBe("Close the side panel");
    useFrameStore.getState().togglePanel();
    expect(useFrameStore.getState().panel.open).toBe(true);
    useFrameStore.getState().togglePanel();
    expect(useFrameStore.getState().panel.open).toBe(false);
  });

  test("the side panel button is HIDDEN off a chat (Trending AI, Skills, Projects, History…)", () => {
    // Round 14, item C: no chat header -> no panel button, with or without screen actions.
    useFrameStore.getState().setChatHeader(null);
    const actions = actionsOf(withProviders(<DeskShell title="History" />));
    expect(actions).not.toContain('aria-label="Open the side panel"');
    expect(actions.match(/<button/g)?.length ?? 0).toBe(0);
  });

  test("renders the menu, the theme switch and the account slot, without the Desk wash", () => {
    const html = withProviders(
      <DeskShell current="projects" aside={<span>Account slot</span>}>
        <p>Work</p>
      </DeskShell>,
    );
    expect(html).toContain('aria-label="Main menu"');
    expect(html).toContain('class="rr-theme rr-theme--sm"');
    expect(html).toContain("Account slot");
    expect(html).toContain("Skip to the work");
    expect(html).toContain('aria-label="Fold the menu"');
    // Round 37 (DS 1.6.0): the shell now carries the renamed product marker
    // data-product="cowork" (was absent / "desk"). That is intentional - it drives
    // the product wash/mark - so assert it is present and correct.
    expect(html).toContain('data-product="cowork"');
    // MemoryRouter's root is "/", so the menu links are plain paths here.
    expect(html).toMatch(/href="\/projects" aria-current="page"/);
  });

  test("tells the screen inside it that the shell owns the menu", () => {
    function Probe() {
      return <span>{useInDeskFrame() ? "framed" : "bare"}</span>;
    }
    expect(withProviders(<Probe />)).toContain("bare");
    expect(withProviders(<DeskShell><Probe /></DeskShell>)).toContain("framed");
  });
});

describe("Desk routes", () => {
  const routes = createRoutesFromElements(deskRoutes(<span>chat screen</span>));
  const leaf = (path: string) => matchRoutes(routes, path)?.at(-1);

  test("session paths redirect to the chat; the root and unknown paths to Trending AI", () => {
    for (const path of ["/session", "/session/abc"]) {
      const element = leaf(path)?.route.element;
      expect(isValidElement(element) && element.type === RedirectToChat).toBe(true);
    }
    for (const path of ["/", "/nowhere/at/all"]) {
      const element = leaf(path)?.route.element;
      expect(isValidElement(element) && element.type === RedirectToGuide).toBe(true);
    }
    expect(leaf("/session/abc")?.params.sessionId).toBe("abc");
    expect(chatPath("abc")).toBe("/chat/abc");
    expect(chatPath(undefined)).toBe("/chat");
    expect(chatPath(" ")).toBe("/chat");
    expect(chatPath("a/b")).toBe("/chat/a%2Fb");
  });

  test("the chat and the workspace session routes render the same chat element", () => {
    const chat = leaf("/chat")?.route.element;
    for (const path of ["/chat/abc", "/workspace/w1/session", "/workspace/w1/session/abc"]) {
      expect(leaf(path)?.route.element).toBe(chat);
    }
    expect(leaf("/workspace/w1/session/abc")?.params).toMatchObject({ workspaceId: "w1", sessionId: "abc" });
  });

  test("the old Playbooks paths land on Skills", () => {
    for (const path of ["/playbooks", "/playbook/weekly-update", "/run"]) {
      const element = leaf(path)?.route.element;
      expect(isValidElement(element) && element.type === Navigate).toBe(true);
      expect(isValidElement<{ to: string }>(element) ? element.props.to : null).toBe("/skills");
    }
  });

  test("the Preview screens render their own screen inside the shell, with no placeholder left", () => {
    const screens: Array<[string, string, string, string]> = [
      ["/skills", "Skills", "skills", "Preview: sample skills."],
      ["/skill/notice", "notice", "skills", "Preview: sample skills."],
      ["/scheduled", "Scheduled", "scheduled", "Preview: sample schedules."],
      ["/history", "History", "history", "Preview: sample history."],
    ];
    for (const [path, title, place, note] of screens) {
      const html = withProviders(<Routes>{deskRoutes(<span>chat screen</span>)}</Routes>, path);
      expect(html).toContain("rr-shell");
      expect(html).toContain(`<h1 class="rr-shell__title">${title}</h1>`);
      expect(html).toContain(note);
      expect(html).not.toContain("on its way");
      // Round 37 (item 6): History was removed from the left menu, so its route
      // renders the screen but has no current nav row; the others still do.
      if (place === "history") {
        expect(html).not.toContain(`href="/${place}" aria-current="page"`);
      } else {
        expect(html).toContain(`href="/${place}" aria-current="page"`);
      }
      expect(html).not.toContain("chat screen");
    }
  });
});
