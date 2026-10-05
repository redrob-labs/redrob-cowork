import { afterEach, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Menu } from "@redrob-labs/ui";

import { createDefaultPlatform, PlatformProvider } from "../src/react-app/kernel/platform";
import { CHATS } from "../src/react-app/desk/services/fixtures/chats";
import { at } from "../src/react-app/desk/services/fixtures/sample-day";
import {
  AccountLabel,
  SETTINGS_PATH,
  accountMenuItems,
  connectionLine,
  type AccountMenuActions,
} from "../src/react-app/desk/shell/account-menu";
import {
  DeskLayer,
  DeskLayerView,
  DeskToast,
  FeedbackDialogView,
  ShortcutsDialog,
  SUPPORT_EMAIL,
  canSendFeedback,
  deskOwnsNewChatShortcut,
  feedbackMailto,
  shortcutRows,
  submitFeedback,
} from "../src/react-app/desk/shell/desk-layer";
import { DeskShell } from "../src/react-app/desk/shell/desk-shell";
import { buildDeskNav } from "../src/react-app/desk/shell/nav";
import { createFrameStore, useFrameStore, type FrameModal } from "../src/react-app/desk/store/frame-store";
import type { DeskTimers } from "../src/react-app/desk/timers";

function withProviders(node: ReactNode, path = "/chat") {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PlatformProvider value={createDefaultPlatform()}>
        <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
      </PlatformProvider>
    </QueryClientProvider>,
  );
}

function actions(patch: Partial<AccountMenuActions> = {}): AccountMenuActions {
  return {
    version: "1.2.3",
    developerMode: false,
    onSettings: () => {},
    onShortcuts: () => {},
    onFeedback: () => {},
    onDeveloperMode: () => {},
    ...patch,
  };
}

/** Each `<button>` in the markup, opening tag and text. */
function buttons(html: string): Array<{ tag: string; text: string }> {
  return [...html.matchAll(/(<button[^>]*>)([\s\S]*?)<\/button>/g)].map((match) => ({
    tag: match[1],
    text: match[2].replace(/<[^>]+>/g, ""),
  }));
}

afterEach(() => {
  useFrameStore.getState().closeModal();
  useFrameStore.getState().hideToast();
});

describe("account menu", () => {
  test("offers Settings, Keyboard shortcuts, Send feedback, a separator, the version and developer mode, in that order", () => {
    const items = accountMenuItems(actions());
    expect(items.map((item) => (item.type === "separator" ? "---" : item.label))).toEqual([
      "Settings",
      "Keyboard shortcuts",
      "Send feedback",
      "---",
      "Redrob Cowork 1.2.3",
      "Turn on developer mode",
    ]);
    expect(items.find((item) => item.id === "version")?.disabled).toBe(true);
    expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(["version"]);
    expect(items.some((item) => /sign (out|in)/i.test(String(item.label)))).toBe(false);
  });

  test("the open menu renders the version disabled and no Sign out", () => {
    const html = renderToStaticMarkup(<Menu items={accountMenuItems(actions())} defaultOpen placement="up" />);
    const version = buttons(html).find((button) => button.text === "Redrob Cowork 1.2.3");
    expect(version?.tag).toContain('disabled=""');
    expect(html).toContain('role="separator"');
    expect(html).not.toContain("Sign out");
  });

  test("each item does what it says", () => {
    const calls: string[] = [];
    const items = accountMenuItems(
      actions({
        onSettings: () => calls.push("settings"),
        onShortcuts: () => calls.push("keys"),
        onFeedback: () => calls.push("feedback"),
        onDeveloperMode: (on) => calls.push(`developer:${on}`),
      }),
    );
    for (const item of items) item.onSelect?.(item);
    expect(calls).toEqual(["settings", "keys", "feedback", "developer:true"]);
    expect(SETTINGS_PATH).toBe("/settings/general");
  });

  test("developer mode says what pressing it does", () => {
    const calls: boolean[] = [];
    const items = accountMenuItems(actions({ developerMode: true, onDeveloperMode: (on) => calls.push(on) }));
    const item = items.find((entry) => entry.id === "developer-mode");
    expect(item?.label).toBe("Turn off developer mode");
    if (item) item.onSelect?.(item);
    expect(calls).toEqual([false]);
  });

  test("the version falls back to the product name when the build has none", () => {
    const items = accountMenuItems(actions({ version: "" }));
    expect(items.find((item) => item.id === "version")?.label).toBe("Redrob Cowork");
  });

  test("the trigger shows Redrob and whether the key is connected", () => {
    const connected = renderToStaticMarkup(<AccountLabel connected />);
    expect(connected).toContain("<b>Redrob</b>");
    expect(connected).toContain("Connected with your Redrob key");
    const disconnected = renderToStaticMarkup(<AccountLabel connected={false} />);
    expect(disconnected).toContain("Not connected");
    const loading = renderToStaticMarkup(<AccountLabel connected={null} />);
    expect(loading).not.toContain("Connected");
    expect(loading).not.toContain("Not connected");
    expect(connectionLine(null)).toBeNull();
  });

  test("Settings is in the account menu only, never in the Desk menu", () => {
    const nav = buildDeskNav({
      chats: CHATS,
      waiting: 0,
      connected: 0,
      privacy: "high",
      notes: 0,
      now: at(28, 12, 0),
      locale: "en",
    });
    expect(nav.some((item) => /settings/i.test(String(item.label ?? item.heading)))).toBe(false);
  });
});

