import { z } from "zod";

/**
 * One real run per pick on each task: the task's example prompt, sent unchanged to every model the guide
 * ranks for it, and what each model wrote. Built by `scripts/model-guide/samples/build.mjs` from the runs in
 * `scripts/model-guide/samples/outputs/`, one file per language and profession, so the guide loads only the
 * profession and language on screen.
 */
const Verdict = z.object({ verdict: z.enum(["pass", "partial", "miss"]), quote: z.string() });

const Run = z.object({
  output: z.string(),
  date: z.string(),
  /** The thinking level the answer was written at. */
  effort: z.string(),
  costUsd: z.number(),
  latencyMs: z.number().optional(),
  cut: z.boolean(),
  /** One per check, in order: how two graders from different labs found this answer. */
  verdicts: z.array(Verdict).optional(),
});

const Card = z.object({
  brief: z.string().nullable(),
  given: z.array(z.string()),
  asked: z.array(z.string()),
  limit: z.string().nullable(),
  hard: z.string().nullable(),
});

export const GuideSamples = z.record(
  z.string(),
  z.object({
    prompt: z.string(),
    /** The task as the page shows it, in the working language. */
    card: Card.nullable().optional(),
    /** The scorecard's checks, in the working language. */
    checks: z.array(z.string()).optional(),
    runs: z.record(z.string(), Run),
  }),
);
export type GuideSamples = z.infer<typeof GuideSamples>;

/** The ids a sample file is named by, so a path is never built from anything else. */
const ID = /^[a-z0-9-]+$/;

/**
 * The samples for one profession in one working language; empty where none have been run yet. A variable
 * import, which Vite splits into one chunk per file, so only the samples on screen are ever downloaded.
 */
export async function loadGuideSamples(language: string, profession: string): Promise<GuideSamples> {
  if (!ID.test(language) || !ID.test(profession)) return {};
  try {
    const module: { default: unknown } = await import(`./samples/${language}/${profession}.json`);
    return GuideSamples.parse(module.default);
  } catch {
    return {};
  }
}

/** The run key a pick's sample is stored under: its first model at its ranked level. */
export function sampleKey(model: string, effort: string | undefined): string {
  return `${model}@${effort ?? "default"}`;
}
