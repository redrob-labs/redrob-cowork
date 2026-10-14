import { describe, expect, test } from "bun:test";

import type { Chat } from "../services/types";
import { searchResults } from "./search-dialog";

const chat = (id: string, title: string, updatedAt: number): Chat => ({
  id,
  title,
  projectId: null,
  updatedAt,
  mode: "plan",
  memory: "project",
});

describe("Desk search", () => {
  test("an empty query lists the places first, then chats newest first", () => {
    const results = searchResults("", [chat("a", "Older", 1), chat("b", "Newer", 2)]);
    expect(results[0].path).toBe("/chat");
    const chats = results.filter((result) => result.id.startsWith("chat-"));
    expect(chats.map((result) => result.label)).toEqual(["Newer", "Older"]);
  });

  test("a query matches chat titles and places by name, ignoring case", () => {
    const results = searchResults("budget", [chat("a", "Q3 Budget review", 1), chat("b", "Hiring plan", 2)]);
    expect(results.map((result) => result.path)).toEqual(["/chat/a"]);
    // Matched on the label in the current locale, so the test does not depend on which one is active.
    const projects = searchResults("", []).find((result) => result.path === "/projects");
    expect(projects).toBeDefined();
    const query = projects ? projects.label.slice(0, 4).toUpperCase() : "";
    expect(searchResults(query, []).map((result) => result.path)).toContain("/projects");
  });

  test("results stop at eight", () => {
    const many = Array.from({ length: 20 }, (_, i) => chat(String(i), `Chat ${i}`, i));
    expect(searchResults("chat", many)).toHaveLength(8);
  });
});
