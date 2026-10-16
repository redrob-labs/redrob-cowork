import { describe, expect, test } from "bun:test";

import type { Chat, CoworkFile, Project, CoworkSkill, Schedule } from "../services/types";
import { SEARCH_TABS, searchResults, searchResultsForTab, searchTabLabel, type SearchData } from "./search-dialog";

const chat = (id: string, title: string, updatedAt: number): Chat => ({
  id,
  title,
  projectId: null,
  updatedAt,
  mode: "plan",
  memory: "project",
});

describe("Cowork search", () => {
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

describe("Cowork search tabs", () => {
  const project = (id: string, name: string): Project => ({ id, name, about: null, fileCount: null, chatCount: null, active: null, people: [] });
  const skill = (name: string, title: string): CoworkSkill => ({ name, title, description: "", origin: "mine", tags: {}, scope: "project" });
  const schedule = (id: string, name: string): Schedule => ({ id, target: { kind: "prompt", text: name }, name, projectId: "p", cadence: "daily", nextRunAt: null, lastRun: null, enabled: true });
  const file = (id: string, name: string): CoworkFile => ({ id, name, icon: "file", projectName: "Seorin", when: 0, fromChat: null, kind: "file" });

  const data: SearchData = {
    chats: [chat("a", "Budget review", 1), chat("b", "Hiring plan", 2)],
    projects: [project("p1", "Seorin MSA"), project("p2", "Hanbit")],
    skills: [skill("nda-review", "NDA review"), skill("close-books", "Close the books")],
    schedules: [schedule("s1", "Weekly digest"), schedule("s2", "Renewal sweep")],
    artifacts: [file("f1", "Review note.md"), file("f2", "Exhibit index.xlsx")],
  };

  test("the tab order is All / Chats / Artifacts / Skills / Projects / Scheduled", () => {
    expect([...SEARCH_TABS]).toEqual(["all", "chats", "artifacts", "skills", "projects", "scheduled"]);
    expect(searchTabLabel("all")).toBe("All");
    expect(searchTabLabel("scheduled")).toBe("Scheduled");
  });

  test("All lists places + chats, like the flat search", () => {
    const all = searchResultsForTab("all", "", data);
    expect(all[0].path).toBe("/chat");
    expect(all.some((r) => r.id === "chat-b")).toBe(true);
  });

  test("each type tab lists only that type", () => {
    expect(searchResultsForTab("chats", "", data).every((r) => r.id.startsWith("chat-"))).toBe(true);
    expect(searchResultsForTab("projects", "", data).map((r) => r.label)).toEqual(["Seorin MSA", "Hanbit"]);
    expect(searchResultsForTab("skills", "", data).map((r) => r.label)).toEqual(["NDA review", "Close the books"]);
    expect(searchResultsForTab("scheduled", "", data).map((r) => r.label)).toEqual(["Weekly digest", "Renewal sweep"]);
    expect(searchResultsForTab("artifacts", "", data).map((r) => r.label)).toEqual(["Review note.md", "Exhibit index.xlsx"]);
    // No places leak into a scoped tab.
    expect(searchResultsForTab("projects", "", data).some((r) => r.path === "/chat")).toBe(false);
  });

  test("a query filters within the active tab, case-insensitively", () => {
    expect(searchResultsForTab("projects", "seorin", data).map((r) => r.label)).toEqual(["Seorin MSA"]);
    expect(searchResultsForTab("skills", "nda", data).map((r) => r.label)).toEqual(["NDA review"]);
  });

  test("an empty type still returns a list (the dialog shows its empty line)", () => {
    const empty: SearchData = { chats: [], projects: [], skills: [], schedules: [], artifacts: [] };
    expect(searchResultsForTab("skills", "", empty)).toEqual([]);
    expect(searchResultsForTab("artifacts", "anything", empty)).toEqual([]);
  });
});
