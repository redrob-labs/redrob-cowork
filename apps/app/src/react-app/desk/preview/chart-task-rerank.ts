import { CHART_MODELS } from "./chart-models";

/**
 * Task-aware reranking for the "Picked for your profession" charts (round 30).
 *
 * The user asked for a dropdown of the highest-AI-impact, manpower-heavy tasks that reranks a
 * profession's top-10 by the SELECTED task. Rather than hand-maintain 12 professions x N tasks x 10
 * models of ordering, we rerank by a small, honest model-trait vector: each task leans on one or two
 * traits, and each model carries trait affinities. "overall" keeps the chart's bespoke order.
 *
 * Research basis (Anthropic Economic Index + Stanford/Brookings/HBS labor studies, 2025-26): the
 * tasks AI most displaces in knowledge work cluster around writing, coding, data analysis, research /
 * document review, and customer communication. Each profession below surfaces the subset that is
 * actually manpower-heavy for that role.
 */

/** The traits a task can lean on. Values are 0-10 per model. */
export type Trait = "coding" | "writing" | "reasoning" | "docs" | "multilingual" | "speed";

/**
 * Explicit trait vectors for models with a clear specialty; everything else falls back to a profile
 * derived from the model's needleScore (its reasoning/doc strength) so the table stays small and the
 * rerank is never undefined. Only deviations from "a solid generalist at this tier" are listed.
 */
const MODEL_TRAITS: Record<string, Partial<Record<Trait, number>>> = {
  "gpt-6-astra": { coding: 9.6, writing: 9.3, reasoning: 9.5, docs: 9.2, multilingual: 9.0, speed: 7.5 },
  "claude-opus-5-5": { coding: 9.4, writing: 9.8, reasoning: 9.7, docs: 9.4, multilingual: 8.8, speed: 6.5 },
  "claude-fable-5-1": { writing: 9.6, reasoning: 8.2, docs: 8.0, multilingual: 8.2, speed: 7.5 },
  "claude-sonnet-5": { coding: 9.0, writing: 9.0, reasoning: 8.8, docs: 8.7, speed: 8.5 },
  "gpt-5-6-sol": { writing: 8.8, reasoning: 8.5, docs: 8.4, speed: 8.3 },
  "gemini-3-1-pro": { docs: 9.6, reasoning: 9.1, multilingual: 9.0, coding: 8.6 },
  "gemini-3-8-flash": { speed: 9.6, writing: 8.0, multilingual: 8.6, docs: 8.1 },
  "gemini-3-5-flash": { speed: 9.4, multilingual: 8.2 },
  "gpt-5-4-pro": { reasoning: 9.4, coding: 9.0, docs: 9.0 },
  "qwen3-coder-next": { coding: 9.5, reasoning: 8.0, speed: 8.2 },
  "qwen3-max": { multilingual: 9.3, reasoning: 8.3, docs: 8.4 },
  "deepseek-v4-pro": { coding: 9.0, reasoning: 8.9, docs: 8.3, speed: 8.0 },
  "deepseek-r1": { reasoning: 9.0, coding: 8.4 },
  "deepseek-v4-flash": { speed: 9.3, coding: 7.6 },
  "perplexity-sonar": { docs: 9.2, reasoning: 7.5, multilingual: 7.6 },
  "kimi-k2-6": { docs: 9.3, reasoning: 8.2, multilingual: 8.0 },
  "mistral-large-3": { multilingual: 9.2, writing: 8.4, coding: 8.0 },
  "mistral-medium-3-5": { multilingual: 8.6, speed: 8.2 },
  "command-a": { docs: 8.8, multilingual: 8.5, reasoning: 7.6 },
  "aya-expanse-2": { multilingual: 9.6, writing: 7.0 },
  "grok-4-3": { reasoning: 8.3, speed: 8.4, writing: 8.0 },
  "claude-haiku-4-5": { speed: 9.2, coding: 7.6, writing: 7.6 },
  "amazon-nova-pro": { docs: 7.6, multilingual: 7.4, speed: 8.0 },
  "jamba-2": { docs: 9.0, speed: 7.8 },
};

