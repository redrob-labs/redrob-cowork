import { describe, expect, test } from "bun:test";

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

describe("popular shelf and page order", () => {
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
});
