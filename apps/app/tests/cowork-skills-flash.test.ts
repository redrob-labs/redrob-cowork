import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import { PreviewPage } from "../src/react-app/cowork/preview/preview-note";
import { CATALOGUE_CACHE_MS, createConsoleCatalogue } from "../src/react-app/cowork/skills/console-catalogue";
import { SkillDetailSkeleton } from "../src/react-app/cowork/skills/cowork-skill";
import { marketplaceReady, seedSkillDetail } from "../src/react-app/cowork/skills/skills";
import type { CoworkSkill, SkillDetail } from "../src/react-app/cowork/services/types";

const catalogue = (name: string): SkillDetail => ({
  name,
  title: "US NDA",
  titleKo: "미국 비밀유지계약",
  summary: "Mutual or one-way NDA.",
  version: "1.0.0",
  description: "Use when drafting an NDA.",
  tags: {},
  body: "Steps",
  installed: null,
});
const mine = (name: string): CoworkSkill => ({ name, description: "Local description", origin: "library", tags: { language: "en" }, scope: "project" });

describe("round 10 skills flash fix", () => {
  test("the preview note paints only for a resolved preview result", () => {
    const html = (preview?: boolean) =>
      renderToStaticMarkup(React.createElement(PreviewPage, { note: "NOTE-TEXT", preview }, React.createElement("p", null, "body")));
    expect(html(undefined)).not.toContain("NOTE-TEXT");
    expect(html(false)).not.toContain("NOTE-TEXT");
    expect(html(true)).toContain("NOTE-TEXT");
  });

  test("the marketplace waits for installed data and a settled catalogue", () => {
    expect(marketplaceReady({ hasData: false }, { isPending: false })).toBe(false);
    expect(marketplaceReady({ hasData: true }, { isPending: true })).toBe(false);
    expect(marketplaceReady({ hasData: true }, { isPending: false })).toBe(true);
  });

  test("a skill page seeds from the catalogue and the installed cache", () => {
    expect(seedSkillDetail("us-lawyer-nda", null, null)).toBeNull();
    expect(seedSkillDetail("us-lawyer-nda", null, [])).toBeNull();
    const library = seedSkillDetail("us-lawyer-nda", catalogue("us-lawyer-nda"), []);
    expect(library?.installed).toBeNull();
    expect(library?.title).toBe("US NDA");
    const added = seedSkillDetail("us-lawyer-nda", catalogue("us-lawyer-nda"), [mine("us-lawyer-nda")]);
    expect(added?.installed).toEqual({ origin: "library", scope: "project" });
    expect(added?.description).toBe("Local description");
    expect(added?.title).toBe("US NDA");
    expect(added?.version).toBe("1.0.0");
    // Installed but not in the catalogue (the person's own skill) still seeds, so Use never flips to Add.
    expect(seedSkillDetail("my-skill", null, [mine("my-skill")])?.installed?.origin).toBe("library");
  });

  test("the detail skeleton is hero-shaped and the legacy empty copy is gone", () => {
    expect(renderToStaticMarkup(React.createElement(SkillDetailSkeleton))).toContain("cowork-skill-hero");
    for (const key of ["cowork.skills_empty_title", "cowork.skills_empty_text"]) {
      expect(key in en).toBe(false);
      expect(key in ko).toBe(false);
    }
    expect(en["cowork.skills_preview_note"]).toBe("Connect a project to add and use skills.");
  });

  test("the catalogue keeps a load for 30 minutes and warm() never throws", async () => {
    expect(CATALOGUE_CACHE_MS).toBe(30 * 60_000);
    let now = 0;
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ skills: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = createConsoleCatalogue({ fetchImpl, now: () => now });
    await store.warm();
    now = 29 * 60_000;
    await store.list();
    expect(calls).toBe(1);
    const failing = createConsoleCatalogue({ fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    await expect(failing.warm()).resolves.toBeUndefined();
  });
});
