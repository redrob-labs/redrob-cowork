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
export type RerankTask = { id: string; traits: Trait[] };

/**
 * Per-profession task menus. "overall" is implicit (the bespoke order) and prepended by the UI. Each
 * task id maps to a `desk.chart_task_<id>` label. Tasks are the manpower-heavy, high-AI-impact ones
 * for that role, drawn from the research cluster above.
 */
export const PROFESSION_TASKS: Record<string, RerankTask[]> = {
  engineer: [
    { id: "write-code", traits: ["coding"] },
    { id: "debug", traits: ["coding", "reasoning"] },
    { id: "code-review", traits: ["coding", "docs"] },
    { id: "write-docs", traits: ["writing", "docs"] },
    { id: "architecture", traits: ["reasoning"] },
  ],
  marketer: [
    { id: "copywriting", traits: ["writing"] },
    { id: "campaign-ideas", traits: ["writing", "reasoning"] },
    { id: "social-posts", traits: ["writing", "speed"] },
    { id: "localize", traits: ["multilingual"] },
    { id: "analyze-funnel", traits: ["reasoning", "docs"] },
  ],
  pm: [
    { id: "write-specs", traits: ["writing", "reasoning"] },
    { id: "summarize-feedback", traits: ["docs"] },
    { id: "roadmap", traits: ["reasoning"] },
    { id: "status-updates", traits: ["writing", "speed"] },
    { id: "competitive-research", traits: ["docs", "reasoning"] },
  ],
  designer: [
    { id: "generate-imagery", traits: ["reasoning"] },
    { id: "copy-ux", traits: ["writing"] },
    { id: "ideate", traits: ["reasoning", "writing"] },
    { id: "spec-handoff", traits: ["docs", "writing"] },
    { id: "localize", traits: ["multilingual"] },
  ],
  founder: [
    { id: "draft-anything", traits: ["writing"] },
    { id: "research-market", traits: ["docs", "reasoning"] },
    { id: "ship-code", traits: ["coding"] },
    { id: "investor-updates", traits: ["writing", "reasoning"] },
    { id: "fast-answers", traits: ["speed"] },
  ],
  sales: [
    { id: "outreach", traits: ["writing", "speed"] },
    { id: "follow-ups", traits: ["writing"] },
    { id: "research-accounts", traits: ["docs", "reasoning"] },
    { id: "proposals", traits: ["writing", "reasoning"] },
    { id: "localize", traits: ["multilingual"] },
  ],
  analyst: [
    { id: "analyze-data", traits: ["reasoning", "docs"] },
    { id: "build-models", traits: ["reasoning", "coding"] },
    { id: "report-writing", traits: ["writing", "docs"] },
    { id: "clean-data", traits: ["coding", "speed"] },
    { id: "forecast", traits: ["reasoning"] },
  ],
  consultant: [
    { id: "build-decks", traits: ["writing", "reasoning"] },
    { id: "frameworks", traits: ["reasoning"] },
    { id: "research-market", traits: ["docs", "reasoning"] },
    { id: "client-writing", traits: ["writing"] },
    { id: "synthesize-docs", traits: ["docs"] },
  ],
  lawyer: [
    { id: "contract-review", traits: ["docs", "reasoning"] },
    { id: "legal-research", traits: ["docs"] },
    { id: "drafting", traits: ["writing", "reasoning"] },
    { id: "due-diligence", traits: ["docs", "reasoning"] },
    { id: "client-comms", traits: ["writing"] },
  ],
  accountant: [
    { id: "reconcile", traits: ["reasoning", "docs"] },
    { id: "analyze-data", traits: ["reasoning", "docs"] },
    { id: "report-writing", traits: ["writing", "docs"] },
    { id: "process-docs", traits: ["docs", "speed"] },
    { id: "spreadsheets", traits: ["reasoning", "coding"] },
  ],
  investor: [
    { id: "due-diligence", traits: ["docs", "reasoning"] },
    { id: "analyze-data", traits: ["reasoning", "docs"] },
    { id: "research-market", traits: ["docs"] },
    { id: "memos", traits: ["writing", "reasoning"] },
    { id: "fast-answers", traits: ["speed"] },
  ],
  hr: [
    { id: "job-posts", traits: ["writing"] },
    { id: "policy-writing", traits: ["writing", "docs"] },
    { id: "screen-resumes", traits: ["docs", "speed"] },
    { id: "employee-comms", traits: ["writing"] },
    { id: "localize", traits: ["multilingual"] },
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
