import type { RedrobSkillItem } from "../../../app/lib/redrob-server";
import type { CoworkSkill, LibrarySkill, SkillDetail, SkillDisplayFields, SkillDraft, SkillOrigin, SkillTags, SkillTaxonomy, TeamSkillsState } from "../services/types";
import { catalogueDisplay } from "./console-catalogue";

/*
 * Skills are SKILL.md files (the agentskills.io specification) in the workspace's
 * `.opencode/skills/<name>/`: a name, a description the assistant reads to decide when to use the
 * skill, and instructions. The Redrob Console marks the ones it supplies in `metadata.source`.
 */

/** `/skill/<name>` with a route-safe stable skill name. */
export function skillPath(name: string): string {
  return `/skill/${encodeURIComponent(name)}`;
}

/** Where people manage their team's skills. */
export const CONSOLE_SKILLS_URL = "https://console.redrob.ai/skills";

export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;

/** A team skill is one the Console's team sync wrote; a library one says so; the rest are the person's. */
export function skillOrigin(item: Pick<RedrobSkillItem, "name" | "metadata">, team: Pick<TeamSkillsState, "installed"> | null): SkillOrigin {
  if (item.metadata?.source === "team" || team?.installed.includes(item.name)) return "team";
  return item.metadata?.source === "library" ? "library" : "mine";
}

export function tagsOf(source: { profession?: string | null; task?: string | null; language?: string | null } | undefined): SkillTags {
  return {
    ...(source?.profession ? { profession: source.profession } : {}),
    ...(source?.task ? { task: source.task } : {}),
    ...(source?.language ? { language: source.language } : {}),
  };
}

export function coworkSkillFrom(item: RedrobSkillItem, team: Pick<TeamSkillsState, "installed"> | null): CoworkSkill {
  return { name: item.name, description: item.description, origin: skillOrigin(item, team), tags: tagsOf(item.metadata), scope: item.scope };
}

/** The instructions of a SKILL.md: everything after the frontmatter. */
export function skillBody(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

/**
 * The SKILL.md for a skill of the person's own. The description is written as a JSON string, which
 * is also a YAML double-quoted scalar, so colons and quotes in it stay text. Tags are taxonomy ids.
 */
export function skillContent(draft: SkillDraft): string {
  const keys: Array<keyof SkillTags> = ["profession", "task", "language"];
  const tags = keys.flatMap((key) => (draft[key] ? [`  ${key}: ${draft[key]}`] : []));
  return [
    "---",
    `name: ${draft.name}`,
    `description: ${JSON.stringify(draft.description.trim())}`,
    ...(tags.length ? ["metadata:", ...tags] : []),
    "---",
    "",
    draft.instructions.trim(),
    "",
  ].join("\n");
}

/** A name from a title as it is typed: "Weekly client update" as "weekly-client-update". */
export function skillSlug(title: string): string {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/, "");
}

export function isValidSkillName(name: string): boolean {
  return name.length <= SKILL_NAME_MAX && SKILL_NAME_PATTERN.test(name);
}

export function canSaveSkill(draft: SkillDraft): boolean {
  const description = draft.description.trim();
  return isValidSkillName(draft.name) && description.length > 0 && description.length <= SKILL_DESCRIPTION_MAX && draft.instructions.trim().length > 0;
}

/** A row on the Skills screen. */
export type SkillRow = SkillDisplayFields & {
  name: string;
  description: string;
  tags: SkillTags;
  origin: SkillOrigin;
  /** The installed record, or null for a catalogue skill this workspace has not added. */
  installed: CoworkSkill | null;
};

/** The artwork tones a skill icon can take. */
export const SKILL_TONES = ["blue", "sky", "teal", "green", "violet", "pink", "red", "orange"] as const;
/** One of `SKILL_TONES`. */
export type SkillTone = (typeof SKILL_TONES)[number];

/** FNV-1a 32-bit over the stable name, so a skill keeps one colour everywhere. */
export function skillTone(name: string): SkillTone {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return SKILL_TONES[hash % SKILL_TONES.length] ?? "blue";
}

/** Which group a skill belongs to: the person's installed skills, a profession, or everyday. */
export type SkillShelfId = "yours" | "lawyer" | "accountant" | "vc" | "everyday";

/** The group a row belongs to; drives the Your skills shelf and the detail page's category badge. */
export function skillShelf(row: Pick<SkillRow, "name" | "tags" | "installed">): SkillShelfId {
  if (row.installed !== null) return "yours";
  if (/^(us|kr)-lawyer-/.test(row.name) || row.tags.profession === "lawyer") return "lawyer";
  if (/^(us|kr)-accountant-/.test(row.name) || row.tags.profession === "accountant") return "accountant";
  if (/^(us|kr)-vc-/.test(row.name) || row.tags.profession === "vc") return "vc";
  return "everyday";
}

/** Localized display title with catalogue fields preferred over the route slug. */
export function skillDisplayTitle(row: { name: string; title?: string; titleKo?: string }, locale: string): string {
  return (locale.startsWith("ko") ? row.titleKo ?? row.title : row.title) ?? row.name;
}

