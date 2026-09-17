/**
 * Running one prompt several ways and keeping the answer the user picks.
 *
 * Two features, one shape. COMPARE runs the same prompt on different models. SHUFFLE runs it on the SAME
 * model more than once, which is a paraphrase: the question is not "which model is better" but "is there a
 * better wording of this answer".
 *
 * Each variant runs in a FORK of the current session, so all of them start from the same conversation and
 * none can see another's reply. Picking one continues in that fork and the rest are deleted. That is what
 * makes the chosen answer the session's answer rather than a quotation of one: the conversation genuinely
 * proceeds from it, and nothing has to be injected into a transcript the engine owns.
 *
 * The first version of this opened N sibling sessions and left them all in the sidebar. It answered a
 * different question - "give me N conversations" rather than "give me N answers to this turn" - and left
 * the user to close the ones they did not want.
 */

export type VariantKind = "compare" | "paraphrase"

export type FanOutModel = {
  providerID: string
  modelID: string
  /** Kept so a caller can honour a session's variant, e.g. a thinking level. */
  variant?: string | null
  /** False when the model is listed but cannot currently be used, e.g. no connected provider. */
  available?: boolean
}

/** One variant's place in a run: which model answers it, and how it is labelled on screen. */
export type VariantSlot = {
  index: number
  model: FanOutModel
  label: string
}

/** How many variants one turn may run. Past this they stop fitting side by side and stop being comparable. */
export const MAX_FAN_OUT = 4

/** What a paraphrase run does when the caller does not say. Two answers is the smallest real choice. */
export const DEFAULT_PARAPHRASE_COUNT = 2

const key = (model: FanOutModel) => `${model.providerID}/${model.modelID}/${model.variant ?? ""}`

/**
 * The two commands that start a run, parsed off a draft.
 *
 * Commands as well as buttons, because the prompt has to arrive with the instruction: `/shuffle explain
 * this regex` says what to run and how many ways in one line, where a button has to guess which text it
 * applied to. The buttons pass the same parsed shape.
 */
export type FanOutCommand =
  | { kind: "paraphrase"; count: number; prompt: string }
  | { kind: "compare"; modelIDs: string[]; prompt: string }

export function parseFanOutCommand(content: string): FanOutCommand | null {
  const text = content.trim()
  const shuffle = /^\/shuffle(?:\s+(\d+))?(?:\s+([\s\S]*))?$/i.exec(text)
  if (shuffle) {
    const count = shuffle[1] ? Number.parseInt(shuffle[1], 10) : DEFAULT_PARAPHRASE_COUNT
    return {
      kind: "paraphrase",
      count: Math.max(2, Math.min(Number.isFinite(count) ? count : DEFAULT_PARAPHRASE_COUNT, MAX_FAN_OUT)),
      prompt: (shuffle[2] ?? "").trim(),
    }
  }
  const compare = /^\/compare\s+([\s\S]+)$/i.exec(text)
  if (compare) {
    const rest = (compare[1] ?? "").trim()
    /*
      Models are the leading whitespace-separated tokens that look like ids, and the prompt is whatever
      follows. A model id has no spaces, so the first token that is not one ends the list. Requiring a
      separator instead would mean inventing syntax for a line a user types by hand.
    */
    const tokens = rest.split(/\s+/)
    const modelIDs: string[] = []
    let index = 0
    while (index < tokens.length && looksLikeModelID(tokens[index] ?? "")) {
      modelIDs.push(tokens[index] as string)
      index += 1
      if (modelIDs.length >= MAX_FAN_OUT) break
    }
    return { kind: "compare", modelIDs, prompt: tokens.slice(index).join(" ").trim() }
  }
  return null
}

/**
 * Whether a token reads as a model id rather than the start of the prompt.
 *
 * Deliberately narrow: ids in this catalogue are lowercase with digits, hyphens, dots and an optional
 * provider prefix, and an English word is not. Getting this wrong in the permissive direction would eat
 * the first words of someone's question, which is worse than making them name models first.
 */
function looksLikeModelID(token: string): boolean {
  if (token.length < 3) return false
  if (!/^[a-z0-9][a-z0-9./-]*$/.test(token)) return false
  // A bare English word is not an id. Something in it has to look like a version or a vendor path.
  return /[0-9]/.test(token) || token.includes("/") || token.includes("-")
}

/**
 * The variants a PARAPHRASE run should do.
 *
 * The same model, more than once. Nothing is randomised and no other model is drawn in, because the
 * question is about the wording rather than the model: swapping the model in would answer a different
 * question and make the results incomparable.
 *
 * Returns nothing when there is no usable model, so the caller says so instead of opening an empty run.
 */
export function resolveParaphraseSlots(input: {
  model: FanOutModel | null | undefined
  count?: number
}): VariantSlot[] {
  const model = input.model
  if (!model?.providerID || !model.modelID || model.available === false) return []
  const wanted = Math.max(2, Math.min(input.count ?? DEFAULT_PARAPHRASE_COUNT, MAX_FAN_OUT))
  return Array.from({ length: wanted }, (_unused, index) => ({
    index,
    model,
    // Numbered rather than named: every variant is the same model, so a model name distinguishes nothing.
    label: `${index + 1}`,
  }))
}

/** The slots a COMPARE run should do, one per resolved model. */
export function compareSlots(models: readonly FanOutModel[]): VariantSlot[] {
  return resolveCompareModels(models).map((model, index) => ({
    index,
    model,
    label: model.variant ? `${model.modelID} ${model.variant}` : model.modelID,
  }))
}

/**
 * The models a COMPARE should actually run.
 *
 * Duplicates are dropped by provider, model and variant together, because the same model at two thinking
 * levels is a legitimate comparison and collapsing those would silently answer a different question than
 * the user asked. Unavailable models are dropped rather than attempted: a variant that starts and
 * immediately errors is worse than one that was never offered.
 */
export function resolveCompareModels(models: readonly FanOutModel[]): FanOutModel[] {
  const seen = new Set<string>()
  const usable: FanOutModel[] = []
  for (const model of models) {
    if (!model.providerID || !model.modelID) continue
    if (model.available === false) continue
    const id = key(model)
    if (seen.has(id)) continue
    seen.add(id)
    usable.push(model)
    if (usable.length >= MAX_FAN_OUT) break
  }
  // One model is not a comparison, and running it would just be a normal turn wearing a panel.
  return usable.length >= 2 ? usable : []
}
