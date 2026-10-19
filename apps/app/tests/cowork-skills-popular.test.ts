import { describe, expect, test } from "bun:test";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import { POPULAR_SKILLS } from "../src/react-app/cowork/skills/popular-skills";
import type { SkillRow } from "../src/react-app/cowork/skills/skills";
import { marketplaceSections, popularRows } from "../src/react-app/cowork/skills/use-marketplace";
import { WORKFLOW_IDS } from "../src/react-app/cowork/skills/workflows";

const row = (name: string, installed = false): SkillRow => ({
  name,
  description: `Use when ${name} is needed.`,
  tags: {},
  origin: installed ? "mine" : "library",
  installed: installed ? { name, description: "", origin: "mine", tags: {}, scope: "project" } : null,
});

describe("round 10 popular shelf and page order", () => {
  test("the placeholder lists hold 12 unique catalogue-style names per language", () => {
    for (const list of [POPULAR_SKILLS.en, POPULAR_SKILLS.ko]) {
      expect(list).toHaveLength(12);
      expect(new Set(list).size).toBe(12);
      for (const name of list) expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  test("Popular keeps curated order per language and skips names the catalogue lacks", () => {
    const rows = [...POPULAR_SKILLS.en, ...POPULAR_SKILLS.ko].map((name) => row(name)).reverse();
    expect(popularRows(rows, "en").map((entry) => entry.name)).toEqual([...POPULAR_SKILLS.en]);
    expect(popularRows(rows, "ko-KR").map((entry) => entry.name)).toEqual([...POPULAR_SKILLS.ko]);
    expect(popularRows(rows.filter((entry) => entry.name !== "pdf"), "en").map((entry) => entry.name)).not.toContain("pdf");
  });

  test("sections are Your skills, workflows, Popular; no profession shelves", () => {
    const rows = [row("my-own", true), row("us-lawyer-nda"), row("kr-lawyer-nda"), row("documents-docx"), row("pdf")];
    const sections = marketplaceSections(rows, "en");
    expect(Object.keys(sections)).toEqual(["yours", "workflows", "popular"]);
    expect(sections.yours.map((entry) => entry.name)).toEqual(["my-own"]);
    expect(sections.workflows.map((workflow) => workflow.id)).toEqual(["legal-drafting", "office"]);
    expect(WORKFLOW_IDS).toContain("legal-drafting");
    expect(sections.popular.map((entry) => entry.name)).toEqual(["us-lawyer-nda", "documents-docx", "pdf"]);
  });

  test("shelf titles and the no-project note read as agreed", () => {
    expect(en["cowork.skills_section_popular"]).toBe("Popular");
    expect((ko as Record<string, string>)["cowork.skills_section_popular"]).toBe("인기 스킬");
    expect(en["cowork.skills_preview_note"]).toBe("Connect a project to add and use skills.");
  });
});
