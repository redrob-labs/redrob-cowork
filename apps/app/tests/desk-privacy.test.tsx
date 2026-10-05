import { afterEach, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes } from "react-router";

import { setLocale, type Language } from "../src/i18n";
import {
  LOCAL_MODEL_DOWNLOAD_GB,
  PRIVACY_QUERY_KEY,
  PrivacyView,
  localModelRow,
  privacyLevelMeta,
  setLocalModel,
} from "../src/react-app/desk/privacy/desk-privacy";
import { createFixtureDeskServices } from "../src/react-app/desk/services/fixture-services";
import { PRIVACY } from "../src/react-app/desk/services/fixtures/privacy";
import type { PrivacyState } from "../src/react-app/desk/services/types";
import { deskRoutes } from "../src/react-app/desk/shell/desk-routes";

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
  return render(<PrivacyView state={state} desktop={desktop} preview={preview} busy={false} onLocalModel={() => {}} />);
}

afterEach(() => setLocale("en"));

describe("localModelRow", () => {
  test("off on the desktop offers Turn on, with the one-time download size", () => {
    const row = localModelRow({ localModel: false }, true);
    expect(row.action).toBe("turn-on");
    expect(row.title).toBe("Off");
    expect(row.description).toContain(`about ${LOCAL_MODEL_DOWNLOAD_GB} GB`);
    expect(row.disabledReason).toBeNull();
  });

  test("on offers Turn off", () => {
    const row = localModelRow({ localModel: true }, true);
    expect(row.action).toBe("turn-off");
    expect(row.title).toBe("On: an AI runs on this laptop");
    expect(row.disabledReason).toBeNull();
  });

  test("on the web there is nothing to press, and it says why", () => {
    const row = localModelRow({ localModel: false }, false);
    expect(row.action).toBeNull();
    expect(row.disabledReason).toBe("It runs on this laptop, so you can turn it on only in the desktop app.");
  });

  test("privacyLevelMeta names the level", () => {
    expect(privacyLevelMeta("high")).toBe("High");
    expect(privacyLevelMeta("standard")).toBe("Standard");
    expect(privacyLevelMeta("off")).toBe("Off");
  });
});

describe("setLocalModel", () => {
  test("Turn on only changes the sample state and toasts; nothing is downloaded", async () => {
    const fixture = createFixtureDeskServices();
    const calls: boolean[] = [];
    const toasts: Array<[string, string | undefined]> = [];
    const originalFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = Object.assign(
      () => {
        fetched += 1;
        return Promise.reject(new Error("no network in this test"));
      },
      { preconnect: originalFetch.preconnect },
    );
    try {
      const result = await setLocalModel(
        {
          privacy: {
            setLocalModel: (on) => {
              calls.push(on);
              return fixture.privacy.setLocalModel(on);
            },
          },
          showToast: (title, text) => toasts.push([title, text]),
        },
        true,
      );
      expect(calls).toEqual([true]);
      expect(fetched).toBe(0);
      expect(result.preview).toBe(true);
      expect(result.data.localModel).toBe(true);
      expect((await fixture.privacy.get()).data.localModel).toBe(true);
      expect(toasts).toEqual([
        ["Ready on this laptop", "Mark any chat Private to use it. This is a preview, so nothing was downloaded."],
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Turn off changes the state without a toast", async () => {
    const fixture = createFixtureDeskServices();
    await fixture.privacy.setLocalModel(true);
    const toasts: string[] = [];
    const result = await setLocalModel({ privacy: fixture.privacy, showToast: (title) => toasts.push(title) }, false);
    expect(result.data.localModel).toBe(false);
    expect(toasts).toEqual([]);
  });
});

describe("PrivacyView", () => {
  test("off: the preview note, the status, the levels and Turn on with the download size", () => {
    const html = view(PRIVACY);
    expect(html).toContain("Preview");
    expect(html).toContain("Nothing on this screen is running yet.");
    expect(html).toContain("Privacy protection is on: High");
    expect(html).toContain("Private details kept from AI this week: 214");
    expect(html).toContain("Keep private work on this laptop");
    expect(html).toContain("about 9 GB");
    expect(html).toContain("Turn on");
    expect(html).not.toContain("Turn off");
    expect(html).toContain("Your level");
    expect(html).toContain("In this preview the level is fixed.");
    expect(html).not.toContain("Park Hyunjin");
  });

  test("sample data reads Off, with no level, no count and nothing to turn on", () => {
    const html = view(PRIVACY, true, true);
    expect(html).toContain("Nothing on this screen is running yet.");
    expect(html).toContain("Privacy protection is off");
    expect(html).not.toContain("Privacy protection is on");
    expect(html).not.toContain("214");
    expect(html).not.toContain("Your level");
    expect(html).not.toContain("Keep private work on this laptop");
    expect(html).not.toContain("Turn on");
  });

  test("on: Turn off, not Turn on", () => {
    const html = view({ ...PRIVACY, localModel: true });
    expect(html).toContain("On: an AI runs on this laptop");
    expect(html).toContain("Turn off");
    expect(html).not.toContain("Turn on");
  });

  test("on the web: privacy is off here and Turn on is disabled with the reason", () => {
    const html = view(PRIVACY, false);
    expect(html).toContain("Privacy protection is off here");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Turn on/);
    expect(html).toContain("you can turn it on only in the desktop app");
  });

  test("uses the product words, in English and in Korean", () => {
    const locales: Language[] = ["en", "ko"];
    for (const locale of locales) {
      setLocale(locale);
      for (const html of [view(PRIVACY), view({ ...PRIVACY, localModel: true }), view(PRIVACY, false)]) {
        const text = readable(html);
        for (const banned of [/AI Firewall/i, /Ollama/i, /local LLM/i, /API key/i]) expect(text).not.toMatch(banned);
      }
    }
  });

  test("Korean has the screen's words in Korean", () => {
    setLocale("ko");
    const html = view(PRIVACY);
    expect(html).toContain("비공개 작업을 이 노트북에 두기");
    expect(html).toContain("약 9기가바이트");
    expect(html).toContain("미리 보기");
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
    expect(html).not.toContain("Keep private work on this laptop");
    expect(html).not.toContain("This part of Redrob Cowork is on its way.");
    expect(html).not.toContain("chat screen");
  });
});
