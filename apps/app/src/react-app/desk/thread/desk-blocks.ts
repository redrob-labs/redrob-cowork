import { z } from "zod";

/**
 * The fenced JSON blocks Plan and Cross-check answer in, read into the design system's
 * PlanQuestions, PlanDocument, FactCheckReport and ChallengeReport. The text is model output,
 * so every block is validated: a block that is not valid JSON or not the right shape stays in
 * the prose as it was written, and nothing here throws.
 */

/** Fence language tags. Copied from `DESK_BLOCKS` in apps/server/src/redrob-desk-agents.ts; change both together. */
export const DESK_BLOCK_TAGS = {
  questions: "redrob-questions",
  plan: "redrob-plan",
  check: "redrob-check",
} as const;

type BlockKind = keyof typeof DESK_BLOCK_TAGS;

const text = z.string().trim().min(1);
const optionalText = z.string().trim().min(1).optional();
const index = z.number().int().nonnegative();

const questionSchema = z.object({
  id: text,
  question: text,
  options: z.array(text).min(1).max(8),
  multi: z.boolean().optional(),
  defaultValue: z.union([index, z.array(index)]).optional(),
});

const questionsSchema = z.array(questionSchema).min(1).max(8);

/** A short id the agent gives an item (`s1`, `c2`) so a comment can point at it. Optional. */
const itemId = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).optional().catch(undefined);

const planItemSchema = z.union([text, z.object({ id: itemId, lead: optionalText, text })]);

const planSchema = z.object({
  title: optionalText,
  summary: optionalText,
  sections: z
    .array(
      z.object({
        heading: text,
        ordered: z.boolean().optional(),
        body: optionalText,
        items: z.array(planItemSchema).optional(),
      }),
    )
    .default([]),
  todo: z.array(z.object({ id: itemId, label: text, who: optionalText })).default([]),
  note: optionalText,
});

const factSchema = z.object({
  summary: optionalText,
  claims: z
    .array(
      z.object({
        id: itemId,
        verdict: z.enum(["holds", "partly", "wrong"]),
        claim: text,
        source: optionalText,
        note: optionalText,
      }),
    )
    .default([]),
  missed: z.array(z.object({ text })).default([]),
});

const challengeSchema = z.object({
  claim: text,
  rounds: z.array(z.object({ for: text, against: text })).default([]),
  verdict: z.array(z.object({ kind: z.enum(["broke", "held", "changed"]), text })).default([]),
  unsettled: optionalText,
});

const checkSchema = z
  .object({ fact: factSchema.optional(), challenge: challengeSchema.optional() })
  .refine((value) => value.fact !== undefined || value.challenge !== undefined);

export type PlanQuestionData = {
  id: string;
  question: string;
  options: string[];
  multi?: boolean;
  defaultValue?: number | number[];
};
export type PlanItemData = string | { id?: string; lead?: string; text: string };
export type PlanSectionData = { heading: string; ordered?: boolean; body?: string; items?: PlanItemData[] };
export type PlanDoc = {
  title?: string;
  summary?: string;
  sections: PlanSectionData[];
  todo: Array<{ id?: string; label: string; who?: string }>;
  note?: string;
};
export type FactCheckData = z.infer<typeof factSchema>;
export type ChallengeData = z.infer<typeof challengeSchema>;
export type CheckResult = { fact?: FactCheckData; challenge?: ChallengeData };

export type DeskBlocks = {
  /** The text with every block it understood taken out. */
  prose: string;
  questions?: PlanQuestionData[];
  plan?: PlanDoc;
  check?: CheckResult;
  /** A block is still streaming in; it is left out of the prose until it closes. */
  pending?: boolean;
};

