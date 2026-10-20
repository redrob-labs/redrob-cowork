import { describe, expect, test } from "bun:test";

import { recentChatIdFromHref } from "./recent-chat-actions";

describe("recentChatIdFromHref", () => {
  test("reads the chat id from a Recent link", () => {
    expect(recentChatIdFromHref("#/chat/ses_abc123")).toBe("ses_abc123");
    expect(recentChatIdFromHref("/app/chat/ses%2Fodd")).toBe("ses/odd");
  });
  test("any other menu link is not a chat", () => {
    expect(recentChatIdFromHref("#/chat")).toBeNull();
    expect(recentChatIdFromHref("#/projects")).toBeNull();
    expect(recentChatIdFromHref("#/history")).toBeNull();
    expect(recentChatIdFromHref(null)).toBeNull();
  });
});
