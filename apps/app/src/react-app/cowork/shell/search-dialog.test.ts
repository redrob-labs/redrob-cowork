import { describe, expect, test } from "bun:test";

import type { Chat, CoworkFile, Project, CoworkSkill, Schedule } from "../services/types";
import type { SkillRow } from "../skills/skills";
import { WORKFLOW_IDS, availableWorkflows, workflowPath, workflowTitle } from "../skills/workflows";
import { CATALOGUE_2026_10_19 } from "../../../../tests/helpers/console-catalogue-names";
import { searchResults, searchResultsForTab, type SearchData } from "./search-dialog";

const chat = (id: string, title: string, updatedAt: number): Chat => ({
  id,
  title,
  projectId: null,
  updatedAt,
  mode: "plan",
  memory: "project",
});

describe("Cowork search", () => {
  test("All lists places then chats newest first, matches by name ignoring case, and stops at eight", () => {
    const empty = searchResults("", [chat("a", "Older", 1), chat("b", "Newer", 2)]);
    expect(empty[0]?.path).toBe("/chat");
    expect(empty.filter((result) => result.id.startsWith("chat-")).map((result) => result.label)).toEqual(["Newer", "Older"]);
    expect(searchResults("budget", [chat("a", "Q3 Budget review", 1), chat("b", "Hiring plan", 2)]).map((result) => result.path)).toEqual(["/chat/a"]);
    // A place matches on its label in the current locale.
    const projects = empty.find((result) => result.path === "/projects");
    expect(searchResults(projects?.label.slice(0, 4).toUpperCase() ?? "", []).map((result) => result.path)).toContain("/projects");
    const many = Array.from({ length: 20 }, (_, i) => chat(String(i), `Chat ${i}`, i));
    expect(searchResults("chat", many)).toHaveLength(8);
  });

  test("each tab lists only its own type, filtered by the query", () => {
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
    const cases: Array<[Parameters<typeof searchResultsForTab>[0], string, string[]]> = [
      ["chats", "", ["/chat/b", "/chat/a"]],
      ["projects", "", ["/projects", "/projects"]],
      ["projects", "seorin", ["/projects"]],
      ["skills", "", ["/skill/nda-review", "/skill/close-books"]],
      ["skills", "nda", ["/skill/nda-review"]],
      ["scheduled", "weekly", ["/scheduled"]],
      ["artifacts", "exhibit", ["/history"]],
    ];
    for (const [tab, query, paths] of cases) expect(searchResultsForTab(tab, query, data).map((r) => r.path)).toEqual(paths);
    expect(searchResultsForTab("all", "", data).some((r) => r.id === "chat-b")).toBe(true);
    // An empty type returns an empty list; the dialog shows its empty line.
    expect(searchResultsForTab("skills", "", { chats: [], projects: [], skills: [], schedules: [], artifacts: [] })).toEqual([]);
  });

  test("every catalogue skill and workflow is searchable and opens its page", () => {
    const lib = (name: string): SkillRow => ({ name, description: "", tags: {}, origin: "library", installed: null });
    const catalogue = CATALOGUE_2026_10_19.map((name) => name === "kr-lawyer-nda" ? { ...lib(name), titleKo: "비밀유지계약서" } : lib(name));
    const full: SearchData = { chats: [], projects: [], skills: [], schedules: [], artifacts: [], catalogue, workflows: availableWorkflows(catalogue) };
    for (const name of CATALOGUE_2026_10_19) {
      expect(searchResultsForTab("skills", name, full).some((r) => r.path === `/skill/${name}`)).toBe(true);
      expect(searchResultsForTab("all", name, full).some((r) => r.path === `/skill/${name}`)).toBe(true);
    }
    for (const id of WORKFLOW_IDS) expect(searchResultsForTab("all", workflowTitle(id), full).map((r) => r.path)).toContain(workflowPath(id));
    expect(searchResultsForTab("skills", "비밀유지", full).map((r) => r.path)).toContain("/skill/kr-lawyer-nda");
    // An empty All query lists only places and chats.
    expect(searchResultsForTab("all", "", full).some((r) => r.id.startsWith("skill-"))).toBe(false);
  });
});
