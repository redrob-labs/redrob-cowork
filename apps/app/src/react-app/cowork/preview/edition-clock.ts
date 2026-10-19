/**
 * Pure date and time formatting for dated editions: the live clock in the trending panel header
 * and the fixed "Updated" stamp of a bundled snapshot. Both read the reader's locale and, unless a
 * zone is passed (tests do), the reader's own time zone. Times use a 24-hour clock in both
 * languages so the header stays the same width as it ticks.
 */
import type { Language } from "../../../i18n";

/** The localized pieces a clock string is assembled from. */
type ClockParts = { weekday: string; month: string; day: string; hour: string; minute: string };

/** Splits a date into localized parts on a 24-hour clock, in `timeZone` or the reader's own. */
function clockParts(date: Date, locale: Language, timeZone?: string): ClockParts {
  const korean = locale === "ko";
  const parts = new Intl.DateTimeFormat(korean ? "ko" : "en", {
    weekday: "short",
    month: korean ? "numeric" : "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: pick("weekday"), month: pick("month"), day: pick("day"), hour: pick("hour"), minute: pick("minute") };
}

/** "Mon, Oct 19 · 11:07" in English, "10월 19일 (월) 11:07" in Korean. */
export function formatLiveClock(date: Date, locale: Language, timeZone?: string): string {
  const p = clockParts(date, locale, timeZone);
  return locale === "ko"
    ? `${p.month}월 ${p.day}일 (${p.weekday}) ${p.hour}:${p.minute}`
    : `${p.weekday}, ${p.month} ${p.day} · ${p.hour}:${p.minute}`;
}

/** "Oct 19, 09:00" in English, "10월 19일 09:00" in Korean, for a snapshot's own ISO time. */
export function formatEditionStamp(iso: string, locale: Language, timeZone?: string): string {
  const p = clockParts(new Date(iso), locale, timeZone);
  return locale === "ko" ? `${p.month}월 ${p.day}일 ${p.hour}:${p.minute}` : `${p.month} ${p.day}, ${p.hour}:${p.minute}`;
}

/** Milliseconds from `now` until the next whole minute, so a clock flips on the minute. */
export function msToNextMinute(now: number): number {
  return 60_000 - (now % 60_000);
}
