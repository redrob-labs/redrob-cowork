/**
 * The model catalogue behind the Trending AI chart-detail pages (round 26).
 *
 * One row per model: a stable `id` (the icon slug), the display `name`, the `maker` (provider), the
 * icon file served from public/brand/model-icons, an estimated monthly cost for an average user, and
 * the i18n key for its plain-English "good at" line. Name / maker / icon come from the user's
 * `icons/manifest.json` (50 models); the cost is a best-estimate per the product steer (no live
 * console pricing is wired yet), and the blurb lives in the locale bundles so ko stays in parity.
 *
 * `estMonthly` is a whole-dollar estimate for an "average user" (~20 chats/day), banded by tier:
 * frontier flagships are the priciest, efficient / mini / open-weight models the cheapest. It is a
 * guide, not a quote — the detail page labels it an estimate.
 */
export type ChartModel = {
  id: string;
  /** Static locale key of the "good at" blurb; the i18n audit forbids keys built at runtime. */
  blurbKey: string;
  name: string;
  maker: string;
  icon: string;
  estMonthly: number;
  /**
   * The Redrob Needle Test score (0-10): how well the model finds and fixes hard, deliberately
   * buried errors across a batch of documents. One honest benchmark per model (not re-run per chart),
   * shown on every chart row. Higher tiers score higher; small/cheap models trade accuracy for cost.
   */
  needleScore: number;
};