describe("DeskShell", () => {
  test("puts the account menu at the foot of the sidebar, after the screen's own aside", () => {
    const html = withProviders(<DeskShell aside={<span>Screen aside</span>} />);
    const aside = html.slice(html.indexOf('class="rr-shell__aside"'));
    expect(aside.indexOf("Screen aside")).toBeGreaterThan(-1);
    expect(aside.indexOf('class="desk-account"')).toBeGreaterThan(aside.indexOf("Screen aside"));
    expect(aside).toContain('aria-haspopup="menu"');
    expect(aside).toContain('aria-label="Settings and help"');
    expect(aside).toContain("<b>Redrob</b>");
  });

  test("every screen has it, without an aside of its own too", () => {
    const html = withProviders(<DeskShell title="History" />);
    expect(html).toContain('class="rr-shell__aside"');
    expect(html).toContain('class="desk-account"');
  });
});

describe("keyboard shortcuts dialog", () => {
  test("lists the five shortcuts with Ctrl, and the Mac note", () => {
    expect(shortcutRows(false).map((row) => [row.label, row.keys.join(" ")])).toEqual([
      ["Send", "Enter"],
      ["New line", "Shift Enter"],
      ["Open or close the browser", "Ctrl Shift B"],
      ["New chat", "Ctrl N"],
      ["Close a dialog", "Esc"],
    ]);
    const html = renderToStaticMarkup(<ShortcutsDialog mac={false} onClose={() => {}} />);
    expect(html).toContain("Keyboard shortcuts");
    expect(html).toContain("<kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>B</kbd>");
    expect(html).not.toContain("<kbd>Cmd</kbd>");
    expect(html).toContain("On a Mac, Cmd takes the place of Ctrl.");
  });

  test("on a Mac shows Cmd in place of Ctrl", () => {
    expect(shortcutRows(true).find((row) => row.id === "new-chat")?.keys).toEqual(["Cmd", "N"]);
    const html = renderToStaticMarkup(<ShortcutsDialog mac onClose={() => {}} />);
    expect(html).toContain("<kbd>Cmd</kbd><kbd>Shift</kbd><kbd>B</kbd>");
    expect(html).toContain("<kbd>Cmd</kbd><kbd>N</kbd>");
    expect(html).not.toContain("<kbd>Ctrl</kbd>");
  });

  test("the layer renders the dialog that is open, and only one", () => {
    const layer = (modal: FrameModal) =>
      withProviders(
        <DeskLayerView modal={modal} toast={null} mac={false} onCloseModal={() => {}} onCloseToast={() => {}} />,
      );
    const keys = layer({ kind: "keys" });
    expect(keys.match(/role="dialog"/g)?.length).toBe(1);
    expect(keys).toContain("Open or close the browser");
    const feedback = layer({ kind: "feedback" });
    expect(feedback.match(/role="dialog"/g)?.length).toBe(1);
    expect(feedback).toContain("What works, and what gets in the way?");
    // The project dialog is another task's; this layer leaves it alone.
    expect(layer({ kind: "project", chatId: null })).not.toContain('role="dialog"');
    expect(layer(null)).toBe("");
    // Mounted with the closed store, the layer itself renders nothing.
    expect(withProviders(<DeskLayer />)).toBe("");
  });
});

