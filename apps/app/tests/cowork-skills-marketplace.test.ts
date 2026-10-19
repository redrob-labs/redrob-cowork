import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { createConsoleCatalogue } from "../src/react-app/cowork/skills/console-catalogue";
import { shouldEscapeToList } from "../src/react-app/cowork/skills/use-back-to-list";
import { shouldShowLibraryNotice } from "../src/react-app/cowork/skills/cowork-skills";
import { SkillTile } from "../src/react-app/cowork/skills/skill-tile";
import {
  SKILL_TONES,
  languageTagLabel,
  shelfEdges,
  skillBrief,
  skillDisplayTitle,
  skillRows,
  skillShelf,
  skillTone,
  type SkillRow,
} from "../src/react-app/cowork/skills/skills";
import type { CoworkSkill, LibrarySkill } from "../src/react-app/cowork/services/types";

const installed = (name: string, origin: CoworkSkill["origin"] = "mine"): CoworkSkill => ({
  name,
  description: `Use when ${name} is needed.`,
  origin,
  tags: {},
  scope: "project",
});
const row = (name: string, overrides: Partial<SkillRow> = {}): SkillRow => ({
  name,
  description: `Use when ${name} is needed.`,
  tags: {},
  origin: "library",
  installed: null,
  ...overrides,
});

