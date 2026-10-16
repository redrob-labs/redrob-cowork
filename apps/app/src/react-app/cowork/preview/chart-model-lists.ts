import { CHART_MODELS, CHART_MODELS_RANKED } from "./chart-models";

/**
 * The 56 bespoke top-10 model lists behind the Trending AI chart-detail pages (round 26), keyed by
 * shelf section then tile id. Each is a HAND-ORDERED list of ten model ids from {@link CHART_MODELS},
 * tuned to that chart (coding charts favour code-strong models, a country favours its own makers,
 * etc.). `modelsForChart` resolves a section + tile id to its ten models, falling back to the global
 * rank for any tile without a bespoke list so the page is never empty.
 */
type ChartLists = Record<string, Record<string, readonly string[]>>;

export const CHART_LISTS: ChartLists = {
  "picked-for-your-profession": {
    engineer: ["gpt-6-astra", "claude-opus-5-5", "claude-sonnet-5", "qwen3-coder-next", "gpt-5-6-sol", "deepseek-v4-pro", "gemini-3-1-pro", "grok-4-3", "claude-haiku-4-5", "deepseek-r1"],
    marketer: ["claude-opus-5-5", "gpt-6-astra", "claude-fable-5-1", "gemini-3-8-flash", "gpt-5-6-sol", "claude-sonnet-5", "mistral-large-3", "gemini-3-5-flash", "command-a", "gpt-5-5"],
    pm: ["claude-opus-5-5", "gpt-6-1-sol", "claude-sonnet-5", "gemini-3-1-pro", "gpt-5-5", "gemini-3-8-flash", "grok-4-3", "mistral-large-3", "claude-haiku-4-5", "amazon-nova-pro"],
    designer: ["gpt-6-astra", "claude-opus-5-5", "gemini-3-8-flash", "claude-fable-5-1", "gemini-3-1-pro", "gpt-5-6-sol", "grok-4-3", "claude-sonnet-5", "mistral-large-3", "gemini-3-5-flash"],
    founder: ["claude-opus-5-5", "gpt-6-astra", "gpt-6-1-sol", "claude-sonnet-5", "gemini-3-8-flash", "gpt-5-5", "grok-4-3", "deepseek-v4-pro", "claude-haiku-4-5", "mistral-medium-3-5"],
    sales: ["claude-opus-5-5", "gpt-6-astra", "claude-fable-5-1", "gpt-5-6-sol", "gemini-3-8-flash", "claude-sonnet-5", "command-a", "gpt-5-5", "mistral-large-3", "claude-haiku-4-5"],
    analyst: ["gpt-6-astra", "claude-opus-5-5", "gpt-5-4-pro", "gemini-3-1-pro", "deepseek-v4-pro", "claude-sonnet-5", "qwen3-max", "gpt-5-6-sol", "amazon-nova-pro", "deepseek-r1"],
    consultant: ["claude-opus-5-5", "gpt-6-astra", "gpt-6-1-sol", "claude-sonnet-5", "gemini-3-1-pro", "gpt-5-5", "mistral-large-3", "gemini-3-8-flash", "grok-4-3", "claude-haiku-4-5"],
    lawyer: ["claude-opus-5-5", "claude-opus-4-8", "gpt-6-astra", "gpt-6-1-sol", "claude-sonnet-5", "gemini-3-1-pro", "gpt-5-4-pro", "claude-opus-4-7", "mistral-large-3", "claude-sonnet-4-6"],
    accountant: ["gpt-6-astra", "claude-opus-5-5", "gpt-5-4-pro", "deepseek-v4-pro", "gemini-3-1-pro", "claude-sonnet-5", "qwen3-max", "gpt-5-6-sol", "deepseek-r1", "amazon-nova-pro"],
    investor: ["claude-opus-5-5", "gpt-6-astra", "gpt-5-4-pro", "claude-opus-4-8", "gemini-3-1-pro", "claude-sonnet-5", "deepseek-v4-pro", "gpt-6-1-sol", "grok-4-3", "qwen3-max"],
    hr: ["claude-opus-5-5", "claude-fable-5-1", "gpt-6-astra", "claude-sonnet-5", "gpt-5-6-sol", "gemini-3-8-flash", "gpt-5-5", "mistral-medium-3-5", "claude-haiku-4-5", "command-a"],
  },
  "skills-in-heavy-rotation": {
    "seeking-information": ["gpt-6-astra", "perplexity-sonar", "claude-opus-5-5", "gemini-3-8-flash", "gpt-5-6-sol", "gemini-3-5-flash", "claude-sonnet-5", "gpt-5-5", "grok-4-3", "claude-haiku-4-5"],
    writing: ["claude-opus-5-5", "claude-fable-5-1", "gpt-6-astra", "claude-sonnet-5", "gpt-6-1-sol", "gemini-3-8-flash", "gpt-5-6-sol", "mistral-large-3", "claude-haiku-4-5", "gemini-3-5-flash"],
    "practical-howto": ["gpt-6-astra", "claude-opus-5-5", "gemini-3-8-flash", "gpt-5-6-sol", "claude-sonnet-5", "perplexity-sonar", "gpt-5-5", "gemini-3-5-flash", "claude-haiku-4-5", "grok-4-3"],
    summarizing: ["claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "gemini-3-5-flash", "claude-haiku-4-5", "gpt-5-5", "mistral-medium-3-5", "deepseek-v4-flash"],
    editing: ["claude-opus-5-5", "claude-fable-5-1", "gpt-6-astra", "claude-sonnet-5", "gpt-6-1-sol", "gpt-5-6-sol", "gemini-3-8-flash", "mistral-large-3", "claude-haiku-4-5", "gpt-5-5"],
    research: ["gpt-6-astra", "claude-opus-5-5", "perplexity-sonar", "gpt-5-4-pro", "gemini-3-1-pro", "claude-opus-4-8", "deepseek-r1", "claude-sonnet-5", "gpt-6-1-sol", "qwen3-max"],
    brainstorming: ["claude-opus-5-5", "gpt-6-astra", "claude-fable-5-1", "gpt-6-1-sol", "grok-4-3", "claude-sonnet-5", "gemini-3-8-flash", "gpt-5-6-sol", "gpt-5-5", "mistral-large-3"],
    coding: ["gpt-6-astra", "claude-opus-5-5", "claude-sonnet-5", "qwen3-coder-next", "gpt-5-6-sol", "deepseek-v4-pro", "gpt-5-4-pro", "gemini-3-1-pro", "deepseek-r1", "claude-haiku-4-5"],
    "image-generation": ["gpt-6-astra", "gemini-3-8-flash", "claude-opus-5-5", "gemini-3-1-pro", "gemini-3-5-flash", "gpt-5-6-sol", "grok-4-3", "claude-fable-5-1", "gpt-5-5", "amazon-nova-pro"],
    "data-analysis": ["gpt-6-astra", "claude-opus-5-5", "gpt-5-4-pro", "deepseek-v4-pro", "gemini-3-1-pro", "claude-sonnet-5", "qwen3-max", "deepseek-r1", "gpt-5-6-sol", "amazon-nova-pro"],
    translation: ["gemini-3-8-flash", "gpt-6-astra", "claude-opus-5-5", "qwen3-max", "gemini-3-5-flash", "aya-expanse-2", "deepseek-v4-pro", "claude-sonnet-5", "gpt-5-6-sol", "command-a"],
    email: ["claude-opus-5-5", "gpt-6-astra", "claude-fable-5-1", "gpt-5-6-sol", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-5", "claude-haiku-4-5", "mistral-medium-3-5", "gemini-3-5-flash"],
    planning: ["claude-opus-5-5", "gpt-6-astra", "gpt-6-1-sol", "claude-sonnet-5", "gemini-3-1-pro", "gpt-5-5", "grok-4-3", "gemini-3-8-flash", "mistral-large-3", "claude-haiku-4-5"],
    tutoring: ["claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "gemini-3-5-flash", "gpt-5-5", "claude-haiku-4-5", "gemma-4", "mistral-medium-3-5"],
    "meeting-notes": ["claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "claude-haiku-4-5", "gemini-3-5-flash", "gpt-5-5", "deepseek-v4-flash", "mistral-medium-3-5"],
    transcription: ["gpt-6-astra", "gemini-3-8-flash", "claude-opus-5-5", "gemini-3-5-flash", "gpt-5-6-sol", "claude-haiku-4-5", "deepseek-v4-flash", "gpt-5-5", "amazon-nova-pro", "mistral-small-3-2"],
    "knowledge-qa": ["gpt-6-astra", "claude-opus-5-5", "gemini-3-1-pro", "claude-sonnet-5", "deepseek-v4-pro", "gpt-5-6-sol", "gemini-3-8-flash", "qwen3-max", "gpt-5-5", "claude-haiku-4-5"],
    "social-content": ["claude-fable-5-1", "gpt-6-astra", "claude-opus-5-5", "gemini-3-8-flash", "grok-4-3", "gpt-5-6-sol", "claude-sonnet-5", "gpt-5-5", "gemini-3-5-flash", "mistral-medium-3-5"],
    "document-processing": ["gpt-6-astra", "claude-opus-5-5", "gemini-3-1-pro", "claude-sonnet-5", "deepseek-v4-pro", "gpt-5-4-pro", "gemini-3-8-flash", "qwen3-max", "gpt-5-6-sol", "amazon-nova-pro"],
    "code-review": ["gpt-6-astra", "claude-opus-5-5", "claude-sonnet-5", "qwen3-coder-next", "deepseek-v4-pro", "gpt-5-6-sol", "gpt-5-4-pro", "gemini-3-1-pro", "deepseek-r1", "claude-haiku-4-5"],
  },
  "made-to-ship": {
    code: ["gpt-6-astra", "claude-opus-5-5", "claude-sonnet-5", "qwen3-coder-next", "gpt-5-6-sol", "deepseek-v4-pro", "gpt-5-4-pro", "gemini-3-1-pro", "deepseek-r1", "claude-haiku-4-5"],
    documents: ["claude-opus-5-5", "gpt-6-astra", "claude-fable-5-1", "claude-sonnet-5", "gpt-6-1-sol", "gemini-3-8-flash", "gpt-5-6-sol", "mistral-large-3", "gpt-5-5", "claude-haiku-4-5"],
    chatbots: ["gpt-6-astra", "claude-opus-5-5", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "gemini-3-5-flash", "gpt-5-5", "claude-haiku-4-5", "mistral-medium-3-5", "command-a"],
    graphics: ["gpt-6-astra", "gemini-3-8-flash", "claude-opus-5-5", "gemini-3-1-pro", "gemini-3-5-flash", "gpt-5-6-sol", "grok-4-3", "claude-fable-5-1", "amazon-nova-pro", "gpt-5-5"],
    voice: ["gpt-6-astra", "gemini-3-8-flash", "claude-opus-5-5", "gemini-3-5-flash", "gpt-5-6-sol", "claude-sonnet-5", "amazon-nova-pro", "gpt-5-5", "claude-haiku-4-5", "deepseek-v4-flash"],
    data: ["gpt-6-astra", "claude-opus-5-5", "gpt-5-4-pro", "deepseek-v4-pro", "gemini-3-1-pro", "claude-sonnet-5", "qwen3-max", "deepseek-r1", "gpt-5-6-sol", "amazon-nova-pro"],
    web: ["gpt-6-astra", "claude-opus-5-5", "claude-sonnet-5", "qwen3-coder-next", "gpt-5-6-sol", "deepseek-v4-pro", "gemini-3-1-pro", "gpt-5-4-pro", "grok-4-3", "claude-haiku-4-5"],
    spreadsheets: ["gpt-6-astra", "claude-opus-5-5", "gpt-5-4-pro", "deepseek-v4-pro", "gemini-3-1-pro", "claude-sonnet-5", "qwen3-max", "gpt-5-6-sol", "deepseek-r1", "amazon-nova-pro"],
    audio: ["gpt-6-astra", "gemini-3-8-flash", "claude-opus-5-5", "gemini-3-5-flash", "gpt-5-6-sol", "amazon-nova-pro", "claude-sonnet-5", "gpt-5-5", "grok-4-3", "mistral-medium-3-5"],
    video: ["gpt-6-astra", "gemini-3-8-flash", "gemini-3-1-pro", "claude-opus-5-5", "gemini-3-5-flash", "gpt-5-6-sol", "grok-4-3", "gpt-5-5", "amazon-nova-pro", "claude-fable-5-1"],
    diagrams: ["gpt-6-astra", "claude-opus-5-5", "gemini-3-1-pro", "claude-sonnet-5", "gpt-5-6-sol", "gemini-3-8-flash", "gpt-5-4-pro", "qwen3-coder-next", "gpt-5-5", "mistral-large-3"],
    presentations: ["claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-fable-5-1", "gemini-3-1-pro", "gpt-5-6-sol", "claude-sonnet-5", "gpt-5-5", "mistral-large-3", "gemini-3-5-flash"],
  },
  "homegrown-heroes": {
    us: ["claude-opus-5-5", "gpt-6-astra", "gpt-6-1-sol", "claude-opus-4-8", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "grok-4-3", "llama-4-maverick", "amazon-nova-pro"],
    china: ["deepseek-v4-pro", "qwen3-max", "kimi-k2-6", "glm-5-1", "deepseek-r1", "qwen3-coder-next", "minimax-m2", "ernie-5-0", "chatglm-6", "sensenova-6"],
    france: ["mistral-large-3", "mistral-medium-3-5", "mistral-small-3-2", "claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "deepseek-v4-pro", "qwen3-max"],
    uk: ["gemini-3-8-flash", "gemini-3-1-pro", "gemini-3-5-flash", "stable-lm-3", "claude-opus-5-5", "gpt-6-astra", "claude-sonnet-5", "gpt-5-6-sol", "grok-4-3", "gemma-4"],
    canada: ["command-a", "aya-expanse-2", "claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "deepseek-v4-pro", "mistral-large-3", "qwen3-max"],
    korea: ["claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "qwen3-max", "deepseek-v4-pro", "gpt-5-5", "kimi-k2-6", "claude-haiku-4-5"],
    germany: ["mistral-large-3", "claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "deepseek-v4-pro", "qwen3-max", "command-a", "mistral-medium-3-5"],
    japan: ["claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "qwen3-max", "claude-sonnet-5", "gpt-5-6-sol", "deepseek-v4-pro", "gpt-5-5", "kimi-k2-6", "mistral-large-3"],
    israel: ["jamba-2", "claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "deepseek-v4-pro", "grok-4-3", "qwen3-max", "mistral-large-3"],
    uae: ["claude-opus-5-5", "gpt-6-astra", "gemini-3-8-flash", "qwen3-max", "claude-sonnet-5", "gpt-5-6-sol", "deepseek-v4-pro", "aya-expanse-2", "command-a", "mistral-large-3"],
    india: ["gpt-6-astra", "claude-opus-5-5", "gemini-3-8-flash", "qwen3-max", "claude-sonnet-5", "deepseek-v4-pro", "gpt-5-6-sol", "aya-expanse-2", "gpt-5-5", "llama-4-scout"],
    saudi: ["gpt-6-astra", "claude-opus-5-5", "gemini-3-8-flash", "aya-expanse-2", "qwen3-max", "claude-sonnet-5", "gpt-5-6-sol", "deepseek-v4-pro", "command-a", "mistral-large-3"],
  },
};

/** The ten models for a chart: its bespoke list, or the global top-10 as a safe fallback. */
export function modelsForChart(section: string, tileId: string): string[] {
  const list = CHART_LISTS[section]?.[tileId];
  const ids = list && list.length ? list : CHART_MODELS_RANKED.slice(0, 10);
  // Keep only ids that exist in the catalogue, de-duplicated, capped at 10.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (CHART_MODELS[id] && !seen.has(id)) { seen.add(id); out.push(id); }
    if (out.length === 10) break;
  }
  return out;
}

/** Short, stable section codes used in the lede i18n keys (keeps keys readable and locale-parity simple). */
const SECTION_CODE: Record<string, string> = {
  "picked-for-your-profession": "prof",
  "skills-in-heavy-rotation": "skill",
  "made-to-ship": "out",
  "homegrown-heroes": "geo",
};

/**
 * Every chart that has a HAND-WRITTEN lede, as `<section>::<tileId>`. The detail page uses the
 * bespoke `cowork.chart_lede_<code>_<tileId>` key for these and the generic `cowork.chart_detail_lede`
 * for anything else — so a tile without its own line still reads cleanly, and the renderer-locale
 * guard never sees a referenced key that does not exist.
 */
const LEDE_TILES = new Set<string>([
  // professions
  ...["engineer", "marketer", "pm", "designer", "founder", "sales", "analyst", "consultant", "lawyer", "accountant", "investor", "hr"].map((id) => `picked-for-your-profession::${id}`),
  // skills
  ...["seeking-information", "writing", "practical-howto", "summarizing", "editing", "research", "brainstorming", "coding", "image-generation", "data-analysis", "translation", "email", "planning", "tutoring", "meeting-notes", "transcription", "knowledge-qa", "social-content", "document-processing", "code-review"].map((id) => `skills-in-heavy-rotation::${id}`),
  // outputs
  ...["code", "documents", "chatbots", "graphics", "voice", "data", "web", "spreadsheets", "audio", "video", "diagrams", "presentations"].map((id) => `made-to-ship::${id}`),
  // countries
  ...["us", "china", "france", "uk", "canada", "korea", "germany", "japan", "israel", "uae", "india", "saudi"].map((id) => `homegrown-heroes::${id}`),
]);

/**
 * The i18n key for a chart's lede: the bespoke, hand-written line when one exists, else the generic
 * template (which takes a {chart} placeholder). Guarantees the returned key is present in both bundles.
 */
export function ledeKeyFor(section: string, tileId: string): string {
  if (LEDE_TILES.has(`${section}::${tileId}`) && SECTION_CODE[section]) {
    return `cowork.chart_lede_${SECTION_CODE[section]}_${tileId}`;
  }
  return "cowork.chart_detail_lede";
}