/** A default that names an option that exists, or nothing. */
function cleanDefault(question: z.infer<typeof questionSchema>): PlanQuestionData {
  const { defaultValue, ...rest } = question;
  const inRange = (value: number) => value < question.options.length;
  if (defaultValue === undefined) return rest;
  if (question.multi) {
    const values = (Array.isArray(defaultValue) ? defaultValue : [defaultValue]).filter(inRange);
    return { ...rest, defaultValue: values };
  }
  const value = Array.isArray(defaultValue) ? defaultValue[0] : defaultValue;
  return value !== undefined && inRange(value) ? { ...rest, defaultValue: value } : rest;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** One block's body as its shape, or null when it is not one. */
function readBlock(kind: BlockKind, body: string): Partial<Omit<DeskBlocks, "prose">> | null {
  const json = parseJson(body);
  if (json === undefined) return null;
  if (kind === "questions") {
    const parsed = questionsSchema.safeParse(json);
    return parsed.success ? { questions: parsed.data.map(cleanDefault) } : null;
  }
  if (kind === "plan") {
    const parsed = planSchema.safeParse(json);
    return parsed.success ? { plan: parsed.data } : null;
  }
  const parsed = checkSchema.safeParse(json);
  return parsed.success ? { check: parsed.data } : null;
}

const KIND_BY_TAG = new Map<string, BlockKind>([
  [DESK_BLOCK_TAGS.questions, "questions"],
  [DESK_BLOCK_TAGS.plan, "plan"],
  [DESK_BLOCK_TAGS.check, "check"],
]);
const TAGS = Object.values(DESK_BLOCK_TAGS).join("|");
const BLOCK_RE = new RegExp(`(^|\\n)[ \\t]*\`\`\`[ \\t]*(${TAGS})[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n[ \\t]*\`\`\`[ \\t]*(?=\\r?\\n|$)`, "g");
const OPEN_RE = new RegExp(`(^|\\n)[ \\t]*\`\`\`[ \\t]*(${TAGS})[ \\t]*(\\r?\\n[\\s\\S]*)?$`);

function tidy(prose: string): string {
  return prose.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The prose and the blocks in an answer. Each kind is read once; a second block of the same
 * kind, or one that fails to parse, stays in the prose. While `streaming`, a block whose fence
 * has opened but not closed is held back rather than shown as raw JSON.
 */
export function parseDeskBlocks(source: string, options: { streaming?: boolean } = {}): DeskBlocks {
  const found: Omit<DeskBlocks, "prose"> = {};
  let prose = source.replace(BLOCK_RE, (match, lead: string, tag: string, body: string) => {
    const kind = KIND_BY_TAG.get(tag);
    if (!kind || found[kind] !== undefined) return match;
    const block = readBlock(kind, body);
    if (!block) return match;
    Object.assign(found, block);
    return lead;
  });
  if (options.streaming) {
    const open = OPEN_RE.exec(prose);
    if (open) {
      prose = prose.slice(0, open.index);
      found.pending = true;
    }
  }
  return { prose: tidy(prose), ...found };
}

/** Whether an answer carries a block the Desk renders itself. */
export function hasDeskBlocks(blocks: DeskBlocks): boolean {
  return Boolean(blocks.questions || blocks.plan || blocks.check || blocks.pending);
}

/** Where a synthesised id starts. Never a prefix the prompts ask the agent to use. */
export const SYNTHETIC_ID_PREFIX = "idx-";

/**
 * A stable id for each item, in order: the agent's own when it gave one, otherwise `idx-<n>`
 * from the item's position. A repeated or synthetic-looking id is replaced by the position one,
 * so two items never share an anchor and an agent cannot claim another item's comments.
 * Positions are 1-based, matching how the plan reads.
 */
export function anchorIds(items: ReadonlyArray<{ id?: string }>): string[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const own = item.id?.trim();
    const id = own && !own.startsWith(SYNTHETIC_ID_PREFIX) && !seen.has(own) ? own : `${SYNTHETIC_ID_PREFIX}${index + 1}`;
    seen.add(id);
    return id;
  });
}

/** The anchors a plan's steps take comments on. */
export function planStepIds(plan: Pick<PlanDoc, "todo">): string[] {
  return anchorIds(plan.todo);
}

/** The anchors a fact check's claims take comments on. */
export function claimIds(fact: Pick<FactCheckData, "claims">): string[] {
  return anchorIds(fact.claims);
}
