import { describe, expect, test } from "bun:test";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import { TRENDING } from "../src/react-app/cowork/preview/chart-trending";
import { formatEditionStamp, formatLiveClock, msToNextMinute } from "../src/react-app/cowork/preview/edition-clock";
import {
  RADAR,
  RADAR_FEEDS,
  radarFeedFromParam,
  radarPath,
  radarSection,
  radarStoryText,
  radarSummary,
} from "../src/react-app/cowork/preview/radar-edition";

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean).length;

describe("edition clock", () => {
  const at = new Date("2026-10-19T02:07:00Z");

  test("formats the live day and time in English and Korean", () => {
    expect(formatLiveClock(at, "en", "Asia/Seoul")).toBe("Mon, Oct 19 · 11:07");
    expect(formatLiveClock(at, "ko", "Asia/Seoul")).toBe("10월 19일 (월) 11:07");
  });

  test("uses the given time zone and a 24-hour clock", () => {
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

  test("the trending snapshot time is a valid ISO time on its edition day", () => {
    expect(Number.isNaN(Date.parse(TRENDING.updatedAt))).toBe(false);
    expect(TRENDING.updatedAt.startsWith(TRENDING.asOf)).toBe(true);
  });
});

describe("radar edition", () => {
  test("has both feeds with 5 to 8 complete, unique, sourced stories", () => {
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

  test("banner overviews run 3 to 4 sentences and story summaries 2 to 3", () => {
    for (const feed of RADAR_FEEDS) {
      const section = radarSection(RADAR, feed);
      for (const overview of [section.summary, section.summaryKo]) {
        expect(sentences(overview)).toBeGreaterThanOrEqual(3);
        expect(sentences(overview)).toBeLessThanOrEqual(4);
      }
      for (const story of section.stories) {
        for (const summary of [story.summary, story.summaryKo]) {
          expect(sentences(summary)).toBeGreaterThanOrEqual(2);
          expect(sentences(summary)).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  test("localizes overviews and stories", () => {
    const first = RADAR.news.stories[0]!;
    expect(radarSummary(RADAR.news, "ko")).toBe(RADAR.news.summaryKo);
    expect(radarSummary(RADAR.news, "en")).toBe(RADAR.news.summary);
    expect(radarStoryText(first, "ko")).toEqual({ headline: first.headlineKo, summary: first.summaryKo });
    expect(radarStoryText(first, "en")).toEqual({ headline: first.headline, summary: first.summary });
  });
});

describe("radar routes", () => {
  test("accepts only the two feeds", () => {
    expect(radarFeedFromParam("news")).toBe("news");
    expect(radarFeedFromParam("social")).toBe("social");
    expect(radarFeedFromParam("News")).toBeNull();
    expect(radarFeedFromParam("sports")).toBeNull();
    expect(radarFeedFromParam("")).toBeNull();
    expect(radarFeedFromParam(undefined)).toBeNull();
  });

  test("builds the subpage paths", () => {
    expect(radarPath("news")).toBe("/radar/news");
    expect(radarPath("social")).toBe("/radar/social");
  });
});

describe("radar and ticker copy", () => {
  const isNewKey = (key: string) => key.startsWith("cowork.radar_") || key === "cowork.chart_trending_updated";
  const english = Object.entries(en).filter(([key]) => isNewKey(key));
  const korean = Object.entries(ko).filter(([key]) => isNewKey(key));

  test("every new key exists in English and Korean", () => {
    expect(english.length).toBe(9);
    expect(english.map(([key]) => key).sort()).toEqual(korean.map(([key]) => key).sort());
  });

  test("names the section and banners in the page's marketing voice", () => {
    expect(en["cowork.radar_heading"]).toBe("On the radar");
    expect(en["cowork.radar_news_title"]).toBe("The Front Page");
    expect(en["cowork.radar_social_title"]).toBe("Everyone's Talking");
    expect(ko["cowork.radar_heading"]).toBe("오늘 눈여겨볼 소식");
    expect(ko["cowork.radar_news_title"]).toBe("오늘의 1면");
    expect(ko["cowork.radar_social_title"]).toBe("다들 이 얘기 중");
    for (const key of ["cowork.radar_news_title", "cowork.radar_social_title"]) {
      expect(en[key as keyof typeof en]).not.toMatch(/trending|today/i);
    }
  });

  test("the removed ticker note and pause controls are gone in both languages", () => {
    for (const table of [en, ko] as Array<Record<string, string>>) {
      expect(table["cowork.chart_trending_note"]).toBeUndefined();
      expect(table["cowork.chart_trending_pause"]).toBeUndefined();
      expect(table["cowork.chart_trending_play"]).toBeUndefined();
    }
  });

  test("keeps keys and edition text within the voice rules", () => {
    const edition = RADAR_FEEDS.flatMap((feed) => {
      const section = radarSection(RADAR, feed);
      return [
        section.summary,
        section.summaryKo,
        ...section.stories.flatMap((story) => [story.headline, story.headlineKo, story.summary, story.summaryKo]),
      ];
    });
    const values = [...english.map(([, v]) => v), ...korean.map(([, v]) => v), ...edition];
    for (const value of values) {
      expect(value).not.toContain("\u2014");
      expect(value.toLowerCase()).not.toContain("real-time");
      expect(value.toLowerCase()).not.toContain("realtime");
      expect(value).not.toContain("실시간");
      expect(value).not.toMatch(/\b[A-Z]{4,}\b/);
      expect(value).not.toMatch(/ai-powered|seamless|effortless|\bunlock|\bempower/i);
      // "We" in our own voice; quoted titles (a song called "we fell in love in october") are not our voice.
      expect(value.replace(/"[^"]*"|'[^']*'/g, "")).not.toMatch(/\bwe\b|\bour\b/i);
    }
  });
});