describe("feedback dialog", () => {
  const sendButton = (text: string) =>
    buttons(
      renderToStaticMarkup(
        <FeedbackDialogView text={text} onTextChange={() => {}} onCancel={() => {}} onSend={() => {}} />,
      ),
    ).find((button) => button.text === "Send");

  test("has one labelled text box", () => {
    const html = renderToStaticMarkup(
      <FeedbackDialogView text="" onTextChange={() => {}} onCancel={() => {}} onSend={() => {}} />,
    );
    expect(html.match(/<textarea/g)?.length).toBe(1);
    expect(html).toMatch(/<label[^>]*for="desk-feedback-text"[^>]*>What works, and what gets in the way\?/);
    expect(html).toContain('id="desk-feedback-text"');
  });

  test("Send is disabled until something other than spaces is typed", () => {
    expect(sendButton("")?.tag).toContain('disabled=""');
    expect(sendButton("   \n ")?.tag).toContain('disabled=""');
    expect(sendButton("The menu is lovely")?.tag).not.toContain("disabled");
    expect(canSendFeedback(" x ")).toBe(true);
  });

  test("sending opens an email to support with the note, closes, and confirms with a toast", () => {
    const calls: string[] = [];
    let link = "";
    const sent = submitFeedback("  Please add dark mode  ", {
      openLink: (url) => {
        link = url;
        calls.push("open");
      },
      close: () => calls.push("close"),
      toast: (title, text) => calls.push(`toast:${title}|${text}`),
    });
    expect(sent).toBe(true);
    expect(calls).toEqual(["open", "close", "toast:Thanks for the note|Your email app has it ready to send."]);
    const url = new URL(link);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(SUPPORT_EMAIL);
    expect(url.searchParams.get("subject")).toBe("Redrob Cowork feedback");
    expect(url.searchParams.get("body")?.startsWith("Please add dark mode\n\n")).toBe(true);
  });

  test("a blank note sends nothing", () => {
    const calls: string[] = [];
    const deps = { openLink: () => calls.push("open"), close: () => calls.push("close"), toast: () => calls.push("toast") };
    expect(submitFeedback("  ", deps)).toBe(false);
    expect(calls).toEqual([]);
  });

  test("the confirmation lands in the frame's toast", () => {
    submitFeedback("Hello", { openLink: () => {}, close: () => {}, toast: useFrameStore.getState().showToast });
    expect(useFrameStore.getState().toast).toMatchObject({ title: "Thanks for the note" });
  });

  test("the mailto carries the version line", () => {
    const body = new URL(feedbackMailto("Hi", "9.9.9")).searchParams.get("body");
    expect(body).toBe("Hi\n\nRedrob Cowork 9.9.9");
  });
});

describe("toast", () => {
  const timers: DeskTimers = { setTimeout: () => 0, clearTimeout: () => {} };

  test("shows the title and the text in a status region with a close button", () => {
    const html = renderToStaticMarkup(
      <DeskToast toast={{ id: 1, title: "Project created", text: "Seorin is ready." }} onClose={() => {}} />,
    );
    expect(html).toContain('class="desk-toast"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Project created");
    expect(html).toContain("Seorin is ready.");
    expect(html).toContain('aria-label="Dismiss"');
    expect(renderToStaticMarkup(<DeskToast toast={null} onClose={() => {}} />)).toBe("");
  });

  test("a new toast replaces the old one", () => {
    const store = createFrameStore({ timers, storage: () => null });
    store.getState().showToast("First", "One");
    const first = store.getState().toast;
    store.getState().showToast("Second");
    const second = store.getState().toast;
    expect(second?.id).not.toBe(first?.id);
    const html = renderToStaticMarkup(<DeskToast toast={second} onClose={() => {}} />);
    expect(html).toContain("Second");
    expect(html).not.toContain("First");
    expect(html.match(/role="status"/g)?.length).toBe(1);
  });
});

describe("new chat shortcut", () => {
  test("the Desk answers Ctrl+N where the session page does not", () => {
    for (const path of ["/projects", "/history", "/memory/you", "/settings/general", "/"]) {
      expect(deskOwnsNewChatShortcut(path)).toBe(true);
    }
    for (const path of ["/chat", "/chat/abc", "/workspace/w1/session", "/workspace/w1/session/abc", "/welcome", "/extensions/x"]) {
      expect(deskOwnsNewChatShortcut(path)).toBe(false);
    }
  });
});
