/**
 * Dynamic copy for the new-chat home (round 34, item 5).
 *
 * Two rotating pools, both translated with the UI so a Korean user never gets an
 * English greeting or starter on their behalf:
 *   - the GREETING line (time-of-day aware, ~30 variations), shown as the serif
 *     hero line;
 *   - the PROMPT STARTER hint (~30 tangible, do-this-for-that suggestions),
 *     shown as the quiet sub-line and seeded as the composer placeholder.
 *
 * There is no genuine per-user NAME signal on this surface -- the only connected
 * account label is the fixed brand string "Redrob" (desk.account_name), which is
 * not the person's name -- so the greetings are deliberately name-less rather
 * than fabricating one. The "based on previous chats" steer (Q5b) is honoured by
 * biasing the starter hint toward the kind of work the person's recent session
 * TITLES show, falling back to the neutral rotation when there is no history.
 *
 * Pure functions + i18n KEY lists only (no `t()` at module load, which would
 * freeze the first-loaded locale); the component resolves the keys.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function timeOfDay(date: Date): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

/**
 * Greeting i18n keys. The first four are the time-of-day openers; the rest are
 * time-neutral warm lines. All are name-less (see module note). ~30 total.
 */
export const GREETING_KEYS = {
  morning: "hero.greeting_morning",
  afternoon: "hero.greeting_afternoon",
  evening: "hero.greeting_evening",
  night: "hero.greeting_night",
} as const;

export const GREETING_NEUTRAL_KEYS: readonly string[] = [
  "hero.greeting_neutral_1",
  "hero.greeting_neutral_2",
  "hero.greeting_neutral_3",
  "hero.greeting_neutral_4",
  "hero.greeting_neutral_5",
  "hero.greeting_neutral_6",
  "hero.greeting_neutral_7",
  "hero.greeting_neutral_8",
  "hero.greeting_neutral_9",
  "hero.greeting_neutral_10",
  "hero.greeting_neutral_11",
  "hero.greeting_neutral_12",
  "hero.greeting_neutral_13",
  "hero.greeting_neutral_14",
  "hero.greeting_neutral_15",
  "hero.greeting_neutral_16",
  "hero.greeting_neutral_17",
  "hero.greeting_neutral_18",
  "hero.greeting_neutral_19",
  "hero.greeting_neutral_20",
  "hero.greeting_neutral_21",
  "hero.greeting_neutral_22",
  "hero.greeting_neutral_23",
  "hero.greeting_neutral_24",
  "hero.greeting_neutral_25",
  "hero.greeting_neutral_26",
];

/**
 * Prompt-starter i18n keys, each a tangible "do X for Y" suggestion. ~30 total.
 * Grouped by a coarse work KIND so the "based on previous chats" bias can pick a
 * matching group; `general` is the neutral fallback.
 */
export const STARTER_GROUPS: Record<string, readonly string[]> = {
  writing: [
    "hero.starter_writing_1",
    "hero.starter_writing_2",
    "hero.starter_writing_3",
    "hero.starter_writing_4",
  ],
  docs: [
    "hero.starter_docs_1",
    "hero.starter_docs_2",
    "hero.starter_docs_3",
    "hero.starter_docs_4",
  ],
  data: [
    "hero.starter_data_1",
    "hero.starter_data_2",
    "hero.starter_data_3",
    "hero.starter_data_4",
  ],
  research: [
    "hero.starter_research_1",
    "hero.starter_research_2",
    "hero.starter_research_3",
  ],
  code: [
    "hero.starter_code_1",
    "hero.starter_code_2",
    "hero.starter_code_3",
  ],
  planning: [
    "hero.starter_planning_1",
    "hero.starter_planning_2",
    "hero.starter_planning_3",
  ],
  general: [
    "hero.starter_general_1",
    "hero.starter_general_2",
    "hero.starter_general_3",
    "hero.starter_general_4",
    "hero.starter_general_5",
    "hero.starter_general_6",
  ],
};

/** Flat list of every starter key, for coverage checks and the neutral rotation. */
export const ALL_STARTER_KEYS: readonly string[] = Object.values(STARTER_GROUPS).flat();

/** Keyword hints that map a recent session TITLE to a starter group. */
const GROUP_HINTS: Record<string, readonly string[]> = {
  writing: ["write", "draft", "email", "letter", "post", "blog", "copy", "essay", "story", "작성", "글", "이메일", "편지"],
  docs: ["doc", "document", "report", "memo", "contract", "nda", "agreement", "summary", "pdf", "문서", "보고서", "계약", "요약"],
  data: ["data", "spreadsheet", "sheet", "csv", "chart", "table", "analysis", "analyse", "analyze", "numbers", "데이터", "표", "분석", "차트"],
  research: ["research", "find", "compare", "sources", "study", "benchmark", "리서치", "조사", "비교"],
  code: ["code", "bug", "fix", "refactor", "api", "script", "function", "test", "코드", "버그", "수정"],
  planning: ["plan", "schedule", "roadmap", "todo", "task", "organize", "organise", "계획", "일정", "정리"],
};

/**
 * Pick the starter group that best matches the person's recent session titles.
 * Returns `"general"` when there is no history or nothing matches, so the hint
 * never claims a focus the chats do not show.
 */
export function starterGroupForHistory(recentTitles: readonly string[]): string {
  if (!recentTitles.length) return "general";
  const counts: Record<string, number> = {};
  for (const rawTitle of recentTitles) {
    const title = rawTitle.toLowerCase();
    for (const [group, hints] of Object.entries(GROUP_HINTS)) {
      if (hints.some((hint) => title.includes(hint))) {
        counts[group] = (counts[group] ?? 0) + 1;
      }
    }
  }
  let best = "general";
  let bestCount = 0;
  for (const [group, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = group;
      bestCount = count;
    }
  }
  return best;
}

/** Deterministic index into a list from a rotation seed (stable per render). */
function pick(length: number, seed: number): number {
  if (length <= 0) return 0;
  return ((seed % length) + length) % length;
}

/**
 * Resolve the greeting KEY for a given time + rotation seed. The first render of
 * a session uses the time-of-day opener; the seed then rotates through the
 * neutral warm lines, so a long-lived home does not show the same line forever.
 */
export function greetingKeyFor(now: Date, seed: number): string {
  // Seed 0 (first paint) always gets the time-of-day opener; other seeds rotate
  // the neutral pool. This keeps the first impression time-appropriate.
  if (seed % 5 === 0) return GREETING_KEYS[timeOfDay(now)];
  const idx = pick(GREETING_NEUTRAL_KEYS.length, seed);
  return GREETING_NEUTRAL_KEYS[idx] ?? GREETING_NEUTRAL_KEYS[0];
}

/** Resolve the starter KEY for a work group + rotation seed. */
export function starterKeyFor(group: string, seed: number): string {
  const pool = STARTER_GROUPS[group] ?? STARTER_GROUPS.general;
  const idx = pick(pool.length, seed);
  return pool[idx] ?? STARTER_GROUPS.general[0];
}
