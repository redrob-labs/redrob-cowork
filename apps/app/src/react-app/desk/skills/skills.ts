import type { RedrobSkillItem } from "../../../app/lib/redrob-server";
import type { DeskSkill, SkillDraft, SkillFilters, SkillOrigin, SkillTags, SkillTaxonomy, TeamSkillsState } from "../services/types";

/*
 * Skills are SKILL.md files (the agentskills.io specification) in the workspace's
 * `.opencode/skills/<name>/`: a name, a description the assistant reads to decide when to use the
 * skill, and instructions. The Redrob Console marks the ones it supplies in `metadata.source`.
 */

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

export function deskSkillFrom(item: RedrobSkillItem, team: Pick<TeamSkillsState, "installed"> | null): DeskSkill {
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

/** The Console's filter: every field optional, combined with AND; `q` searches the name and the description. */
export function matchesFilters(skill: { name: string; description: string; tags: SkillTags }, filters: SkillFilters): boolean {
  const query = filters.q?.trim().toLowerCase();
  return (
    (!filters.profession || skill.tags.profession === filters.profession) &&
    (!filters.task || skill.tags.task === filters.task) &&
    (!filters.language || skill.tags.language === filters.language) &&
    (!query || skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query))
  );
}

/** A row on the Skills screen. */
export type SkillRow = { name: string; description: string; tags: SkillTags; origin: SkillOrigin; installed: DeskSkill | null };

const ORIGIN_ORDER: Record<SkillOrigin, number> = { team: 0, mine: 1, library: 2 };

/**
 * The installed skills that match, team first, then the person's, then added library ones; then,
 * unless only installed ones are asked for, the library's that are not installed yet.
 */
export function skillRows(input: { installed: readonly DeskSkill[]; library: readonly { name: string; description: string; tags: SkillTags }[] | null; filters: SkillFilters; installedOnly: boolean }): SkillRow[] {
  const installed = input.installed
    .filter((skill) => matchesFilters(skill, input.filters))
    .sort((a, b) => ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin] || a.name.localeCompare(b.name))
    .map((skill): SkillRow => ({ name: skill.name, description: skill.description, tags: skill.tags, origin: skill.origin, installed: skill }));
  if (input.installedOnly || !input.library) return installed;
  const names = new Set(input.installed.map((skill) => skill.name));
  const available = input.library
    .filter((skill) => !names.has(skill.name) && matchesFilters(skill, input.filters))
    .map((skill): SkillRow => ({ ...skill, origin: "library", installed: null }));
  return [...installed, ...available];
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

/** What Run sends: the skill by name, and anything the person added. */
export function skillRunPrompt(name: string, extra = ""): string {
  const more = extra.trim();
  return more ? `Use the \`${name}\` skill.\n\n${more}` : `Use the \`${name}\` skill.`;
}

/** Who may change or remove a skill here: never a team's, never one outside the project. */
export function canRemoveSkill(skill: Pick<DeskSkill, "origin" | "scope">): boolean {
  return skill.origin !== "team" && skill.scope === "project";
}

export function canEditSkill(skill: Pick<DeskSkill, "origin" | "scope">): boolean {
  return skill.origin === "mine" && skill.scope === "project";
}