describe("skills marketplace helpers", () => {
  test("assigns a stable, valid tone", () => {
    expect(skillTone("us-lawyer-nda")).toBe(skillTone("us-lawyer-nda"));
    for (const name of ["us-lawyer-nda", "kr-vc-term-sheet-review", "humanize-writing"]) expect(SKILL_TONES).toContain(skillTone(name));
  });

  test("groups prefix families, tags, installed rows, and everyday work", () => {
    expect(skillShelf(row("us-lawyer-nda"))).toBe("lawyer");
    expect(skillShelf(row("kr-accountant-vat-return"))).toBe("accountant");
    expect(skillShelf(row("kr-vc-term-sheet-review"))).toBe("vc");
    expect(skillShelf(row("humanize-writing"))).toBe("everyday");
    expect(skillShelf(row("installed", { installed: installed("installed") }))).toBe("yours");
    expect(skillShelf(row("custom", { tags: { profession: "lawyer" } }))).toBe("lawyer");
  });

  test("prefers localized titles and summaries with full first-sentence fallbacks", () => {
    const display = { name: "slug", title: "English", titleKo: "한국어", summary: "English summary", summaryKo: "한국어 요약", description: "Use when the user asks to review a long and detailed contract before signing it today." };
    expect(skillDisplayTitle(display, "ko")).toBe("한국어");
    expect(skillDisplayTitle({ name: "slug", title: "English" }, "ko")).toBe("English");
    expect(skillDisplayTitle({ name: "slug" }, "en")).toBe("slug");
    expect(skillBrief(display, "ko")).toBe("한국어 요약");
    expect(skillBrief(display, "en")).toBe("English summary");
    expect(skillBrief({ description: display.description }, "en")).toBe("Review a long and detailed contract before signing it today.");
    expect(skillBrief({ description: display.description }, "en")).not.toContain("…");
    expect(skillBrief({ description: "가".repeat(45) }, "ko")).toHaveLength(45);
    expect(skillBrief({ description: "Useful work." }, "en")).not.toBe("");
  });

  test("joins catalogue display fields into installed rows without replacing local values", () => {
    const local = { ...installed("shared", "library"), title: "Local title" };
    const library: LibrarySkill = { name: "shared", title: "Catalogue title", summary: "Short summary", description: "Catalogue description", tags: {} };
    const rows = skillRows({ installed: [local], library: [library] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Local title");
    expect(rows[0]?.summary).toBe("Short summary");
  });

  test("shows offline state after rows load, including empty and populated branches", () => {
    expect(shouldShowLibraryNotice(null, true)).toBe(false);
    expect(shouldShowLibraryNotice([], true)).toBe(true);
    expect(shouldShowLibraryNotice([row("installed")], true)).toBe(true);
    // With nothing at all to show, the notice stands in for the page.
    expect(shouldShowLibraryNotice([], false)).toBe(true);
    expect(shouldShowLibraryNotice([row("installed")], false)).toBe(false);
  });

  test("looks the language up directly instead of taking the last tag", () => {
    const taxonomy = {
      professions: [{ id: "lawyer", label: { en: "Lawyer", ko: "변호사" }, tasks: [{ id: "review", label: { en: "Review", ko: "검토" } }] }],
      languages: [{ id: "ko", label: { en: "Korean", ko: "한국어" } }],
    } as unknown as Parameters<typeof languageTagLabel>[1];
    expect(languageTagLabel({ profession: "lawyer", task: "review" }, taxonomy, "en")).toBeNull();
    expect(languageTagLabel({ profession: "lawyer", language: "ko" }, taxonomy, "en")).toBe("Korean");
    expect(languageTagLabel({ language: "ko" }, taxonomy, "ko")).toBe("한국어");
    expect(languageTagLabel({ language: "ko" }, null, "en")).toBeNull();
  });

  test("shows a shelf chevron only toward a side that can still scroll", () => {
    expect(shelfEdges(0, 600, 600)).toEqual({ canPrev: false, canNext: false });
    expect(shelfEdges(0, 1200, 600)).toEqual({ canPrev: false, canNext: true });
    expect(shelfEdges(300, 1200, 600)).toEqual({ canPrev: true, canNext: true });
    expect(shelfEdges(599, 1200, 600)).toEqual({ canPrev: true, canNext: false });
  });
});

describe("console catalogue marketplace fields", () => {
  test("maps localized frontmatter and version into list and detail", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("index.json")) return new Response(JSON.stringify({ skills: [{ name: "sample" }] }));
      return new Response("---\nname: sample\ndescription: Use when testing.\ntitle: Sample\ntitle_ko: 예시\nsummary: Test a sample.\nsummary_ko: 예시를 시험합니다.\nversion: 2.1.0\n---\n\n# Instructions");
    };
    const catalogue = createConsoleCatalogue({ fetchImpl, baseUrl: "https://example.test" });
    expect(catalogue.peek("sample")).toBeNull();
    expect(await catalogue.list()).toEqual([{ name: "sample", title: "Sample", titleKo: "예시", summary: "Test a sample.", summaryKo: "예시를 시험합니다.", description: "Use when testing.", tags: {} }]);
    expect(catalogue.peek("sample")).toMatchObject({ titleKo: "예시", summaryKo: "예시를 시험합니다.", version: "2.1.0" });
    expect(await catalogue.get("sample")).toMatchObject({ titleKo: "예시", summaryKo: "예시를 시험합니다.", version: "2.1.0", body: "# Instructions" });
  });

  test("rejects list but keeps detail nullable when the index is unavailable", async () => {
    const catalogue = createConsoleCatalogue({ fetchImpl: async () => new Response("", { status: 503 }), baseUrl: "https://example.test" });
    await expect(catalogue.list()).rejects.toThrow("not available");
    expect(await catalogue.get("missing")).toBeNull();
  });
});

describe("skill detail escape guard", () => {
  test("allows bare Escape and protects controls, modals, and handled events", () => {
    const idle = { modalOpen: false, scheduling: false };
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false }, idle)).toBe(true);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false, targetTag: "INPUT" }, idle)).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false, targetTag: "TEXTAREA" }, idle)).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false, contentEditable: true }, idle)).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: true }, idle)).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false }, { modalOpen: true, scheduling: false })).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false }, { modalOpen: false, scheduling: true })).toBe(false);
  });
});

describe("skill marketplace markup", () => {
  test("keeps the action outside the link and uses described-by without title attributes", () => {
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null,
        React.createElement(SkillTile, { row: row("sample", { title: "Sample", summary: "A concise sample." }), locale: "en", busy: null, canAdd: true, fromPath: "/skills", onAdd: () => {} }),
      ),
    );
    const link = html.match(/<a\b[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(link).toContain('aria-describedby="skill-brief-sample"');
    expect(link).not.toContain("<button");
    expect(html).toContain("<button");
    expect(html).not.toContain(" title=");
  });
});
