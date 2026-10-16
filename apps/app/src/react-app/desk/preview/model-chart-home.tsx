/** @jsxImportSource react */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { t, type Language } from "../../../i18n";
import {
  CHART_OUTPUT_ORDER,
  COUNTRY_LABEL_KEY,
  FEATURE_KEYS,
  OUTPUT_LABEL_KEY,
  SKILL_IDS,
  SKILL_LABEL_KEY,
  type CountryId,
  type FeatureId,
  type SkillId,
} from "./chart-keys";
import { resolveExtensionIconSrc } from "../../design-system/extension-icon-src";
import type { GuideResearch } from "../guide/model-guide";
import { guideProfessions } from "../guide/model-guide";

/**
 * The plural "who" for a profession tile, keyed by the research profession id. The tile reads
 * "For {who}" (round 21) - a music-app shelf voice. HR is a mass noun ("For HR teams", not "For HRs");
 * sales is irregular ("For Salespeople"). Any id not listed falls back to the research label with a
 * plain "s", so a new profession still reads sensibly without a code change.
 */
const PROFESSION_PLURAL: Record<string, string> = {
  engineer: "Engineers",
  developer: "Developers",
  designer: "Designers",
  marketer: "Marketers",
  founder: "Founders",
  investor: "Investors",
  vc: "Investors",
  lawyer: "Lawyers",
  accountant: "Accountants",
  writer: "Writers",
  pm: "PMs",
  sales: "Salespeople",
  hr: "HR teams",
  doctor: "Doctors",
  teacher: "Teachers",
  analyst: "Analysts",
  consultant: "Consultants",
  researcher: "Researchers",
};
function forProfessionLabel(id: string, label: string): string {
  const who = PROFESSION_PLURAL[id] ?? `${label}s`;
  return t("desk.chart_tile_for", { who });
}

/**
 * Display order for the profession shelf, by rough AI-usage popularity (round 21) rather than the
 * research's own order. Engineers/developers lead AI adoption, then marketing, writing, product and
 * design, then the knowledge-work professions. Ids not listed sort after, in research order.
 */
