import { afterEach, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes } from "react-router";

import { setLocale, type Language } from "../src/i18n";
import { PRIVACY_QUERY_KEY, PrivacyView, parseNames, privacyLevelMeta } from "../src/react-app/desk/privacy/desk-privacy";
import { createFixtureDeskServices } from "../src/react-app/desk/services/fixture-services";
import { PRIVACY } from "../src/react-app/desk/services/fixtures/privacy";
import type { PrivacyState } from "../src/react-app/desk/services/types";
import { deskRoutes } from "../src/react-app/desk/shell/desk-routes";
import { PrivacyConfirmDialogView } from "../src/react-app/desk/shell/desk-layer";

function render(node: ReactNode, path = "/privacy", client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The text between tags and the labels a screen reader says. */
function readable(html: string): string {
  const labels = [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);
  return [html.replace(/<[^>]*>/g, " "), ...labels].join(" ");
}

function view(state: PrivacyState, desktop = true, preview = false) {
  return render(<PrivacyView state={state} desktop={desktop} preview={preview} busy={false} onLevel={() => {}} onNames={() => {}} />);
}

afterEach(() => setLocale("en"));

describe("privacy helpers", () => {
  test("privacyLevelMeta names the level", () => {
    expect(privacyLevelMeta("high")).toBe("High");
    expect(privacyLevelMeta("standard")).toBe("Standard");
    expect(privacyLevelMeta("strict")).toBe("Strict");
    expect(privacyLevelMeta("off")).toBe("Off");
  });

  test("the names box keeps one name per line, without blanks or repeats", () => {
    expect(parseNames(" Kim Minjun \n\nSeorin\r\nSeorin\n")).toEqual(["Kim Minjun", "Seorin"]);
  });

  test("the sample services change the level and the names", async () => {
    const fixture = createFixtureDeskServices();
    expect((await fixture.privacy.setLevel("strict")).data.level).toBe("strict");
    expect((await fixture.privacy.setNames(["Kim Minjun"])).data.names).toEqual(["Kim Minjun"]);
  });
});

describe("PrivacyView", () => {
  test("on: the level, the count this week, the levels to choose and the names", () => {
    const html = view(PRIVACY);
    expect(html).not.toContain("Nothing on this screen is running yet.");
    expect(html).toContain("Privacy protection is on: High");
    expect(html).toContain("Private details kept from AI this week: 214");
    expect(html).toContain("Your level");
    expect(html.match(/>Use</g)?.length).toBe(3);
    expect(html).toContain("Names to keep private");
    expect(html).toContain("Seorin Partners");
    expect(html).toContain("Attached files and text in images are sent as they are");
    expect(html).not.toContain("Keep private work on this laptop");
  });

  test("sample data reads Off, with no level, no count and nothing to change", () => {
    const html = view(PRIVACY, true, true);
    expect(html).toContain("Nothing on this screen is running yet.");
    expect(html).toContain("Privacy protection is off");
    expect(html).not.toContain("Privacy protection is on");
    expect(html).not.toContain("214");
    expect(html).not.toContain("Your level");
    expect(html).not.toContain(">Use<");
    expect(html).not.toContain("Names to keep private");
  });

  test("locked by the team policy: the level and names cannot change here, and it says who set them", () => {
    const html = view({ ...PRIVACY, locked: true, setBy: "Park Hyunjin" });
    expect(html).toContain("Set by Park Hyunjin in your team&#x27;s policy. It cannot be changed here.");
    expect(html).not.toContain(">Use<");
    expect(html).not.toContain("Save names");
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });

  test("on the web: privacy is off here and nothing can be changed", () => {
    const html = view(PRIVACY, false);
    expect(html).toContain("Privacy protection is off here");
    expect(html).not.toContain(">Use<");
  });

  test("uses the product words, in English and in Korean", () => {
    const locales: Language[] = ["en", "ko"];
    for (const locale of locales) {
      setLocale(locale);
      for (const html of [view(PRIVACY), view({ ...PRIVACY, locked: true, setBy: "Park" }), view(PRIVACY, false)]) {
        const text = readable(html);
        for (const banned of [/AI Firewall/i, /Ollama/i, /local LLM/i, /API key/i]) expect(text).not.toMatch(banned);
      }
    }
  });

  test("Korean has the screen's words in Korean", () => {
    setLocale("ko");
    const html = view(PRIVACY);
    expect(html).toContain("비공개로 둘 이름");
    expect(html).toContain("이 컴퓨터가 먼저 읽습니다");
  });
});

describe("Strict confirm", () => {
  test("says how many details and which kinds, with Send and Edit", () => {
    const html = renderToStaticMarkup(
      <PrivacyConfirmDialogView confirm={{ count: 3, kinds: ["email", "name"], resolve: () => {} }} onAnswer={() => {}} />,
    );
    expect(html).toContain("3 private details will be hidden");
    expect(html).toContain("email addresses, names");
    expect(html).toContain(">Send<");
    expect(html).toContain(">Edit<");
  });
});

describe("/privacy route", () => {
  test("renders the screen inside the shell, with Privacy protection current in the menu", () => {
    const client = new QueryClient();
    client.setQueryData([PRIVACY_QUERY_KEY, "preview"], { data: PRIVACY, preview: true });
    const html = render(<Routes>{deskRoutes(<span>chat screen</span>)}</Routes>, "/privacy", client);
    expect(html).toContain("rr-shell");
    expect(html).toContain('<h1 class="rr-shell__title">Privacy protection</h1>');
    expect(html).toContain('href="/privacy" aria-current="page"');
    expect(html).toContain("Privacy protection is off");
    expect(html).not.toContain("This part of Redrob Cowork is on its way.");
    expect(html).not.toContain("chat screen");
  });
});
