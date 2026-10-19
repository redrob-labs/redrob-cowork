import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import { createConsoleCatalogue } from "../src/react-app/cowork/skills/console-catalogue";
import { SkillView, shouldEscapeToList, type SkillViewProps } from "../src/react-app/cowork/skills/cowork-skill";
import { shouldShowLibraryNotice } from "../src/react-app/cowork/skills/cowork-skills";
import { SkillIcon } from "../src/react-app/cowork/skills/skill-icon";
import { SkillShelf, SkillTile } from "../src/react-app/cowork/skills/skill-tile";
import {
  SKILL_TONES,
  languageTagLabel,
  matchesFilters,
  shelfEdges,
  shelvesOf,
  shouldRestoreListFocus,
  skillBrief,
  skillDisplayTitle,
  skillPath,
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
  test("assigns stable, valid, reasonably distributed tones", () => {
    expect(skillTone("us-lawyer-nda")).toBe(skillTone("us-lawyer-nda"));
    const names = Array.from({ length: 96 }, (_, index) => `us-lawyer-skill-${index}`);
    const counts = new Map(SKILL_TONES.map((tone) => [tone, 0]));
    for (const name of names) {
      const tone = skillTone(name);
      expect(SKILL_TONES).toContain(tone);
      counts.set(tone, (counts.get(tone) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(24);
  });

  test("groups prefix families, tags, installed rows, and everyday work", () => {
    expect(skillShelf(row("us-lawyer-nda"))).toBe("lawyer");
    expect(skillShelf(row("kr-accountant-vat-return"))).toBe("accountant");
    expect(skillShelf(row("kr-vc-term-sheet-review"))).toBe("vc");
    expect(skillShelf(row("humanize-writing"))).toBe("everyday");
    expect(skillShelf(row("installed", { installed: installed("installed") }))).toBe("yours");
    expect(skillShelf(row("custom", { tags: { profession: "lawyer" } }))).toBe("lawyer");
  });

  test("keeps shelf order, installed order, and localized title sorting", () => {
    const shelves = shelvesOf([
      row("z", { title: "Zulu", titleKo: "가" }),
      row("a", { title: "Alpha", titleKo: "나" }),
      row("mine", { installed: installed("mine", "mine"), origin: "mine" }),
      row("team", { installed: installed("team", "team"), origin: "team" }),
      row("us-lawyer-b", { title: "Beta" }),
      row("us-lawyer-a", { title: "Alpha" }),
    ], "en");
    expect(shelves.map((shelf) => shelf.id)).toEqual(["yours", "lawyer", "everyday"]);
    expect(shelves[0]?.rows.map((item) => item.name)).toEqual(["mine", "team"]);
    expect(shelves[1]?.rows.map((item) => item.name)).toEqual(["us-lawyer-a", "us-lawyer-b"]);
    expect(shelves[2]?.rows.map((item) => item.name)).toEqual(["a", "z"]);
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
    const rows = skillRows({ installed: [local], library: [library], filters: {}, installedOnly: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Local title");
    expect(rows[0]?.summary).toBe("Short summary");
  });

  test("restores focus only once per history entry and builds safe detail paths", () => {
    expect(shouldRestoreListFocus("entry-2", "entry-1")).toBe(true);
    expect(shouldRestoreListFocus("entry-2", "entry-2")).toBe(false);
    expect(skillPath("kr lawyer/nda")).toBe("/skill/kr%20lawyer%2Fnda");
  });

  test("shows offline state after rows load, including empty and populated branches", () => {
    expect(shouldShowLibraryNotice(null, true)).toBe(false);
    expect(shouldShowLibraryNotice([], true)).toBe(true);
    expect(shouldShowLibraryNotice([row("installed")], true)).toBe(true);
    expect(shouldShowLibraryNotice([], false)).toBe(false);
  });

  test("searches visible English and Korean titles and summaries", () => {
    const visible = row("opaque-slug", { title: "Contract review", titleKo: "계약 검토", summary: "Check signature terms", summaryKo: "서명 조건을 확인합니다" });
    expect(matchesFilters(visible, { q: "contract" })).toBe(true);
    expect(matchesFilters(visible, { q: "조건" })).toBe(true);
    expect(matchesFilters(visible, { q: "missing" })).toBe(false);
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

  test("shelf control labels read naturally in both locales", () => {
    expect(en["cowork.skills_scroll_left"]).toBe("{shelf}: scroll left");
    expect(en["cowork.skills_scroll_right"]).toBe("{shelf}: scroll right");
    expect(ko["cowork.skills_scroll_left"]).toBe("{shelf} 왼쪽으로 넘기기");
    expect(ko["cowork.skills_scroll_right"]).toBe("{shelf} 오른쪽으로 넘기기");
  });

  test("drops the See all and search copy from both locales together", () => {
    for (const key of ["cowork.skills_see_all", "cowork.skills_see_all_label", "cowork.skills_search", "cowork.skills_results"]) {
      expect(key in en).toBe(false);
      expect(key in ko).toBe(false);
    }
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
  const longDescription = "Use when the user asks to review a contract. ".repeat(12).trim();
  const view = (installedSkill: CoworkSkill | null) => renderToStaticMarkup(
    React.createElement(MemoryRouter, null,
      React.createElement(SkillView, {
        skill: { name: "sample", description: longDescription, tags: {}, body: "# Secret instructions", installed: installedSkill } as unknown as SkillViewProps["skill"],
        taxonomy: null, locale: "en", extra: "", canRun: true, busy: false, backPath: "/skills",
        onBack: () => {}, onExtra: () => {}, onRun: () => {}, onAdd: () => {},
      } as SkillViewProps),
    ),
  );

  test("detail page shows the full description with no More toggle and no instructions accordion", () => {
    const html = view(null);
    expect(html).toContain(`<p class="cowork-skill-about__text">${longDescription}</p>`);
    expect(html).not.toContain("data-expanded");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("Secret instructions");
    expect(html).not.toContain(" title=");
  });
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

  test("renders the full short description under the title with no tooltip and no title attributes", () => {
    const summary = "A longer short description that used to be clamped after two lines in the tile.";
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null,
        React.createElement(SkillTile, { row: row("long", { title: "A very long skill title that clamps", summary }), locale: "en", busy: null, canAdd: true, fromPath: "/skills", onAdd: () => {} }),
      ),
    );
    expect(html).toContain("A very long skill title that clamps");
    expect(html).toContain(`<span id="skill-brief-long" class="cowork-skill-tile__brief">${summary}</span>`);
    expect(html).not.toContain("tooltip");
    expect(html).not.toContain(" title=");
  });

  test("renders shelf chevrons as labelled plain buttons with no hover text", () => {
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null,
        React.createElement(SkillShelf, { id: "lawyer", rows: [row("us-lawyer-a", { title: "A" }), row("us-lawyer-b", { title: "B" })], locale: "en", busy: null, canAdd: true, fromPath: "/skills", onAdd: () => {} }),
      ),
    );
    expect(html).toContain('class="cowork-skills__chevron cowork-skills__chevron--prev"');
    expect(html).toContain('class="cowork-skills__chevron cowork-skills__chevron--next"');
    expect(html).toContain(`aria-label="${en["cowork.skills_scroll_left"].replace("{shelf}", en["cowork.skills_shelf_lawyer"])}"`);
    expect(html).toContain(`aria-label="${en["cowork.skills_scroll_right"].replace("{shelf}", en["cowork.skills_shelf_lawyer"])}"`);
    expect(html).not.toContain(" title=");
    expect(html).not.toContain("see-all");
    expect(html).not.toContain("See all");
  });

  test("reserves an image slot while retaining a tone fallback", () => {
    const withImage = renderToStaticMarkup(React.createElement(SkillIcon, { name: "sample", size: "tile", src: "/sample.png" }));
    const withoutImage = renderToStaticMarkup(React.createElement(SkillIcon, { name: "sample", size: "tile" }));
    expect(withImage).toContain('<img src="/sample.png" alt=""');
    expect(withoutImage).toContain("data-tone=");
    expect(withoutImage).not.toContain("<img");
  });
});
