import { expect, test, describe } from "bun:test";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import {
  TRENDING,
  tickerSequence,
  trendingEditionDate,
  trendOf,
  type TrendItem,
} from "../src/react-app/cowork/preview/chart-trending";
import { nextAutoRotateIndex } from "../src/react-app/cowork/preview/use-auto-rotate";

function item(rank: number, prevRank: number | null): TrendItem {
  return { id: "test", rank, prevRank, label: "Test", labelKo: "테스트" };
}

describe("trendOf", () => {
  test("reports up, down, steady and new with movement", () => {
    expect(trendOf(item(2, 5))).toEqual({ trend: "up", moved: 3 });
    expect(trendOf(item(6, 4))).toEqual({ trend: "down", moved: 2 });
    expect(trendOf(item(3, 3))).toEqual({ trend: "steady", moved: 0 });
    expect(trendOf(item(1, null))).toEqual({ trend: "new", moved: 0 });
  });
});

describe("ticker rotation", () => {
  test("wraps safely", () => {
    expect(nextAutoRotateIndex(0, 3)).toBe(1);
    expect(nextAutoRotateIndex(2, 3)).toBe(0);
    expect(nextAutoRotateIndex(4, 0)).toBe(0);
  });

  test("puts the local scope first and preserves rank order", () => {
    const korean = tickerSequence(TRENDING, "ko");
    const english = tickerSequence(TRENDING, "en");
    expect(korean).toHaveLength(20);
    expect(english).toHaveLength(20);
    expect(korean[0]).toMatchObject({ scope: "korea", item: { rank: 1 } });
    expect(english[0]).toMatchObject({ scope: "global", item: { rank: 1 } });
    expect(korean.slice(0, 10).map(({ item: entry }) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(english.slice(0, 10).map(({ item: entry }) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("trending edition", () => {
  test("formats the snapshot with its full calendar day", () => {
    expect(trendingEditionDate("2026-10-19", "en")).toBe("October 19, 2026");
    expect(trendingEditionDate("2026-10-19", "ko")).toBe("2026년 10월 19일");
  });

  test("has complete, unique top tens with valid previous ranks", () => {
    const ids = new Set<string>();
    for (const entries of [TRENDING.korea, TRENDING.global]) {
      expect(entries).toHaveLength(10);
      expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const previousRanks = entries.flatMap((entry) => entry.prevRank === null ? [] : [entry.prevRank]);
      expect(new Set(previousRanks).size).toBe(previousRanks.length);
      expect(previousRanks.every((rank) => rank >= 1 && rank <= 10)).toBe(true);
      for (const entry of entries) {
        expect(ids.has(entry.id)).toBe(false);
        ids.add(entry.id);
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.labelKo.length).toBeGreaterThan(0);
      }
    }
  });

  test("keeps new English and Korean copy in parity and within voice rules", () => {
    const english = Object.entries(en).filter(([key]) => key.startsWith("cowork.chart_trending_") || key.startsWith("cowork.chart_banners_p"));
    const korean = Object.entries(ko).filter(([key]) => key.startsWith("cowork.chart_trending_") || key.startsWith("cowork.chart_banners_p"));
    expect(english.map(([key]) => key).sort()).toEqual(korean.map(([key]) => key).sort());
    for (const [, value] of [...english, ...korean]) {
      expect(value).not.toContain("—");
      expect(value.toLowerCase()).not.toContain("real-time");
      expect(value).not.toContain("실시간");
      expect(value).not.toMatch(/\b[A-Z]{4,}\b/);
    }
  });

  test("declares reduced-motion overrides for every new moving selector", async () => {
    const css = await Bun.file(new URL("../src/app/index.css", import.meta.url)).text();
    // The reduced-motion block that carries the ticker's overrides (not just the file's last one,
    // which later features append after it).
    const anchor = css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .model-chart__trending-entry");
    const start = anchor >= 0 ? anchor : css.indexOf("@media (prefers-reduced-motion: reduce) {\r\n  .model-chart__trending-entry");
    const reduced = css.slice(start, start + 400);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(reduced).toContain(".model-chart__trending-entry");
    expect(reduced).toContain("animation: none");
    expect(reduced).toContain(".model-chart__trending-trigger");
    expect(reduced).toContain(".model-chart__trending-chevron");
    expect(reduced).toContain("transition: none");
    expect(reduced).toContain("transform: none");
  });
});
