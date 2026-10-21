/*
 * Cover art for the Console catalogue's grouped skills (the 35 in console PR #305). Each skill has a
 * round PNG at 128, 256 and 384 px in `public/skill-art/<name>.png`, `<name>@2x.png` and
 * `<name>@3x.png`, copied as delivered. A skill without art keeps its tone-coded circle.
 */

/** Stable skill names that have cover art. */
const SKILL_ART_NAMES: ReadonlySet<string> = new Set([
  "humanizing-english-casual",
  "humanizing-english-workplace",
  "humanizing-korean-banmal",
  "humanizing-korean-jondaetmal",
  "humanizing-korean-academic",
  "researching-korean-literature",
  "writing-korean-papers",
  "formatting-korean-papers",
  "ko-civil-analysis",
  "ko-civil-formatting",
  "ko-criminal-analysis",
  "ko-criminal-formatting",
  "kpat-invention-logic",
  "kpat-prior-art-research",
  "kpat-document-composer",
  "kpat-drawings",
  "kpat-final-audit",
  "kr-fs-preparation",
  "kr-jet",
  "kr-audit-adjustments",
  "kr-audit-report",
  "kc-proposal",
  "kc-diagnosis",
  "kc-report",
  "vc-pitch-deck",
  "vc-deck-scorecard",
  "tusim-research",
  "tusim-narrative",
  "tusim-document-formatter",
  "korean-press-release",
  "korean-straight-news",
  "composing-graphics",
  "composing-color-themes",
  "docx-to-hwpx",
  "hwpx-to-docx",
]);

/** The art's `src` and `srcSet` (128, 256 and 384 px wide), or null when the skill has none. */
export function skillArt(name: string): { src: string; srcSet: string } | null {
  if (!SKILL_ART_NAMES.has(name)) return null;
  const base = `/skill-art/${encodeURIComponent(name)}`;
  return { src: `${base}.png`, srcSet: `${base}.png 128w, ${base}@2x.png 256w, ${base}@3x.png 384w` };
}
