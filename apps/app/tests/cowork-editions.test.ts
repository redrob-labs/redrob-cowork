import { describe, expect, test } from "bun:test";

import { TRENDING, tickerSequence, trendOf, type TrendItem } from "../src/react-app/cowork/preview/chart-trending";
import { formatEditionStamp, formatLiveClock, msToNextMinute } from "../src/react-app/cowork/preview/edition-clock";
import { RADAR, RADAR_FEEDS, radarFeedFromParam, radarSection } from "../src/react-app/cowork/preview/radar-edition";

function item(rank: number, prevRank: number | null): TrendItem {
  return { id: "test", rank, prevRank, label: "Test", labelKo: "테스트" };
}

describe("trending ticker", () => {
  test("trendOf reports up, down, steady and new with movement", () => {
    expect(trendOf(item(2, 5))).toEqual({ trend: "up", moved: 3 });
    expect(trendOf(item(6, 4))).toEqual({ trend: "down", moved: 2 });
    expect(trendOf(item(3, 3))).toEqual({ trend: "steady", moved: 0 });
    expect(trendOf(item(1, null))).toEqual({ trend: "new", moved: 0 });
  });

  test("puts the local scope first and preserves rank order", () => {
    const korean = tickerSequence(TRENDING, "ko");
    const english = tickerSequence(TRENDING, "en");
    expect(korean).toHaveLength(20);
    expect(english).toHaveLength(20);
    expect(korean[0]).toMatchObject({ scope: "korea", item: { rank: 1 } });
    expect(english[0]).toMatchObject({ scope: "global", item: { rank: 1 } });
    expect(korean.slice(0, 10).map(({ item: entry }) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("edition clock", () => {
  test("formats the live day and time in the given time zone on a 24-hour clock", () => {
    const at = new Date("2026-10-19T02:07:00Z");
    expect(formatLiveClock(at, "en", "Asia/Seoul")).toBe("Mon, Oct 19 · 11:07");
    expect(formatLiveClock(at, "ko", "Asia/Seoul")).toBe("10월 19일 (월) 11:07");
    expect(formatLiveClock(at, "en", "UTC")).toBe("Mon, Oct 19 · 02:07");
    expect(formatLiveClock(new Date("2026-10-18T15:05:00Z"), "en", "Asia/Seoul")).toBe("Mon, Oct 19 · 00:05");
    expect(formatLiveClock(new Date("2026-10-19T13:30:00Z"), "ko", "Asia/Seoul")).toBe("10월 19일 (월) 22:30");
  });

  test("formats the snapshot's own Updated time", () => {
    expect(formatEditionStamp(TRENDING.updatedAt, "en", "Asia/Seoul")).toBe("Oct 19, 09:00");
    expect(formatEditionStamp(TRENDING.updatedAt, "ko", "Asia/Seoul")).toBe("10월 19일 09:00");
    expect(formatEditionStamp(TRENDING.updatedAt, "en", "UTC")).toBe("Oct 19, 00:00");
  });

  test("ticks on the whole minute", () => {
    expect(msToNextMinute(Date.UTC(2026, 9, 19, 2, 7, 0))).toBe(60_000);
    expect(msToNextMinute(Date.UTC(2026, 9, 19, 2, 7, 45, 500))).toBe(14_500);
  });
});

describe("bundled edition data", () => {
  test("trending has complete, unique top tens and a valid snapshot time on its edition day", () => {
    expect(Number.isNaN(Date.parse(TRENDING.updatedAt))).toBe(false);
    expect(TRENDING.updatedAt.startsWith(TRENDING.asOf)).toBe(true);
    const ids = new Set<string>();
    for (const entries of [TRENDING.korea, TRENDING.global]) {
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

  test("radar has both feeds with 5 to 8 complete, unique, sourced stories", () => {
    const ids = new Set<string>();
    const asOf = Date.parse(RADAR.asOf);
    expect(Number.isNaN(asOf)).toBe(false);
    expect(RADAR_FEEDS).toEqual(["news", "social"]);
    for (const feed of RADAR_FEEDS) {
      const section = radarSection(RADAR, feed);
      expect(section.stories.length).toBeGreaterThanOrEqual(5);
      expect(section.stories.length).toBeLessThanOrEqual(8);
      for (const story of section.stories) {
        expect(ids.has(story.id)).toBe(false);
        ids.add(story.id);
        for (const value of [story.headline, story.headlineKo, story.summary, story.summaryKo, story.source]) {
          expect(value.trim().length).toBeGreaterThan(0);
        }
        const published = Date.parse(story.publishedAt);
        expect(Number.isNaN(published)).toBe(false);
        expect(published).toBeLessThanOrEqual(asOf);
        if (story.url) expect(new URL(story.url).protocol).toBe("https:");
      }
    }
  });

  test("radar routes accept only the two feeds", () => {
    expect(radarFeedFromParam("news")).toBe("news");
    expect(radarFeedFromParam("social")).toBe("social");
    expect(radarFeedFromParam("News")).toBeNull();
    expect(radarFeedFromParam("sports")).toBeNull();
    expect(radarFeedFromParam("")).toBeNull();
    expect(radarFeedFromParam(undefined)).toBeNull();
  });
});
