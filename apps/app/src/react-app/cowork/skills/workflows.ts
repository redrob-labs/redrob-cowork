import { t } from "../../../i18n";
import { skillDisplayTitle, type SkillRow } from "./skills";

/*
 * WORKFLOWS ("The whole job, one set") on the Skills page. A workflow is one skill family of the
 * Console catalogue: the skills whose SKILL.md carries the same `metadata.category` (named in
 * Korean by `metadata.category_ko`), in their `metadata.step` order. Skills that share a step are
 * alternatives. The format is redrob-console PR #305's; nothing is curated here, so a family the
 * Console adds appears on its own. A skill with no category is in no workflow.
 */

/**
 * The families in the Console's own order (console PR #305). A family the Console adds later
 * follows these, in the order its first skill appears.
 */
const CATEGORY_ORDER: readonly string[] = [
  "Natural writing",
  "(Korean) Research papers",
  "(Korean) Civil cases",
  "(Korean) Criminal cases",
  "(Korean) Patents",
  "(Korean) Accounting and audit",
  "(Korean) Consulting",
  "(Korean) Venture capital",
  "(Korean) News and PR",
  "Design",
  "(Korean) File conversion",
];

/** One workflow: a catalogue skill family and its skills in run order. */
export type Workflow = {
  /** Route-safe id from the English family name, e.g. `korean-patents`. */
  id: string;
  /** The English family name (`metadata.category`). */
  category: string;
  /** The Korean family name (`metadata.category_ko`), when the catalogue gives one. */
  categoryKo?: string;
  /** The family's skills: by step, then alternatives on one step by title. */
  rows: SkillRow[];
};

/** A family's route id: its English name in kebab case. */
function workflowId(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** A family's place on the shelf: its index in CATEGORY_ORDER, or after all of them. */
function categoryRank(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

/** Every family the rows carry, in shelf order; ungrouped skills are left out. */
export function availableWorkflows(rows: readonly SkillRow[], locale: string): Workflow[] {
  // Map keys keep first-appearance order and the sort is stable, so unknown families stay in that order.
  const groups = new Map<string, SkillRow[]>();
  for (const row of rows) {
    const category = row.category?.trim();
    if (!category) continue;
    const members = groups.get(category);
    if (members) members.push(row);
    else groups.set(category, [row]);
  }
  return [...groups.keys()]
    .sort((a, b) => categoryRank(a) - categoryRank(b))
    .map((category) => {
      const members = groups.get(category) ?? [];
      const categoryKo = members.find((row) => row.categoryKo?.trim())?.categoryKo?.trim();
      members.sort((a, b) =>
        (a.step ?? Number.MAX_SAFE_INTEGER) - (b.step ?? Number.MAX_SAFE_INTEGER)
        || skillDisplayTitle(a, locale).localeCompare(skillDisplayTitle(b, locale), locale));
      return { id: workflowId(category), category, ...(categoryKo ? { categoryKo } : {}), rows: members };
    });
}

/** The workflow with this route id, or null when the rows carry no such family. Groups only that family's rows. */
export function findWorkflow(id: string, rows: readonly SkillRow[], locale: string): Workflow | null {
  const members = rows.filter((row) => {
    const category = row.category?.trim();
    return category ? workflowId(category) === id : false;
  });
  return availableWorkflows(members, locale)[0] ?? null;
}

/** The family name in the app language (Korean falls back to English). */
export function workflowTitle(workflow: Pick<Workflow, "category" | "categoryKo">, locale: string): string {
  return locale.startsWith("ko") ? workflow.categoryKo ?? workflow.category : workflow.category;
}

/** `/skills/workflow/<id>`. */
export function workflowPath(id: string): string {
  return `/skills/workflow/${encodeURIComponent(id)}`;
}

/** One heading's worth of a workflow page: a step (null when unnumbered) and its skills. */
export type WorkflowGroup = { step: number | null; rows: SkillRow[] };

/** A workflow's rows (already in run order) grouped by step; alternatives share a group. */
export function workflowGroups(rows: readonly SkillRow[]): WorkflowGroup[] {
  const groups: WorkflowGroup[] = [];
  for (const row of rows) {
    const step = row.step ?? null;
    const last = groups[groups.length - 1];
    if (last && last.step === step) last.rows.push(row);
    else groups.push({ step, rows: [row] });
  }
  return groups;
}

/** The localized step heading, e.g. "Step 2". */
export function workflowStepLabel(step: number): string {
  return t("cowork.skills_workflow_step", { step });
}

/** The skill names of a workflow not yet installed, in run order. */
export function missingSkills(rows: readonly SkillRow[]): string[] {
  return rows.filter((row) => row.installed === null).map((row) => row.name);
}

/** Search text for a workflow: both family names, plus its skills' titles in this locale. */
export function workflowSearchText(workflow: Workflow, locale: string): string {
  return [workflow.category, workflow.categoryKo ?? "", ...workflow.rows.map((row) => skillDisplayTitle(row, locale))].join(" ");
}