/** A model's score for a trait: the explicit value, else a profile anchored on its needleScore. */
function traitScore(id: string, trait: Trait): number {
  const explicit = MODEL_TRAITS[id]?.[trait];
  if (explicit !== undefined) return explicit;
  const base = CHART_MODELS[id]?.needleScore ?? 6;
  // Speed trends inverse to heavyweight reasoning; everything else tracks the general tier.
  if (trait === "speed") return Math.min(10, 15 - base);
  return base;
}

/** A task shown in the profession dropdown: its label key and the trait(s) it reranks by. */
/** `labelKey` is the static locale key for the task label (the i18n audit forbids keys built at runtime). */
export type RerankTask = { id: string; labelKey: string; traits: Trait[] };

/**
 * Per-profession task menus. "overall" is implicit (the bespoke order) and prepended by the UI. Each
 * task id maps to a `desk.chart_task_<id>` label. Tasks are the manpower-heavy, high-AI-impact ones
 * for that role, drawn from the research cluster above.
 */
export const PROFESSION_TASKS: Record<string, RerankTask[]> = {
  engineer: [
    { id: "write-code", labelKey: "desk.chart_task_write-code", traits: ["coding"] },
    { id: "debug", labelKey: "desk.chart_task_debug", traits: ["coding", "reasoning"] },
    { id: "code-review", labelKey: "desk.chart_task_code-review", traits: ["coding", "docs"] },
    { id: "write-docs", labelKey: "desk.chart_task_write-docs", traits: ["writing", "docs"] },
    { id: "architecture", labelKey: "desk.chart_task_architecture", traits: ["reasoning"] },
  ],
  marketer: [
    { id: "copywriting", labelKey: "desk.chart_task_copywriting", traits: ["writing"] },
    { id: "campaign-ideas", labelKey: "desk.chart_task_campaign-ideas", traits: ["writing", "reasoning"] },
    { id: "social-posts", labelKey: "desk.chart_task_social-posts", traits: ["writing", "speed"] },
    { id: "localize", labelKey: "desk.chart_task_localize", traits: ["multilingual"] },
    { id: "analyze-funnel", labelKey: "desk.chart_task_analyze-funnel", traits: ["reasoning", "docs"] },
  ],
  pm: [
    { id: "write-specs", labelKey: "desk.chart_task_write-specs", traits: ["writing", "reasoning"] },
    { id: "summarize-feedback", labelKey: "desk.chart_task_summarize-feedback", traits: ["docs"] },
    { id: "roadmap", labelKey: "desk.chart_task_roadmap", traits: ["reasoning"] },
    { id: "status-updates", labelKey: "desk.chart_task_status-updates", traits: ["writing", "speed"] },
    { id: "competitive-research", labelKey: "desk.chart_task_competitive-research", traits: ["docs", "reasoning"] },
  ],
  designer: [
    { id: "generate-imagery", labelKey: "desk.chart_task_generate-imagery", traits: ["reasoning"] },
    { id: "copy-ux", labelKey: "desk.chart_task_copy-ux", traits: ["writing"] },
    { id: "ideate", labelKey: "desk.chart_task_ideate", traits: ["reasoning", "writing"] },
    { id: "spec-handoff", labelKey: "desk.chart_task_spec-handoff", traits: ["docs", "writing"] },
    { id: "localize", labelKey: "desk.chart_task_localize", traits: ["multilingual"] },
  ],
  founder: [
    { id: "draft-anything", labelKey: "desk.chart_task_draft-anything", traits: ["writing"] },
    { id: "research-market", labelKey: "desk.chart_task_research-market", traits: ["docs", "reasoning"] },
    { id: "ship-code", labelKey: "desk.chart_task_ship-code", traits: ["coding"] },
    { id: "investor-updates", labelKey: "desk.chart_task_investor-updates", traits: ["writing", "reasoning"] },
    { id: "fast-answers", labelKey: "desk.chart_task_fast-answers", traits: ["speed"] },
  ],
  sales: [
    { id: "outreach", labelKey: "desk.chart_task_outreach", traits: ["writing", "speed"] },
    { id: "follow-ups", labelKey: "desk.chart_task_follow-ups", traits: ["writing"] },
    { id: "research-accounts", labelKey: "desk.chart_task_research-accounts", traits: ["docs", "reasoning"] },
    { id: "proposals", labelKey: "desk.chart_task_proposals", traits: ["writing", "reasoning"] },
    { id: "localize", labelKey: "desk.chart_task_localize", traits: ["multilingual"] },
  ],
  analyst: [
    { id: "analyze-data", labelKey: "desk.chart_task_analyze-data", traits: ["reasoning", "docs"] },
    { id: "build-models", labelKey: "desk.chart_task_build-models", traits: ["reasoning", "coding"] },
    { id: "report-writing", labelKey: "desk.chart_task_report-writing", traits: ["writing", "docs"] },
    { id: "clean-data", labelKey: "desk.chart_task_clean-data", traits: ["coding", "speed"] },
    { id: "forecast", labelKey: "desk.chart_task_forecast", traits: ["reasoning"] },
  ],
  consultant: [
    { id: "build-decks", labelKey: "desk.chart_task_build-decks", traits: ["writing", "reasoning"] },
    { id: "frameworks", labelKey: "desk.chart_task_frameworks", traits: ["reasoning"] },
    { id: "research-market", labelKey: "desk.chart_task_research-market", traits: ["docs", "reasoning"] },
    { id: "client-writing", labelKey: "desk.chart_task_client-writing", traits: ["writing"] },
    { id: "synthesize-docs", labelKey: "desk.chart_task_synthesize-docs", traits: ["docs"] },
  ],
  lawyer: [
    { id: "contract-review", labelKey: "desk.chart_task_contract-review", traits: ["docs", "reasoning"] },
    { id: "legal-research", labelKey: "desk.chart_task_legal-research", traits: ["docs"] },
    { id: "drafting", labelKey: "desk.chart_task_drafting", traits: ["writing", "reasoning"] },
    { id: "due-diligence", labelKey: "desk.chart_task_due-diligence", traits: ["docs", "reasoning"] },
    { id: "client-comms", labelKey: "desk.chart_task_client-comms", traits: ["writing"] },
  ],
  accountant: [
    { id: "reconcile", labelKey: "desk.chart_task_reconcile", traits: ["reasoning", "docs"] },
    { id: "analyze-data", labelKey: "desk.chart_task_analyze-data", traits: ["reasoning", "docs"] },
    { id: "report-writing", labelKey: "desk.chart_task_report-writing", traits: ["writing", "docs"] },
    { id: "process-docs", labelKey: "desk.chart_task_process-docs", traits: ["docs", "speed"] },
    { id: "spreadsheets", labelKey: "desk.chart_task_spreadsheets", traits: ["reasoning", "coding"] },
  ],
  investor: [
    { id: "due-diligence", labelKey: "desk.chart_task_due-diligence", traits: ["docs", "reasoning"] },
    { id: "analyze-data", labelKey: "desk.chart_task_analyze-data", traits: ["reasoning", "docs"] },
    { id: "research-market", labelKey: "desk.chart_task_research-market", traits: ["docs"] },
    { id: "memos", labelKey: "desk.chart_task_memos", traits: ["writing", "reasoning"] },
    { id: "fast-answers", labelKey: "desk.chart_task_fast-answers", traits: ["speed"] },
  ],
  hr: [
    { id: "job-posts", labelKey: "desk.chart_task_job-posts", traits: ["writing"] },
    { id: "policy-writing", labelKey: "desk.chart_task_policy-writing", traits: ["writing", "docs"] },
    { id: "screen-resumes", labelKey: "desk.chart_task_screen-resumes", traits: ["docs", "speed"] },
    { id: "employee-comms", labelKey: "desk.chart_task_employee-comms", traits: ["writing"] },
    { id: "localize", labelKey: "desk.chart_task_localize", traits: ["multilingual"] },
  ],
};

/**
 * Rerank a profession's ten model ids by the selected task. "overall" (or an unknown task) returns the
 * list unchanged (the bespoke order). Otherwise sorts by the mean of the task's traits, descending,
 * stable on ties via the original index so the bespoke order breaks ties.
 */
export function rerankByTask(ids: string[], profession: string, taskId: string): string[] {
  if (!taskId || taskId === "overall") return ids;
  const task = PROFESSION_TASKS[profession]?.find((t) => t.id === taskId);
  if (!task) return ids;
  const score = (id: string) => task.traits.reduce((s, tr) => s + traitScore(id, tr), 0) / task.traits.length;
  return ids
    .map((id, i) => ({ id, i, s: score(id) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.id);
}