/** The first sentence of a description, split on Latin or CJK sentence ends. */
function firstSentence(text: string): string {
  return text.trim().split(/(?<=[.!?。！？])\s+/u)[0]?.trim() ?? "";
}

/** Catalogue summary, or the description's first sentence in full when the catalogue has none. */
export function skillBrief(row: { summary?: string; summaryKo?: string; description: string }, locale: string): string {
  const korean = locale.startsWith("ko");
  const summary = korean ? row.summaryKo ?? row.summary : row.summary;
  if (summary?.trim()) return summary.trim();
  const sentence = firstSentence(row.description).replace(/^Use when the user asks to\s+/i, "").replace(/^Use when\s+/i, "").trim();
  if (!sentence) return row.description.trim();
  if (korean) return sentence;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Sub-pixel tolerance so a shelf at its edge never keeps a chevron with nothing left to reveal. */
const SHELF_EDGE_EPSILON = 2;

/** Whether a horizontal shelf can scroll back or forward from its current position. */
export function shelfEdges(scrollLeft: number, scrollWidth: number, clientWidth: number): { canPrev: boolean; canNext: boolean } {
  const overflow = scrollWidth - clientWidth > SHELF_EDGE_EPSILON;
  return {
    canPrev: overflow && scrollLeft > SHELF_EDGE_EPSILON,
    canNext: overflow && scrollLeft < scrollWidth - clientWidth - SHELF_EDGE_EPSILON,
  };
}

const ORIGIN_ORDER: Record<SkillOrigin, number> = { team: 0, mine: 1, library: 2 };

/**
 * Installed skills first in origin order, then library entries not already installed.
 * Catalogue display fields fill gaps in installed records without replacing local values.
 */
export function skillRows(input: { installed: readonly CoworkSkill[]; library: readonly LibrarySkill[] | null }): SkillRow[] {
  const libraryByName = new Map(input.library?.map((skill) => [skill.name, skill]));
  const installed = input.installed
    .map((skill) => ({ ...libraryByName.get(skill.name), ...skill, tags: skill.tags }))
    .sort((a, b) => ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin] || a.name.localeCompare(b.name))
    .map((skill): SkillRow => ({ ...skill, installed: skill }));
  if (!input.library) return installed;
  const names = new Set(input.installed.map((skill) => skill.name));
  const available = input.library
    .filter((skill) => !names.has(skill.name))
    .map((skill): SkillRow => ({ ...skill, origin: "library", installed: null }));
  return [...installed, ...available];
}

/** The localized language tag, or null when this skill has no known language. */
export function languageTagLabel(tags: SkillTags, taxonomy: SkillTaxonomy | null, locale: string): string | null {
  const language = taxonomy?.languages.find((entry) => entry.id === tags.language);
  if (!language) return null;
  return locale.startsWith("ko") ? language.label.ko : language.label.en;
}

/** The taxonomy's words for a skill's tags, in the person's language (Korean or English). */
export function tagLabels(tags: SkillTags, taxonomy: SkillTaxonomy | null, locale: string): string[] {
  if (!taxonomy) return [];
  const pick = (label: { en: string; ko: string }) => (locale.startsWith("ko") ? label.ko : label.en);
  const profession = taxonomy.professions.find((entry) => entry.id === tags.profession);
  const task = profession?.tasks.find((entry) => entry.id === tags.task);
  const language = taxonomy.languages.find((entry) => entry.id === tags.language);
  return [profession, task, language].flatMap((entry) => (entry ? [pick(entry.label)] : []));
}

/**
 * A skill page's first frame, built from what is already in memory (the catalogue entry from
 * `consoleCatalogue.peek` and the cached installed list), so opening a skill paints its real page at
 * once instead of a slug title over a grey skeleton. Null when neither knows it. The installed
 * skill's own display fields win over the catalogue's, as they do in `skillRows`.
 */
export function seedSkillDetail(
  name: string,
  catalogue: SkillDetail | null,
  installed: readonly CoworkSkill[] | null,
): SkillDetail | null {
  const mine = installed?.find((skill) => skill.name === name) ?? null;
  if (!mine) return catalogue ? { ...catalogue, installed: null } : null;
  return {
    ...(catalogue ? catalogueDisplay(catalogue) : {}),
    ...catalogueDisplay(mine),
    name,
    description: mine.description,
    tags: mine.tags,
    body: catalogue?.body ?? "",
    installed: { origin: mine.origin, scope: mine.scope },
  };
}

/** What Run sends: the skill by name. */
export function skillRunPrompt(name: string): string {
  return `Use the \`${name}\` skill.`;
}

/** Who may change or remove a skill here: never a team's, never one outside the project. */
/** Team skills are the Console's; skills in other global dirs are only shown. */
export function canRemoveSkill(skill: Pick<CoworkSkill, "origin" | "scope">): boolean {
  return skill.origin !== "team" && skill.scope !== "global";
}

export function canEditSkill(skill: Pick<CoworkSkill, "origin" | "scope">): boolean {
  return skill.origin === "mine" && skill.scope !== "global";
}