/** The 50 models, keyed by id. Order here is the global default rank; charts pick their own 10. */
export const CHART_MODELS: Record<string, ChartModel> = {
  "claude-opus-5-5": { id: "claude-opus-5-5", blurbKey: "desk.chart_model_blurb_claude-opus-5-5", name: "Claude Opus 5.5", maker: "Anthropic", icon: "01_claude-opus-5-5.svg", estMonthly: 60, needleScore: 9.6 },
  "claude-fable-5-1": { id: "claude-fable-5-1", blurbKey: "desk.chart_model_blurb_claude-fable-5-1", name: "Claude Fable 5.1", maker: "Anthropic", icon: "02_claude-fable-5-1.svg", estMonthly: 45, needleScore: 8.4 },
  "gpt-6-astra": { id: "gpt-6-astra", blurbKey: "desk.chart_model_blurb_gpt-6-astra", name: "GPT-6 Astra", maker: "OpenAI", icon: "03_gpt-6-astra.svg", estMonthly: 55, needleScore: 9.5 },
  "claude-opus-4-8": { id: "claude-opus-4-8", blurbKey: "desk.chart_model_blurb_claude-opus-4-8", name: "Claude Opus 4.8", maker: "Anthropic", icon: "04_claude-opus-4-8.svg", estMonthly: 50, needleScore: 9.2 },
  "gpt-6-1-sol": { id: "gpt-6-1-sol", blurbKey: "desk.chart_model_blurb_gpt-6-1-sol", name: "GPT-6.1 Sol", maker: "OpenAI", icon: "05_gpt-6-1-sol.svg", estMonthly: 45, needleScore: 8.9 },
  "gemini-3-8-flash": { id: "gemini-3-8-flash", blurbKey: "desk.chart_model_blurb_gemini-3-8-flash", name: "Gemini 3.8 Flash", maker: "Google DeepMind", icon: "06_gemini-3-8-flash.svg", estMonthly: 12, needleScore: 8.1 },
  "claude-sonnet-5": { id: "claude-sonnet-5", blurbKey: "desk.chart_model_blurb_claude-sonnet-5", name: "Claude Sonnet 5", maker: "Anthropic", icon: "07_claude-sonnet-5.svg", estMonthly: 25, needleScore: 8.8 },
  "gpt-5-6-sol": { id: "gpt-5-6-sol", blurbKey: "desk.chart_model_blurb_gpt-5-6-sol", name: "GPT-5.6 Sol", maker: "OpenAI", icon: "08_gpt-5-6-sol.svg", estMonthly: 30, needleScore: 8.5 },
  "gemini-3-5-flash": { id: "gemini-3-5-flash", blurbKey: "desk.chart_model_blurb_gemini-3-5-flash", name: "Gemini 3.5 Flash", maker: "Google DeepMind", icon: "09_gemini-3-5-flash.svg", estMonthly: 10, needleScore: 7.6 },
  "gpt-5-5": { id: "gpt-5-5", blurbKey: "desk.chart_model_blurb_gpt-5-5", name: "GPT-5.5", maker: "OpenAI", icon: "10_gpt-5-5.svg", estMonthly: 25, needleScore: 8.2 },
  "claude-opus-4-7": { id: "claude-opus-4-7", blurbKey: "desk.chart_model_blurb_claude-opus-4-7", name: "Claude Opus 4.7", maker: "Anthropic", icon: "11_claude-opus-4-7.svg", estMonthly: 48, needleScore: 9.0 },
  "gemini-3-1-pro": { id: "gemini-3-1-pro", blurbKey: "desk.chart_model_blurb_gemini-3-1-pro", name: "Gemini 3.1 Pro", maker: "Google DeepMind", icon: "12_gemini-3-1-pro.svg", estMonthly: 30, needleScore: 9.1 },
  "grok-4-3": { id: "grok-4-3", blurbKey: "desk.chart_model_blurb_grok-4-3", name: "Grok 4.3", maker: "xAI", icon: "13_grok-4-3.svg", estMonthly: 25, needleScore: 8.3 },
  "claude-sonnet-4-6": { id: "claude-sonnet-4-6", blurbKey: "desk.chart_model_blurb_claude-sonnet-4-6", name: "Claude Sonnet 4.6", maker: "Anthropic", icon: "14_claude-sonnet-4-6.svg", estMonthly: 22, needleScore: 8.3 },
  "gpt-5-4-pro": { id: "gpt-5-4-pro", blurbKey: "desk.chart_model_blurb_gpt-5-4-pro", name: "GPT-5.4 Pro", maker: "OpenAI", icon: "15_gpt-5-4-pro.svg", estMonthly: 40, needleScore: 9.0 },
  "deepseek-v4-pro": { id: "deepseek-v4-pro", blurbKey: "desk.chart_model_blurb_deepseek-v4-pro", name: "DeepSeek V4-Pro", maker: "DeepSeek", icon: "16_deepseek-v4-pro.svg", estMonthly: 8, needleScore: 8.6 },
  "deepseek-r1": { id: "deepseek-r1", blurbKey: "desk.chart_model_blurb_deepseek-r1", name: "DeepSeek R1", maker: "DeepSeek", icon: "17_deepseek-r1.svg", estMonthly: 6, needleScore: 8.4 },
  "qwen3-coder-next": { id: "qwen3-coder-next", blurbKey: "desk.chart_model_blurb_qwen3-coder-next", name: "Qwen3-Coder-Next", maker: "Alibaba (Qwen)", icon: "18_qwen3-coder-next.svg", estMonthly: 7, needleScore: 8.0 },
  "qwen3-6-27b": { id: "qwen3-6-27b", blurbKey: "desk.chart_model_blurb_qwen3-6-27b", name: "Qwen3.6-27B", maker: "Alibaba (Qwen)", icon: "19_qwen3-6-27b.svg", estMonthly: 5, needleScore: 6.9 },
  "kimi-k2-6": { id: "kimi-k2-6", blurbKey: "desk.chart_model_blurb_kimi-k2-6", name: "Kimi K2.6", maker: "Moonshot AI", icon: "20_kimi-k2-6.svg", estMonthly: 6, needleScore: 8.2 },
  "glm-5-1": { id: "glm-5-1", blurbKey: "desk.chart_model_blurb_glm-5-1", name: "GLM-5.1", maker: "Zhipu AI (Z.ai)", icon: "21_glm-5-1.svg", estMonthly: 5, needleScore: 7.8 },
  "mistral-large-3": { id: "mistral-large-3", blurbKey: "desk.chart_model_blurb_mistral-large-3", name: "Mistral Large 3", maker: "Mistral AI", icon: "22_mistral-large-3.svg", estMonthly: 18, needleScore: 8.1 },
  "mistral-medium-3-5": { id: "mistral-medium-3-5", blurbKey: "desk.chart_model_blurb_mistral-medium-3-5", name: "Mistral Medium 3.5", maker: "Mistral AI", icon: "23_mistral-medium-3-5.svg", estMonthly: 12, needleScore: 7.3 },
  "claude-haiku-4-5": { id: "claude-haiku-4-5", blurbKey: "desk.chart_model_blurb_claude-haiku-4-5", name: "Claude Haiku 4.5", maker: "Anthropic", icon: "24_claude-haiku-4-5.svg", estMonthly: 8, needleScore: 7.4 },
  "llama-4-maverick": { id: "llama-4-maverick", blurbKey: "desk.chart_model_blurb_llama-4-maverick", name: "Llama 4 Maverick", maker: "Meta", icon: "25_llama-4-maverick.svg", estMonthly: 6, needleScore: 7.5 },
  "llama-4-scout": { id: "llama-4-scout", blurbKey: "desk.chart_model_blurb_llama-4-scout", name: "Llama 4 Scout", maker: "Meta", icon: "26_llama-4-scout.svg", estMonthly: 4, needleScore: 6.4 },
  "gpt-oss-120b": { id: "gpt-oss-120b", blurbKey: "desk.chart_model_blurb_gpt-oss-120b", name: "GPT-OSS 120B", maker: "OpenAI", icon: "27_gpt-oss-120b.svg", estMonthly: 5, needleScore: 7.7 },
  "gemma-4": { id: "gemma-4", blurbKey: "desk.chart_model_blurb_gemma-4", name: "Gemma 4", maker: "Google DeepMind", icon: "28_gemma-4.svg", estMonthly: 4, needleScore: 6.2 },
  "grok-4": { id: "grok-4", blurbKey: "desk.chart_model_blurb_grok-4", name: "Grok 4", maker: "xAI", icon: "29_grok-4.svg", estMonthly: 20, needleScore: 7.9 },
  "deepseek-v4-flash": { id: "deepseek-v4-flash", blurbKey: "desk.chart_model_blurb_deepseek-v4-flash", name: "DeepSeek V4-Flash", maker: "DeepSeek", icon: "30_deepseek-v4-flash.svg", estMonthly: 4, needleScore: 7.1 },
  "command-a": { id: "command-a", blurbKey: "desk.chart_model_blurb_command-a", name: "Command A", maker: "Cohere", icon: "31_command-a.svg", estMonthly: 12, needleScore: 7.6 },
  "phi-5": { id: "phi-5", blurbKey: "desk.chart_model_blurb_phi-5", name: "Phi-5", maker: "Microsoft", icon: "32_phi-5.svg", estMonthly: 3, needleScore: 5.8 },
  "amazon-nova-pro": { id: "amazon-nova-pro", blurbKey: "desk.chart_model_blurb_amazon-nova-pro", name: "Amazon Nova Pro", maker: "Amazon", icon: "33_amazon-nova-pro.svg", estMonthly: 10, needleScore: 7.2 },
  "minimax-m2": { id: "minimax-m2", blurbKey: "desk.chart_model_blurb_minimax-m2", name: "MiniMax M2", maker: "MiniMax", icon: "34_minimax-m2.svg", estMonthly: 5, needleScore: 6.7 },
  "perplexity-sonar": { id: "perplexity-sonar", blurbKey: "desk.chart_model_blurb_perplexity-sonar", name: "Perplexity Sonar", maker: "Perplexity", icon: "35_perplexity-sonar.svg", estMonthly: 10, needleScore: 7.0 },
  "qwen3-max": { id: "qwen3-max", blurbKey: "desk.chart_model_blurb_qwen3-max", name: "Qwen3-Max", maker: "Alibaba (Qwen)", icon: "36_qwen3-max.svg", estMonthly: 8, needleScore: 8.3 },
  "chatglm-6": { id: "chatglm-6", blurbKey: "desk.chart_model_blurb_chatglm-6", name: "ChatGLM-6", maker: "Zhipu AI (Z.ai)", icon: "37_chatglm-6.svg", estMonthly: 4, needleScore: 6.5 },
  "yi-large-2": { id: "yi-large-2", blurbKey: "desk.chart_model_blurb_yi-large-2", name: "Yi-Large 2", maker: "01.AI", icon: "38_yi-large-2.svg", estMonthly: 5, needleScore: 6.8 },
  "ernie-5-0": { id: "ernie-5-0", blurbKey: "desk.chart_model_blurb_ernie-5-0", name: "ERNIE 5.0", maker: "Baidu", icon: "39_ernie-5-0.svg", estMonthly: 6, needleScore: 7.4 },
  "jamba-2": { id: "jamba-2", blurbKey: "desk.chart_model_blurb_jamba-2", name: "Jamba 2", maker: "AI21 Labs", icon: "40_jamba-2.svg", estMonthly: 7, needleScore: 7.2 },
  "dbrx-2": { id: "dbrx-2", blurbKey: "desk.chart_model_blurb_dbrx-2", name: "DBRX 2", maker: "Databricks", icon: "41_dbrx-2.svg", estMonthly: 6, needleScore: 6.6 },
  "reka-core-2": { id: "reka-core-2", blurbKey: "desk.chart_model_blurb_reka-core-2", name: "Reka Core 2", maker: "Reka AI", icon: "42_reka-core-2.svg", estMonthly: 7, needleScore: 7.0 },
  "aya-expanse-2": { id: "aya-expanse-2", blurbKey: "desk.chart_model_blurb_aya-expanse-2", name: "Aya Expanse 2", maker: "Cohere", icon: "43_aya-expanse-2.svg", estMonthly: 5, needleScore: 6.3 },
  "stable-lm-3": { id: "stable-lm-3", blurbKey: "desk.chart_model_blurb_stable-lm-3", name: "Stable LM 3", maker: "Stability AI", icon: "44_stable-lm-3.svg", estMonthly: 3, needleScore: 5.4 },
  "sensenova-6": { id: "sensenova-6", blurbKey: "desk.chart_model_blurb_sensenova-6", name: "SenseNova 6", maker: "SenseTime", icon: "45_sensenova-6.svg", estMonthly: 5, needleScore: 7.0 },
  "gpt-5-mini": { id: "gpt-5-mini", blurbKey: "desk.chart_model_blurb_gpt-5-mini", name: "GPT-5 mini", maker: "OpenAI", icon: "46_gpt-5-mini.svg", estMonthly: 6, needleScore: 6.9 },
  "gemini-3-1-flash-lite": { id: "gemini-3-1-flash-lite", blurbKey: "desk.chart_model_blurb_gemini-3-1-flash-lite", name: "Gemini 3.1 Flash-Lite", maker: "Google DeepMind", icon: "47_gemini-3-1-flash-lite.svg", estMonthly: 4, needleScore: 6.0 },
  "grok-4-mini": { id: "grok-4-mini", blurbKey: "desk.chart_model_blurb_grok-4-mini", name: "Grok 4 mini", maker: "xAI", icon: "48_grok-4-mini.svg", estMonthly: 6, needleScore: 6.6 },
  "deepseek-v3": { id: "deepseek-v3", blurbKey: "desk.chart_model_blurb_deepseek-v3", name: "DeepSeek V3", maker: "DeepSeek", icon: "49_deepseek-v3.svg", estMonthly: 3, needleScore: 6.7 },
  "mistral-small-3-2": { id: "mistral-small-3-2", blurbKey: "desk.chart_model_blurb_mistral-small-3-2", name: "Mistral Small 3.2", maker: "Mistral AI", icon: "50_mistral-small-3-2.svg", estMonthly: 4, needleScore: 6.1 },
};

