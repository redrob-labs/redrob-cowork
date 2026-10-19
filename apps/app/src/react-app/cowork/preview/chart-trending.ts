/**
 * Curated 19 October 2026 edition. Source: Google Trends, South Korea and United States
 * trending searches (past 24 hours), checked 19 October 2026. This is bundled editorial
 * data, not a live feed. Previous ranks are editorial comparisons with the prior edition.
 */
import type { Language } from "../../../i18n";

export type TrendScope = "korea" | "global";
export type Trend = "up" | "down" | "steady" | "new";

export type TrendItem = {
  /** Stable identifier used when a result starts a chat. */
  id: string;
  /** Position in this edition, from 1 to 10. */
  rank: number;
  /** Position in the prior edition, or null for a new entry. */
  prevRank: number | null;
  /** Search term shown in English UI. */
  label: string;
  /** Search term shown in Korean UI; Korea terms stay unchanged. */
  labelKo: string;
};

export type TrendingEdition = {
  /** Calendar date attached to this bundled edition. */
  asOf: string;
  /** Short, human-readable provenance for review. */
  sourceNote: string;
  /** South Korea search terms. */
  korea: readonly TrendItem[];
  /** Global editorial search terms. */
  global: readonly TrendItem[];
};

export const TRENDING: TrendingEdition = {
  asOf: "2026-10-19",
  sourceNote: "Google Trends, South Korea and United States, past 24 hours; editorial selection checked 19 October 2026.",
  korea: [
    { id: "kr-shinsegae-gangnam", rank: 1, prevRank: 4, label: "신세계백화점 강남점", labelKo: "신세계백화점 강남점" },
    { id: "kr-typhoon-champi", rank: 2, prevRank: null, label: "태풍 참피", labelKo: "태풍 참피" },
    { id: "kr-leeds-man-united", rank: 3, prevRank: 8, label: "리즈 유나이티드 대 맨유", labelKo: "리즈 유나이티드 대 맨유" },
    { id: "kr-real-madrid-sevilla", rank: 4, prevRank: 6, label: "레알 마드리드 대 세비야", labelKo: "레알 마드리드 대 세비야" },
    { id: "kr-golf", rank: 5, prevRank: 3, label: "골프", labelKo: "골프" },
    { id: "kr-koo-sung-hwan", rank: 6, prevRank: null, label: "구성환", labelKo: "구성환" },
    { id: "kr-park-se-young", rank: 7, prevRank: 5, label: "박세영", labelKo: "박세영" },
    { id: "kr-son-ye-jin", rank: 8, prevRank: 8, label: "손예진", labelKo: "손예진" },
    { id: "kr-hwang-yeon-joo", rank: 9, prevRank: null, label: "황연주", labelKo: "황연주" },
    { id: "kr-overcharging", rank: 10, prevRank: 7, label: "바가지 요금", labelKo: "바가지 요금" },
  ],
  global: [
    { id: "gl-bills-raiders", rank: 1, prevRank: 2, label: "Bills vs Raiders", labelKo: "빌스 대 레이더스" },
    { id: "gl-chargers-chiefs", rank: 2, prevRank: 5, label: "Chargers vs Chiefs", labelKo: "차저스 대 치프스" },
    { id: "gl-panthers-eagles", rank: 3, prevRank: null, label: "Panthers vs Eagles", labelKo: "팬서스 대 이글스" },
    { id: "gl-bears-falcons", rank: 4, prevRank: 1, label: "Bears vs Falcons", labelKo: "베어스 대 팰컨스" },
    { id: "gl-steelers-buccaneers", rank: 5, prevRank: 7, label: "Steelers vs Buccaneers", labelKo: "스틸러스 대 버커니어스" },
    { id: "gl-adriana-lima", rank: 6, prevRank: null, label: "Adriana Lima", labelKo: "아드리아나 리마" },
    { id: "gl-saints-giants", rank: 7, prevRank: 4, label: "Saints vs Giants", labelKo: "세인츠 대 자이언츠" },
    { id: "gl-real-madrid-sevilla", rank: 8, prevRank: 10, label: "Real Madrid vs Sevilla", labelKo: "레알 마드리드 대 세비야" },
    { id: "gl-texans-jaguars", rank: 9, prevRank: null, label: "Texans vs Jaguars", labelKo: "텍산스 대 재규어스" },
    { id: "gl-ravens-browns", rank: 10, prevRank: 9, label: "Ravens vs Browns", labelKo: "레이븐스 대 브라운스" },
  ],
};

/** Derives direction and distance from this and the previous rank. */
export function trendOf(item: TrendItem): { trend: Trend; moved: number } {
  if (item.prevRank === null) return { trend: "new", moved: 0 };
  if (item.prevRank === item.rank) return { trend: "steady", moved: 0 };
  return item.prevRank > item.rank
    ? { trend: "up", moved: item.prevRank - item.rank }
    : { trend: "down", moved: item.rank - item.prevRank };
}

/** Returns the localized display label stored with an editorial item. */
export function trendLabel(item: TrendItem, locale: Language): string {
  return locale === "ko" ? item.labelKo : item.label;
}

/** Orders ticker entries with the reader's likely home scope first. */
export function tickerSequence(
  edition: TrendingEdition,
  locale: Language,
): Array<{ scope: TrendScope; item: TrendItem }> {
  const korea = edition.korea.map((item) => ({ scope: "korea" as const, item }));
  const global = edition.global.map((item) => ({ scope: "global" as const, item }));
  return locale === "ko" ? [...korea, ...global] : [...global, ...korea];
}
