/*
 * POPULAR SKILLS - CURATED LIST.
 *
 * The "Popular" / "인기 스킬" shelf on the Skills page shows these catalogue skill names, in this
 * order. There is no usage data yet (the public catalogue at console.redrob.ai/skills/index.json has
 * no counts, and there is no backend for it), so the list is hand-picked. Editing these arrays is the
 * only change needed to replace it.
 *
 * Rules the shelf applies at runtime:
 * - one list per UI language (`en` for English, `ko` for Korean); any other language uses `en`;
 * - a name the live catalogue does not have is skipped, so a stale entry never breaks the page;
 * - skills the person already added stay in the shelf (their button reads Use).
 *
 * Names are stable catalogue skill names (the `name` in index.json), not display titles.
 */
const PICKS = ["docx-to-hwpx", "ko-civil-analysis", "ko-civil-formatting", "vc-pitch-deck", "kr-fs-preparation"] as const;

export const POPULAR_SKILLS: { readonly en: readonly string[]; readonly ko: readonly string[] } = {
  en: PICKS,
  ko: PICKS,
};