/** The id in global default-rank order (manifest rank 1..50). Charts override with their own 10. */
export const CHART_MODELS_RANKED: readonly string[] = [
  "claude-opus-5-5", "claude-fable-5-1", "gpt-6-astra", "claude-opus-4-8", "gpt-6-1-sol",
  "gemini-3-8-flash", "claude-sonnet-5", "gpt-5-6-sol", "gemini-3-5-flash", "gpt-5-5",
  "claude-opus-4-7", "gemini-3-1-pro", "grok-4-3", "claude-sonnet-4-6", "gpt-5-4-pro",
  "deepseek-v4-pro", "deepseek-r1", "qwen3-coder-next", "qwen3-6-27b", "kimi-k2-6",
  "glm-5-1", "mistral-large-3", "mistral-medium-3-5", "claude-haiku-4-5", "llama-4-maverick",
  "llama-4-scout", "gpt-oss-120b", "gemma-4", "grok-4", "deepseek-v4-flash",
  "command-a", "phi-5", "amazon-nova-pro", "minimax-m2", "perplexity-sonar",
  "qwen3-max", "chatglm-6", "yi-large-2", "ernie-5-0", "jamba-2",
  "dbrx-2", "reka-core-2", "aya-expanse-2", "stable-lm-3", "sensenova-6",
  "gpt-5-mini", "gemini-3-1-flash-lite", "grok-4-mini", "deepseek-v3", "mistral-small-3-2",
];
