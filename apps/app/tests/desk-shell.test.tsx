import { afterEach, describe, expect, test } from "bun:test";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, createRoutesFromElements, matchRoutes } from "react-router";

import { CHATS } from "../src/react-app/desk/services/fixtures/chats";
import { at } from "../src/react-app/desk/services/fixtures/sample-day";
import { useInDeskFrame } from "../src/react-app/desk/shell/desk-frame";
import { RedirectToChat, chatPath, deskRoutes } from "../src/react-app/desk/shell/desk-routes";
import { DeskShell, panelToggleLabel } from "../src/react-app/desk/shell/desk-shell";
import { buildDeskNav, formatNavTime, type DeskNavInput } from "../src/react-app/desk/shell/nav";
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
      "New chat",
      "Projects",
      "Playbooks",
      "Scheduled",
      "History",
      "Recent",
      "Notice by email - valid?",
      "Seorin indemnity cap",
      "Draft v3 against our standard",
      "Hanbit exhibit list",
      "How Desk works for you",
      "Model Guide",
      "Connectors",
      "Privacy protection",
      "Memory",
    ]);
  });

  test("shows each count as the row's meta", () => {
    const meta = Object.fromEntries(buildDeskNav(input()).map((item) => [String(item.id), item.meta]));
    expect(meta.scheduled).toBe("2");
    expect(meta.guide).toBe("Auto");
    expect(meta.connectors).toBe("6");
    expect(meta.privacy).toBe("High");
    expect(meta.memory).toBe("22");
    expect(meta.chat).toBeUndefined();
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

  test("Recent holds the four newest chats, newest first, whatever order they arrive in", () => {
    const nav = buildDeskNav(input({ chats: [...CHATS].reverse() }));
    const recent = nav.filter((item) => String(item.id).startsWith("recent-"));
    expect(recent.map((item) => item.id)).toEqual([
      "recent-notice",
      "recent-indemnity",
      "recent-s-draft3",
      "recent-hanbit-exh",
    ]);
    expect(recent.map((item) => item.meta)).toEqual(["09:40", "08:10", "Fri", "Fri"]);
  });

  test("hrefs are hash routes by default, and follow the router when it says otherwise", () => {
    const hrefs = buildDeskNav(input()).filter((item) => !item.heading).map((item) => item.href);
    expect(hrefs).toEqual([
      "#/chat",
      "#/projects",
      "#/playbooks",
      "#/scheduled",
      "#/history",
      "#/chat/notice",
      "#/chat/indemnity",
      "#/chat/s-draft3",
      "#/chat/hanbit-exh",
      "#/guide",
      "#/connectors",
      "#/privacy",
      "#/memory",
    ]);
    const plain = buildDeskNav(input({ toHref: (path) => path }));
    expect(plain[0]?.href).toBe("/chat");
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
  test("puts the side panel button last in the header, named for opening it", () => {
    const html = withProviders(
      <DeskShell title="Projects" actions={<button type="button">First action</button>}>
        <p>Work</p>
      </DeskShell>,
    );
    const actions = actionsOf(html);
    expect(actions.indexOf("First action")).toBeGreaterThan(-1);
    const lastButton = actions.slice(actions.lastIndexOf("<button"));
    expect(lastButton).toContain('aria-label="Open the side panel"');
    expect(actions.indexOf("First action")).toBeLessThan(actions.lastIndexOf("<button"));
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

  test("the panel button is there with no screen actions too", () => {
    const actions = actionsOf(withProviders(<DeskShell title="History" />));
    expect(actions.match(/<button/g)?.length).toBe(1);
    expect(actions).toContain('aria-label="Open the side panel"');
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
    expect(html).not.toContain("data-product");
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

  test("legacy session paths, the root and unknown paths redirect to the chat", () => {
    for (const path of ["/", "/session", "/session/abc", "/nowhere/at/all"]) {
      const element = leaf(path)?.route.element;
      expect(isValidElement(element) && element.type === RedirectToChat).toBe(true);
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

  test("every screen still to come renders a placeholder inside the shell", () => {
    const screens: Array<[string, string, string]> = [
      ["/playbooks", "Playbooks", "playbooks"],
      ["/playbook/notice", "Playbook", "playbooks"],
      ["/run", "Playbook run", "playbooks"],
      ["/scheduled", "Scheduled", "scheduled"],
      ["/history", "History", "history"],
      ["/guide", "Model Guide", "guide"],
    ];
    for (const [path, title, place] of screens) {
      const html = withProviders(<Routes>{deskRoutes(<span>chat screen</span>)}</Routes>, path);
      expect(html).toContain("rr-shell");
      expect(html).toContain(`<h1 class="rr-shell__title">${title}</h1>`);
      expect(html).toContain("rr-empty");
      expect(html).toContain("This part of Redrob Cowork is on its way.");
      expect(html).toContain(`href="/${place}" aria-current="page"`);
      expect(html).not.toContain("chat screen");
    }
  });
});
