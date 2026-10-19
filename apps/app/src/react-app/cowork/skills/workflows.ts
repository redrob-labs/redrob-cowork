import { t } from "../../../i18n";
import { skillDisplayTitle, type SkillRow } from "./skills";

/*
 * Featured WORKFLOWS on the Skills page. A workflow is one job (for example drafting a
 * lawyer's contracts) made of several catalogue skills to pick from. The public catalogue
 * (console.redrob.ai/skills/index.json) carries no grouping, so the groups are curated here, on the
 * frontend, by stable skill name. Not every catalogue skill belongs to a workflow: only coherent jobs
 * are featured, and every skill stays reachable from Search (Ctrl+K).
 *
 * Legal, accounting and investing workflows hold both United States and Korean skills; the workflow
 * page groups them by jurisdiction with the person's language first. A name the live catalogue does
 * not have is skipped, and a workflow with fewer than two available skills is hidden.
 */

/** Every featured workflow, in shelf order. */
export const WORKFLOW_IDS = [
  "legal-drafting",
  "vc-deal",
  "acct-close",
  "office",
  "legal-disputes",
  "acct-tax",
  "vc-captable",
  "acct-audit",
  "legal-company",
  "vc-fund",
] as const;
/** One of `WORKFLOW_IDS`. */
export type WorkflowId = (typeof WORKFLOW_IDS)[number];

/** Shelf order follows WORKFLOW_IDS; each list is in the order the workflow page shows it. */
export const WORKFLOW_SKILLS: Record<WorkflowId, readonly string[]> = {
  "legal-drafting": [
    "us-lawyer-nda",
    "us-lawyer-master-services-agreement",
    "us-lawyer-engagement-letter",
    "us-lawyer-offer-letter-piia",
    "kr-lawyer-nda",
    "kr-lawyer-service-agreement",
    "kr-lawyer-employment-rules",
    "kr-lawyer-shareholders-agreement",
    "kr-lawyer-stock-option-agreement",
  ],
  "vc-deal": [
    "us-vc-screening-pass-email",
    "us-vc-data-room-ddq",
    "us-vc-diligence-summary",
    "us-vc-investment-memo",
    "us-vc-term-sheet-review",
    "us-vc-safe-convertible-analysis",
    "us-vc-side-letter-review",
    "us-vc-management-rights-letter",
    "kr-vc-deal-screening",
    "kr-vc-decline-message",
    "kr-vc-diligence-summary",
    "kr-vc-investment-memo",
    "kr-vc-term-sheet-review",
    "kr-vc-rcps-cb-safe-analysis",
  ],
  "acct-close": [
    "us-accountant-bank-reconciliation",
    "us-accountant-adjusting-entries",
    "us-accountant-financial-statements",
    "us-accountant-variance-analysis",
    "kr-accountant-account-reconciliation",
    "kr-accountant-adjusting-entries",
    "kr-accountant-financial-statements",
    "kr-accountant-financial-ratios",
  ],
  office: ["documents-docx", "spreadsheets-xlsx", "presentations-pptx", "pdf", "hangul-hwpx"],
  "legal-disputes": [
    "us-lawyer-contract-review",
    "us-lawyer-demand-letter",
    "us-lawyer-cease-and-desist",
    "us-lawyer-litigation-hold",
    "kr-lawyer-contract-review",
    "kr-lawyer-demand-letter",
    "kr-lawyer-complaint-and-answer",
    "kr-lawyer-legal-opinion",
    "kr-lawyer-provisional-remedies",
  ],
  "acct-tax": [
    "us-accountant-book-to-tax",
    "us-accountant-form-1040-schedule-c",
    "us-accountant-sales-tax-nexus-memo",
    "us-accountant-rnd-credit-memo",
    "kr-accountant-vat-return",
    "kr-accountant-corporate-tax-adjustment",
    "kr-accountant-year-end-settlement",
    "kr-accountant-capital-gains-tax",
    "kr-accountant-inheritance-gift-tax",
    "kr-accountant-deemed-interest-memo",
    "kr-accountant-entertainment-expense",
  ],
  "vc-captable": [
    "us-vc-cap-table-dilution",
    "us-vc-option-pool-analysis",
    "us-vc-409a-valuation-review",
    "kr-vc-cap-table-dilution",
    "kr-vc-option-pool-design",
    "kr-vc-redemption-conversion",
  ],
  "acct-audit": [
    "us-accountant-audit-workpaper",
    "us-accountant-sox-narrative",
    "us-accountant-mdna-memo",
    "us-accountant-asc606-revenue-memo",
    "us-accountant-asc842-lease-memo",
    "kr-accountant-audit-workpaper",
    "kr-accountant-variance-icfr-memo",
  ],
  "legal-company": [
    "us-lawyer-certificate-of-incorporation",
    "us-lawyer-board-written-consent",
    "us-lawyer-83b-election",
    "kr-lawyer-articles-of-incorporation",
    "kr-lawyer-corporate-minutes",
  ],
  "vc-fund": [
    "us-vc-lp-update-letter",
    "us-vc-asc820-valuation-memo",
    "kr-vc-lp-report",
    "kr-vc-fund-agreement",
    "kr-vc-fund-of-funds-proposal",
    "kr-vc-carried-interest",
  ],
};

