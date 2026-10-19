/*
 * POPULAR SKILLS - CURATED PLACEHOLDER LIST. REPLACE WITH REAL DATA.
 *
 * The "Popular" / "인기 스킬" shelf on the Skills page shows these catalogue skill names, in this
 * order. There is no usage data yet (the public catalogue at console.redrob.ai/skills/index.json has
 * no counts, and there is no backend for it), so this is a hand-picked stand-in. Editing these
 * arrays is the only change needed to replace it with the real list.
 *
 * Rules the shelf applies at runtime:
 * - one list per UI language (`en` for English, `ko` for Korean); any other language uses `en`;
 * - a name the live catalogue does not have is skipped, so a stale entry never breaks the page;
 * - skills the person already added stay in the shelf (their button reads Use).
 *
 * Names are stable catalogue skill names (the `name` in index.json), not display titles.
 */
export const POPULAR_SKILLS: { readonly en: readonly string[]; readonly ko: readonly string[] } = {
  en: [
    "us-lawyer-contract-review",
    "us-lawyer-nda",
    "documents-docx",
    "presentations-pptx",
    "spreadsheets-xlsx",
    "us-vc-investment-memo",
    "us-vc-term-sheet-review",
    "us-accountant-financial-statements",
    "us-accountant-variance-analysis",
    "humanize-writing",
    "charts-infographics",
    "pdf",
  ],
  ko: [
    "kr-lawyer-contract-review",
    "kr-lawyer-demand-letter",
    "kr-lawyer-nda",
    "hangul-hwpx",
    "documents-docx",
    "presentations-pptx",
    "spreadsheets-xlsx",
    "kr-vc-investment-memo",
    "kr-accountant-vat-return",
    "kr-accountant-year-end-settlement",
    "kr-vc-term-sheet-review",
    "humanize-writing",
  ],
};
