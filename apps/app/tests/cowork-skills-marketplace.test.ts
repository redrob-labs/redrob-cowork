import { describe, expect, test } from "bun:test";

import { createConsoleCatalogue, CATALOGUE_CACHE_MS } from "../src/react-app/cowork/skills/console-catalogue";
import { shouldEscapeToList } from "../src/react-app/cowork/skills/use-back-to-list";
import { shouldShowLibraryNotice } from "../src/react-app/cowork/skills/cowork-skills";
import {
  languageTagLabel,
  skillBrief,
  skillDisplayTitle,
  skillRows,
  skillShelf,
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
  test("groups prefix families, tags, installed rows, and everyday work", () => {
    expect(skillShelf(row("us-lawyer-nda"))).toBe("lawyer");
    expect(skillShelf(row("kr-accountant-vat-return"))).toBe("accountant");
    expect(skillShelf(row("kr-vc-term-sheet-review"))).toBe("vc");
    expect(skillShelf(row("humanize-writing"))).toBe("everyday");
    expect(skillShelf(row("installed", { installed: installed("installed") }))).toBe("yours");
    expect(skillShelf(row("custom", { tags: { profession: "lawyer" } }))).toBe("lawyer");
  });

  test("display fields: localized title and brief, local values win, language looked up by id", () => {
    const display = { name: "slug", title: "English", titleKo: "한국어", summary: "English summary", summaryKo: "한국어 요약", description: "Use when the user asks to review a long and detailed contract before signing it today." };
    const cases: Array<[string, string]> = [
      [skillDisplayTitle(display, "ko"), "한국어"],
      [skillDisplayTitle({ name: "slug", title: "English" }, "ko"), "English"],
      [skillDisplayTitle({ name: "slug" }, "en"), "slug"],
      [skillBrief(display, "ko"), "한국어 요약"],
      [skillBrief(display, "en"), "English summary"],
      // No summary: the description's first sentence, whole, without the "Use when" lead.
      [skillBrief({ description: display.description }, "en"), "Review a long and detailed contract before signing it today."],
      [skillBrief({ description: "가".repeat(45) }, "ko"), "가".repeat(45)],
    ];
    for (const [actual, expected] of cases) expect(actual).toBe(expected);
    expect(skillBrief({ description: "Useful work." }, "en")).not.toBe("");

    const library: LibrarySkill = { name: "shared", title: "Catalogue title", summary: "Short summary", description: "Catalogue description", tags: {} };
    const rows = skillRows({ installed: [{ ...installed("shared", "library"), title: "Local title" }], library: [library] });
    expect(rows.map(({ title, summary }) => ({ title, summary }))).toEqual([{ title: "Local title", summary: "Short summary" }]);

    const taxonomy = {
      professions: [{ id: "lawyer", label: { en: "Lawyer", ko: "변호사" }, tasks: [{ id: "review", label: { en: "Review", ko: "검토" } }] }],
      languages: [{ id: "ko", label: { en: "Korean", ko: "한국어" } }],
    } as unknown as Parameters<typeof languageTagLabel>[1];
    expect(languageTagLabel({ profession: "lawyer", task: "review" }, taxonomy, "en")).toBeNull();
    expect(languageTagLabel({ profession: "lawyer", language: "ko" }, taxonomy, "en")).toBe("Korean");
    expect(languageTagLabel({ language: "ko" }, taxonomy, "ko")).toBe("한국어");
    expect(languageTagLabel({ language: "ko" }, null, "en")).toBeNull();
  });

  test("shows offline state after rows load, including empty and populated branches", () => {
    expect(shouldShowLibraryNotice(null, true)).toBe(false);
    expect(shouldShowLibraryNotice([], true)).toBe(true);
    expect(shouldShowLibraryNotice([row("installed")], true)).toBe(true);
    // With nothing at all to show, the notice stands in for the page.
    expect(shouldShowLibraryNotice([], false)).toBe(true);
    expect(shouldShowLibraryNotice([row("installed")], false)).toBe(false);
  });
});

describe("console catalogue", () => {
  test("maps fields, publishes only complete loads, keeps the last good one, and caches", async () => {
    let now = 0;
    let calls = 0;
    let failMember = false;
    const fetchImpl: typeof fetch = async (input) => {
      calls += 1;
      const url = String(input);
      if (url.endsWith("index.json")) return new Response(JSON.stringify({ skills: [{ name: "sample" }, { name: "other" }, { name: "sample" }] }));
      if (url.includes("/other/")) return failMember ? new Response("", { status: 503 }) : new Response("---\nname: other\ndescription: Use when other.\n---\nBody");
      return new Response("---\nname: sample\ndescription: Use when testing.\ntitle: Sample\ntitle_ko: 예시\nsummary: Test a sample.\nsummary_ko: 예시를 시험합니다.\nversion: 2.1.0\n---\n\n# Instructions");
    };
    const catalogue = createConsoleCatalogue({ fetchImpl, baseUrl: "https://example.test", now: () => now, failureTtlMs: 1_000 });

    // A member failing on the first load means no catalogue, not a partial one.
    failMember = true;
    await expect(catalogue.list()).rejects.toThrow("not available");
    expect(await catalogue.get("sample")).toBeNull();
    await expect(catalogue.warm()).resolves.toBeUndefined();

    // After the failure TTL a complete load publishes; duplicate index names collapse.
    failMember = false;
    now = 1_000;
    expect(catalogue.peek("sample")).toBeNull();
    expect(await catalogue.list()).toEqual([
      { name: "sample", title: "Sample", titleKo: "예시", summary: "Test a sample.", summaryKo: "예시를 시험합니다.", description: "Use when testing.", tags: {} },
      { name: "other", description: "Use when other.", tags: {} },
    ]);
    expect(catalogue.peek("sample")).toMatchObject({ titleKo: "예시", version: "2.1.0" });
    expect(await catalogue.get("sample")).toMatchObject({ summaryKo: "예시를 시험합니다.", body: "# Instructions" });

    // Served from memory until the 30-minute TTL; a failed refresh then keeps the last complete list.
    const loaded = calls;
    now += CATALOGUE_CACHE_MS - 1;
    await catalogue.list();
    expect(calls).toBe(loaded);
    failMember = true;
    now += 1;
    expect((await catalogue.list()).map((skill) => skill.name)).toEqual(["sample", "other"]);
    expect(calls).toBeGreaterThan(loaded);
  });
});

describe("skill detail escape guard", () => {
  test("allows bare Escape and protects controls, modals, page work, and handled events", () => {
    const idle = { modalOpen: false, blocked: false };
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false }, idle)).toBe(true);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false, targetTag: "INPUT" }, idle)).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false, targetTag: "TEXTAREA" }, idle)).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false, contentEditable: true }, idle)).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: true }, idle)).toBe(false);
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false }, { modalOpen: true, blocked: false })).toBe(false);
    // A schedule dialog or a running Add / Add all keeps the person on the page.
    expect(shouldEscapeToList({ key: "Escape", defaultPrevented: false }, { modalOpen: false, blocked: true })).toBe(false);
  });
});