/** Literal i18n keys per workflow, so the audit sees static t() calls. */
const WORKFLOW_TEXT: Record<WorkflowId, { title: () => string; sub: () => string }> = {
  "legal-drafting": { title: () => t("cowork.skills_workflow_legal_drafting_title"), sub: () => t("cowork.skills_workflow_legal_drafting_sub") },
  "vc-deal": { title: () => t("cowork.skills_workflow_vc_deal_title"), sub: () => t("cowork.skills_workflow_vc_deal_sub") },
  "acct-close": { title: () => t("cowork.skills_workflow_accounting_close_title"), sub: () => t("cowork.skills_workflow_accounting_close_sub") },
  office: { title: () => t("cowork.skills_workflow_office_title"), sub: () => t("cowork.skills_workflow_office_sub") },
  "legal-disputes": { title: () => t("cowork.skills_workflow_legal_disputes_title"), sub: () => t("cowork.skills_workflow_legal_disputes_sub") },
  "acct-tax": { title: () => t("cowork.skills_workflow_accounting_tax_title"), sub: () => t("cowork.skills_workflow_accounting_tax_sub") },
  "vc-captable": { title: () => t("cowork.skills_workflow_vc_captable_title"), sub: () => t("cowork.skills_workflow_vc_captable_sub") },
  "acct-audit": { title: () => t("cowork.skills_workflow_accounting_audit_title"), sub: () => t("cowork.skills_workflow_accounting_audit_sub") },
  "legal-company": { title: () => t("cowork.skills_workflow_legal_company_title"), sub: () => t("cowork.skills_workflow_legal_company_sub") },
  "vc-fund": { title: () => t("cowork.skills_workflow_vc_fund_title"), sub: () => t("cowork.skills_workflow_vc_fund_sub") },
};

/** Narrows a route param to a known workflow id. */
export function isWorkflowId(id: string): id is WorkflowId {
  return (WORKFLOW_IDS as readonly string[]).includes(id);
}

/** The workflow's localized title. */
export function workflowTitle(id: WorkflowId): string {
  return WORKFLOW_TEXT[id].title();
}

/** The workflow's localized one-line description. */
export function workflowSub(id: WorkflowId): string {
  return WORKFLOW_TEXT[id].sub();
}

/** `/skills/workflow/<id>`. */
export function workflowPath(id: WorkflowId): string {
  return `/skills/workflow/${encodeURIComponent(id)}`;
}

/** The country a skill's law is written for. */
export type Jurisdiction = "us" | "kr";

/** Which country's law a skill is written for, from its stable name; null when it is not country-specific. */
export function skillJurisdiction(name: string): Jurisdiction | null {
  if (name.startsWith("us-")) return "us";
  if (name.startsWith("kr-")) return "kr";
  return null;
}

/** A workflow's available rows, in curated order. Names the live catalogue lacks are skipped. */
export function workflowRows(id: WorkflowId, rows: readonly SkillRow[]): SkillRow[] {
  const byName = new Map(rows.map((row) => [row.name, row]));
  return WORKFLOW_SKILLS[id].flatMap((name) => {
    const row = byName.get(name);
    return row ? [row] : [];
  });
}

/** The workflows worth showing: at least two of their skills are available. */
export function availableWorkflows(rows: readonly SkillRow[]): Array<{ id: WorkflowId; rows: SkillRow[] }> {
  return WORKFLOW_IDS.flatMap((id) => {
    const members = workflowRows(id, rows);
    return members.length >= 2 ? [{ id, rows: members }] : [];
  });
}

/** One heading's worth of a workflow page: a jurisdiction (or none) and its rows. */
export type WorkflowGroup = { jurisdiction: Jurisdiction | null; rows: SkillRow[] };

/**
 * A workflow's rows grouped for its page: United States and Korea, with the person's own first
 * (Korean UI shows Korea first). A workflow with no country-specific skills is one unnamed group.
 */
export function workflowGroups(rows: readonly SkillRow[], locale: string): WorkflowGroup[] {
  const order: Jurisdiction[] = locale.startsWith("ko") ? ["kr", "us"] : ["us", "kr"];
  const groups = order.flatMap((jurisdiction) => {
    const members = rows.filter((row) => skillJurisdiction(row.name) === jurisdiction);
    return members.length ? [{ jurisdiction, rows: members }] : [];
  });
  const general = rows.filter((row) => skillJurisdiction(row.name) === null);
  if (!groups.length) return general.length ? [{ jurisdiction: null, rows: general }] : [];
  return general.length ? [...groups, { jurisdiction: null, rows: general }] : groups;
}

/** The workflow's rows in page order (the person's jurisdiction first), e.g. for the cover mosaic. */
export function workflowOrderedRows(rows: readonly SkillRow[], locale: string): SkillRow[] {
  return workflowGroups(rows, locale).flatMap((group) => group.rows);
}

/** The localized group heading. */
export function jurisdictionLabel(jurisdiction: Jurisdiction): string {
  return jurisdiction === "us" ? t("cowork.skills_workflow_group_us") : t("cowork.skills_workflow_group_kr");
}

/** The skill names of a workflow not yet installed, in page order. */
export function missingSkills(rows: readonly SkillRow[], locale: string): string[] {
  return workflowOrderedRows(rows, locale).filter((row) => row.installed === null).map((row) => row.name);
}

/** Search text for a workflow: its title and sub, plus its member skills' titles in this locale. */
export function workflowSearchText(id: WorkflowId, rows: readonly SkillRow[], locale: string): string {
  return [workflowTitle(id), workflowSub(id), ...workflowRows(id, rows).map((row) => skillDisplayTitle(row, locale))].join(" ");
}
