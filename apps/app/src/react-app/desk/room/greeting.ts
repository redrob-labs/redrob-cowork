/**
 * The home screen's spoken greeting. Claude-Cowork style: a warm line that knows
 * the time of day and the person, and changes through the day instead of a single
 * fixed sentence.
 *
 * Design-system fit: the voice spec (07-voice.md) allows the product to get warm
 * "when it is empty" — this is that place. The line is in the product's own voice
 * (second person, present tense, no "we"). The brand beat still rides along as a
 * smaller sub-line beneath it (see session-empty-hero), so the beat is not lost.
 *
 * Rotation: each time band has several variants. We pick by a slot that advances
 * every few hours, so a long-open window updates and consecutive visits vary,
 * while a given slot is stable (no flicker on re-render). Name is optional; every
 * variant has a no-name fallback so an unnamed profile still reads naturally.
 */

import { t } from "../../../i18n";

/** Time bands, by local hour. */
export type GreetingBand = "morning" | "afternoon" | "evening" | "late";

/** How many rotating variants each band carries (keys _1.._N). Keep in sync with i18n. */
const VARIANTS_PER_BAND = 4;

/** Roughly how often the greeting rotates within a band. */
const ROTATE_HOURS = 3;

export function bandForHour(hour: number): GreetingBand {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late"; // 22:00–04:59
}

/**
 * A slot that advances every ROTATE_HOURS, used to rotate variants. Derived from
 * the clock so it is stable within a slot and moves on across the day.
 */
export function rotationSlot(now: Date): number {
  const epochHours = Math.floor(now.getTime() / 3_600_000);
  return Math.floor(epochHours / ROTATE_HOURS);
}

/** The i18n key for the greeting line at this moment. */
export function greetingKey(now: Date): string {
  const band = bandForHour(now.getHours());
  const variant = (rotationSlot(now) % VARIANTS_PER_BAND) + 1;
  return `desk.greeting_${band}_${variant}`;
}

/**
 * The greeting text now. `name` is the person's display name (trimmed, falsy when
 * unknown); each key resolves with or without it via the i18n fallback keys.
 */
export function greetingText(now: Date, name: string | null | undefined): string {
  const trimmed = name?.trim();
  const key = greetingKey(now);
  if (trimmed) return t(key, { name: trimmed });
  // No name: the paired _anon key drops the name cleanly.
  return t(`${key}_anon`);
}

/** The milliseconds until the next rotation slot, for scheduling a refresh. */
export function msUntilNextSlot(now: Date): number {
  const slotMs = ROTATE_HOURS * 3_600_000;
  const elapsed = now.getTime() % slotMs;
  return slotMs - elapsed;
}

/** How many rotating starter hints exist (keys desk.starter_hint_1..N). Keep in sync with i18n. */
const STARTER_HINTS = 5;

/**
 * The sub-line under the greeting: a rotating prompt-starter hint (replaces the retired brand beat).
 * Keyed to the same rotation slot as the greeting so the pair changes together and stays stable
 * within a slot.
 */
export function starterHintText(now: Date): string {
  const variant = (rotationSlot(now) % STARTER_HINTS) + 1;
  return t(`desk.starter_hint_${variant}`);
}
