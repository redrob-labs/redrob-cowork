/*
 * Sample data only: a Seoul law firm, Han Jiwoo's desk, on Monday 28 September 2026.
 * Never import these fixtures from a real implementation.
 */

/** A local time in 2026, like the prototype's `T(d, hh, mm)`. `month` is 1-based. */
export function at(day: number, hh = 9, mm = 0, month = 9): number {
  return new Date(2026, month - 1, day, hh, mm).getTime();
}

/** The sample day's "now", for screens that show sample data relative to today. */
export const SAMPLE_NOW = at(28, 12);