const PROFESSION_ORDER = [
  "engineer", "developer", "marketer", "writer", "pm", "designer",
  "founder", "sales", "analyst", "consultant", "lawyer", "accountant",
  "investor", "vc", "researcher", "hr", "teacher", "doctor",
];
/** Stable sort of items by an explicit id order; unknown ids keep their original relative order after. */
function orderByRank<T>(items: readonly T[], idOf: (item: T) => string, order: readonly string[]): T[] {
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return [...items]
    .map((item, i) => ({ item, i, r: rank(idOf(item)) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/**
 * The output shelf's tiles (round 21), in rough AI-usage popularity order. This is the CHART's own
 * editorial list - broader than the research re-rank select (`guideOutputs`) - so it adds Code, Voice
 * and Video as decorative modalities beside the five researched ones. Code leads (the biggest
 * professional AI use), then documents and graphics, then the newer modalities. Each tile still opens
 * the output view like the others.
 */
function chartOutputs(): Array<{ value: string; label: string }> {
  return CHART_OUTPUT_ORDER.map((value) => ({ value, label: t(OUTPUT_LABEL_KEY[value]) }));
}

/**
 * The Model Chart landing, in the spirit of a music-chart app (Spotify / Apple Music): rotating
 * editorial banners, then square "artist" tiles across four shelves - professions, skills, output
 * types and countries. Each tile wears a tasteful scatter of model-provider marks as soft album art
 * behind frosted glass (varied per tile, spread evenly across the labs - decoupled from the ranking),
 * a bold label and one punchy line. Picking a tile opens that chart's ranking (the existing
 * ModelGuide), so this is a browse layer ON TOP of the researched data, not a replacement for it.
 */

/**
 * Round 25: the album art is now a REAL per-tile image (the user's hand-built set under
 * public/brand/album-art/<section>/<slug>.png, with @2x/@3x retina variants), not a generated scatter
 * of provider marks. `albumArtSrc` maps a shelf section + internal tile id to the image's base path;
 * `ALBUM_ART_ALIAS` bridges the few ids whose image slug differs from the code id. A missing entry
 * returns null and the tile falls back to the glass gradient alone.
 */
export type ArtSection = "picked-for-your-profession" | "skills-in-heavy-rotation" | "made-to-ship" | "homegrown-heroes";

/** Code id -> image slug, only where they differ (professions get a "for-" prefix; a few renames). */
const ALBUM_ART_ALIAS: Record<string, string> = {
  // professions: internal id -> file slug
  engineer: "for-engineers", marketer: "for-marketers", pm: "for-pms", designer: "for-designers",
  founder: "for-founders", sales: "for-salespeople", analyst: "for-analysts", consultant: "for-consultants",
  lawyer: "for-lawyers", accountant: "for-accountants", investor: "for-investors", hr: "for-hr-teams",
  recruiter: "for-recruiters", "small-team": "for-small-teams",
  // skills: the ids whose slug differs from the code id
  "seeking-information": "answers-and-facts", "practical-howto": "how-to-advice", "knowledge-qa": "ask-your-docs",
  editing: "editing-and-proofreading",
  // outputs: the one id whose slug differs
  data: "data-and-charts",
  // countries: internal id -> file slug
  us: "united-states", uk: "united-kingdom", korea: "south-korea", uae: "united-arab-emirates", saudi: "saudi-arabia",
};

/**
 * The set of ids that HAVE album art, per section. The professions shelf is research-driven and can
 * surface ids beyond the 12 we drew art for (e.g. recruiter, small-team); those must fall back to the
 * glass rather than request a missing image. Skills/outputs/countries are our own fixed lists, so any
 * id there is expected to have art.
 */
const ALBUM_ART_PROFESSIONS = new Set([
  "engineer", "marketer", "pm", "designer", "founder", "sales",
  "analyst", "consultant", "lawyer", "accountant", "investor", "hr",
  "recruiter", "small-team",
]);

/** Base `/brand/album-art/<section>/<slug>` path for a tile, or null when no art exists for that id. */
export function albumArtBase(section: ArtSection, id: string): string | null {
  if (section === "picked-for-your-profession" && !ALBUM_ART_PROFESSIONS.has(id)) return null;
  const slug = ALBUM_ART_ALIAS[id] ?? id;
  return slug ? `/brand/album-art/${section}/${slug}` : null;
}

/**
 * The square album art: the real image for this tile, retina-served from @2x/@3x. Decorative
 * (aria-hidden) - the caption below carries the meaning. Renders nothing when the tile has no image,
 * leaving the glass gradient as the backdrop.
 */
function AlbumArt({ section, id, alt }: { section: ArtSection; id: string; alt: string }) {
  const baseRaw = albumArtBase(section, id);
  if (!baseRaw) return null;
  const base = resolveExtensionIconSrc(`${baseRaw}.png`);
  const base2x = resolveExtensionIconSrc(`${baseRaw}@2x.png`);
  const base3x = resolveExtensionIconSrc(`${baseRaw}@3x.png`);
  return (
    <img
      className="model-chart__art"
      src={base}
      srcSet={`${base} 1x, ${base2x} 2x, ${base3x} 3x`}
      alt={alt}
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

/**
 * The Skills shelf (round 22): rebuilt as the top 20 things people actually use AI for, ranked by
 * real-world adoption (McKinsey / IBM / Gartner-cited 2026 use-case surveys) rather than the old
 * legal/finance sample tasks. Decoupled from the Skills fixture - this is an editorial "what AI is
 * used for" shelf. Each tile drills into the leading profession's ranking for now (the model ranking
 * is a later session); the label and blurb are localized `chart_skill_*` / `chart_blurb_skill_*` keys.
 */
function skillTiles(research: GuideResearch, locale: Language): Array<{ id: SkillId; pick: ChartPick }> {
  const professions = guideProfessions(research, locale);
  const top = professions[0];
  return SKILL_IDS.map((id) => ({
    id,
    pick: { kind: "profession", id: top?.id ?? "", label: t(SKILL_LABEL_KEY[id]), section: "skills-in-heavy-rotation", tileId: id },
  }));
}

/**
 * The Countries shelf (round 21): the top 8 countries BUILDING their own frontier models, in rough
 * AI-dominance order - US and China lead, then France (Mistral), the UK (DeepMind), Canada (Cohere),
 * South Korea (HyperCLOVA / EXAONE), Israel (AI21) and the UAE (Falcon / Jais). The tile drills into
 * the nearest ranked working language (research ranks en / ko / hi only); the four without a ranked
 * language of their own map to English as the lingua-franca ranking. Blurbs are about who builds the
 * models, not how work is done there.
 */
type CountryTile = { id: CountryId; language: string };
const COUNTRY_TILES: readonly CountryTile[] = [
  { id: "us", language: "en" },
  { id: "china", language: "en" },
  { id: "france", language: "en" },
  { id: "uk", language: "en" },
  { id: "canada", language: "en" },
  { id: "korea", language: "ko" },
  { id: "germany", language: "en" },
  { id: "japan", language: "en" },
  { id: "israel", language: "en" },
  { id: "uae", language: "en" },
  { id: "india", language: "hi" },
  { id: "saudi", language: "en" },
];

export type ChartPick = (
  | { kind: "profession"; id: string; label: string }
  | { kind: "output"; value: string; label: string }
  /** A working language to rank in (the Countries shelf maps a country to its language). */
  | { kind: "language"; value: string; label: string }
) & {
  /** The shelf + tile this pick came from, so the detail page can show that chart's bespoke list. */
  section?: ArtSection;
  tileId?: string;
};

/** A rotating hero banner. Editorial, built from the live research so it never goes stale. */
type Banner = { id: string; eyebrow: string; title: string; sub: string; pick: ChartPick; tone: number; art: string };

const BANNER_MS = 5000;

/**
 * A tiny deterministic string hash (FNV-1a-ish). Seeded "randomness" so every component gets its own
 * liquid-glass variation that is STABLE across re-renders, reloads and tests - never Math.random().
 */
function seedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Per-component glass variation as CSS custom properties, derived from a seed. Varies the two blobs'
 * positions and sizes, the blur radius, a hue shift and the highlight angle - all within tasteful
 * bounds so each tile looks a little different but still on-brand. The CSS reads these with fallbacks,
 * so a component with no style still renders the round-11 default.
 */
function glassStyle(seed: string): CSSProperties {
  const h = seedHash(seed);
  const pick = (shift: number, lo: number, hi: number) => lo + (((h >>> shift) % 1000) / 1000) * (hi - lo);
  return {
    "--g-x1": `${pick(0, 10, 34).toFixed(1)}%`,
    "--g-y1": `${pick(4, 12, 30).toFixed(1)}%`,
    "--g-x2": `${pick(8, 70, 90).toFixed(1)}%`,
    "--g-y2": `${pick(12, 22, 42).toFixed(1)}%`,
    "--g-s1": `${pick(16, 38, 50).toFixed(0)}%`,
    "--g-s2": `${pick(20, 44, 56).toFixed(0)}%`,
    "--g-blur": `${pick(24, 20, 32).toFixed(0)}px`,
    "--g-hue": `${pick(2, -18, 18).toFixed(0)}deg`,
    "--g-angle": `${pick(6, 110, 250).toFixed(0)}deg`,
    "--g-highlight": `${pick(10, 0.4, 0.68).toFixed(2)}`,
  } as CSSProperties;
}

/** An output's editorial blurb, under 10 words. Falls back to the generic "best, ranked" line. */
function outputBlurb(value: string): string {
  return tileBlurb("output", value, t("desk.chart_blurb_output_generic"));
}

/**
 * The punchy, Apple-Music-editorial line under a tile label - unique per card, under 10 words. Keyed
 * by the segment and the tile id (e.g. `desk.chart_blurb_profession_lawyer`); falls back to a tasteful
 * generic line when a specific one is not written, so a new profession/output never shows a key.
 */
function tileBlurb(segment: "profession" | "output" | "skill" | "country", id: string, fallback: string): string {
  const key = `desk.chart_blurb_${segment}_${id}`;
  const line = t(key);
  return line === key ? fallback : line;
}

/** A profession's hand-written editorial blurb, or a plural generic line. No formula, no interpolation. */
function professionBlurb(id: string): string {
  return tileBlurb("profession", id, t("desk.chart_blurb_profession_any"));
}

/**
 * The featured banners (round 24): rebuilt from scratch. Three HAND-PICKED, DIVERSE flagship AI use
 * cases - Writing (text), Coding (build), Image generation (visual) - rather than auto-generated
 * "Best for X" lines off the research. Each is a localized `chart_feature_*` title + sub written in a
 * movie/album marketing voice, under one "Featured" eyebrow, and drills into its matching output
 * ranking. Deliberately 3 (not 5), so the rail reads as a curated spotlight.
 */
function buildBanners(_research: GuideResearch, _locale: Language): Banner[] {
  const feature = (id: FeatureId, output: string, tone: number, art: string): Banner => ({
    id: `feature-${id}`,
    eyebrow: t("desk.chart_feature_eyebrow"),
    title: t(FEATURE_KEYS[id].title),
    sub: t(FEATURE_KEYS[id].sub),
    pick: { kind: "output", value: output, label: t(FEATURE_KEYS[id].title), section: "made-to-ship", tileId: output },
    tone,
    art,
  });
  return [
    // art slug matches the artwork whose baked-in text already names this banner.
    feature("writing", "documents", 0, "the-writers-room"),
    feature("coding", "code", 1, "built-different"),
    feature("image", "graphics", 3, "picture-this"),
  ];
}

/** How far from the end counts as "at the edge" - a px tolerance so sub-pixel scroll never leaves a
 * chevron showing with nothing left to reveal. */
const SHELF_EDGE_EPSILON = 2;

/**
 * Pure overflow verdict for a horizontal shelf: from the row's scroll geometry, whether a previous and
 * a next chevron have anywhere to scroll to. `canScroll` is false when the whole shelf fits (no
 * chevrons at all). Kept pure (no DOM) so it is unit-tested directly.
 */
export function shelfScrollState(scrollLeft: number, scrollWidth: number, clientWidth: number): {
  canScroll: boolean;
  canPrev: boolean;
  canNext: boolean;
} {
  const overflow = scrollWidth - clientWidth > SHELF_EDGE_EPSILON;
  return {
    canScroll: overflow,
    canPrev: overflow && scrollLeft > SHELF_EDGE_EPSILON,
    canNext: overflow && scrollLeft < scrollWidth - clientWidth - SHELF_EDGE_EPSILON,
  };
}

/**
 * Tracks a scroll row's overflow/edge state from a scroll listener plus a ResizeObserver (so chevrons
 * re-evaluate when the window or the data changes, not only on scroll), and exposes a `scrollByPage`
 * that pages by ~one viewport width. Reduced-motion downgrades the smooth scroll to an instant jump.
 */
function useShelfScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ canScroll: false, canPrev: false, canNext: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setState(shelfScrollState(el.scrollLeft, el.scrollWidth, el.clientWidth));
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  const scrollByPage = useCallback((direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Page by ~one viewport width, keeping one card of overlap so nothing is skipped between pages.
    const amount = Math.max(el.clientWidth - 120, el.clientWidth * 0.85);
    el.scrollBy({ left: direction * amount, behavior: reduced ? "auto" : "smooth" });
  }, []);
  return { ref, state, measure, scrollByPage };
}

/**
 * One Trending-AI shelf: a heading above a SINGLE horizontal scroll-snap row of tiles (round 20 - the
 * shelves used to wrap into a grid). When the row overflows, a left and a right chevron fade in on
 * hover and page it by ~one viewport; each hides at its scroll extreme. The row also scrolls by wheel,
 * trackpad, touch and keyboard, so the chevrons are an affordance, not the only way.
 */
function ModelChartShelf(props: { heading: string; headingId: string; children: ReactNode }) {
  const { ref, state, measure, scrollByPage } = useShelfScroll();
  return (
    <section className="model-chart__section" aria-labelledby={props.headingId} data-can-scroll={state.canScroll || undefined}>
      <h3 id={props.headingId} className="model-chart__heading">{props.heading}</h3>
      <div className="model-chart__shelf">
        <button
          type="button"
          className="model-chart__chevron model-chart__chevron--prev"
          aria-label={t("desk.chart_scroll_prev")}
          data-show={state.canPrev || undefined}
          tabIndex={state.canPrev ? 0 : -1}
          aria-hidden={!state.canPrev}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeft width={18} height={18} aria-hidden />
        </button>
        <div className="model-chart__row" ref={ref} onScroll={measure}>
          {props.children}
        </div>
        <button
          type="button"
          className="model-chart__chevron model-chart__chevron--next"
          aria-label={t("desk.chart_scroll_next")}
          data-show={state.canNext || undefined}
          tabIndex={state.canNext ? 0 : -1}
          aria-hidden={!state.canNext}
          onClick={() => scrollByPage(1)}
        >
          <ChevronRight width={18} height={18} aria-hidden />
        </button>
      </div>
    </section>
  );
}

export function ModelChartHome(props: { research: GuideResearch; locale: Language; onOpen: (pick: ChartPick) => void }) {
  const banners = buildBanners(props.research, props.locale);
  const professions = orderByRank(guideProfessions(props.research, props.locale), (p) => p.id, PROFESSION_ORDER);
  const outputs = chartOutputs();
  const skills = skillTiles(props.research, props.locale);
  const countries = COUNTRY_TILES;
  const [active, setActive] = useState(0);
  // Auto-rotate the banners, paused under reduced-motion.
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current || banners.length <= 1) return;
    const id = window.setInterval(() => setActive((n) => (n + 1) % banners.length), BANNER_MS);
    return () => window.clearInterval(id);
  }, [banners.length]);

  const banner = banners[active];
  return (
    <div className="model-chart">
      {banner ? (
        <section className="model-chart__banners" aria-label={t("desk.chart_banners_label")}>
          <button type="button" className="model-chart__banner" data-tone={banner.tone} onClick={() => props.onOpen(banner.pick)}>
            <span className="model-chart__glass" style={glassStyle(`banner-${banner.id}`)} aria-hidden="true" />
            <img className="model-chart__banner-art" src={`/brand/banner-art/${banner.art}.png`} alt="" aria-hidden="true" loading="lazy" draggable={false} />
            <span className="model-chart__banner-scrim" aria-hidden="true" />
            <span className="model-chart__banner-eyebrow">{banner.eyebrow}</span>
            <span className="model-chart__banner-title">{banner.title}</span>
            <span className="model-chart__banner-sub">{banner.sub}</span>
          </button>
          <div className="model-chart__dots" role="tablist" aria-label={t("desk.chart_banners_label")}>
            {banners.map((b, index) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={b.title}
                className="model-chart__dot"
                data-on={index === active ? "true" : undefined}
                onClick={() => setActive(index)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <ModelChartShelf heading={t("desk.chart_by_profession")} headingId="model-chart-prof">
        {professions.map((profession, index) => (
            <button
              key={profession.id}
              type="button"
              className="model-chart__tile"
              data-tone={index % 5}
              onClick={() => props.onOpen({ kind: "profession", id: profession.id, label: profession.label ?? "", section: "picked-for-your-profession", tileId: profession.id })}
            >
              <span className="model-chart__card">
                <span className="model-chart__glass" style={glassStyle(`prof-${profession.id}`)} aria-hidden="true" />
                <AlbumArt section="picked-for-your-profession" id={profession.id} alt={forProfessionLabel(profession.id, profession.label ?? "")} />
              </span>
              <span className="model-chart__caption">
                <span className="model-chart__tile-label">{forProfessionLabel(profession.id, profession.label ?? "")}</span>
                <span className="model-chart__tile-summary">{professionBlurb(profession.id)}</span>
              </span>
            </button>
          ))}
      </ModelChartShelf>

      <ModelChartShelf heading={t("desk.chart_by_skills")} headingId="model-chart-skills">
        {skills.map(({ id, pick }, index) => (
            <button
              key={id}
              type="button"
              className="model-chart__tile"
              data-tone={(index + 1) % 5}
              onClick={() => props.onOpen(pick)}
            >
              <span className="model-chart__card">
                <span className="model-chart__glass" style={glassStyle(`skill-${id}`)} aria-hidden="true" />
                <AlbumArt section="skills-in-heavy-rotation" id={id} alt={t(SKILL_LABEL_KEY[id])} />
              </span>
              <span className="model-chart__caption">
                <span className="model-chart__tile-label">{t(SKILL_LABEL_KEY[id])}</span>
                <span className="model-chart__tile-summary">
                  {tileBlurb("skill", id, t("desk.chart_blurb_skill_generic"))}
                </span>
              </span>
            </button>
          ))}
      </ModelChartShelf>

      <ModelChartShelf heading={t("desk.chart_by_output")} headingId="model-chart-out">
        {outputs.map((output, index) => (
            <button
              key={output.value}
              type="button"
              className="model-chart__tile"
              data-tone={(index + 2) % 5}
              onClick={() => props.onOpen({ kind: "output", value: output.value, label: output.label, section: "made-to-ship", tileId: output.value })}
            >
              <span className="model-chart__card">
                <span className="model-chart__glass" style={glassStyle(`out-${output.value}`)} aria-hidden="true" />
                <AlbumArt section="made-to-ship" id={output.value} alt={output.label} />
              </span>
              <span className="model-chart__caption">
                <span className="model-chart__tile-label">{output.label}</span>
                <span className="model-chart__tile-summary">{outputBlurb(output.value)}</span>
              </span>
            </button>
          ))}
      </ModelChartShelf>

      <ModelChartShelf heading={t("desk.chart_by_country")} headingId="model-chart-country">
        {countries.map((country, index) => (
            <button
              key={country.id}
              type="button"
              className="model-chart__tile"
              data-tone={(index + 3) % 5}
              onClick={() =>
                props.onOpen({
                  kind: "language",
                  value: country.language,
                  label: t(COUNTRY_LABEL_KEY[country.id]),
                  section: "homegrown-heroes",
                  tileId: country.id,
                })
              }
            >
              <span className="model-chart__card">
                <span className="model-chart__glass" style={glassStyle(`country-${country.id}`)} aria-hidden="true" />
                <AlbumArt section="homegrown-heroes" id={country.id} alt={t(COUNTRY_LABEL_KEY[country.id])} />
              </span>
              <span className="model-chart__caption">
                <span className="model-chart__tile-label">{t(COUNTRY_LABEL_KEY[country.id])}</span>
                <span className="model-chart__tile-summary">
                  {tileBlurb("country", country.id, t("desk.chart_blurb_country_generic"))}
                </span>
              </span>
            </button>
          ))}
      </ModelChartShelf>
    </div>
  );
}
