/**
 * Running one prompt on several models at once.
 *
 * Two features, one primitive. COMPARE takes models the user named and runs the same prompt on each.
 * SHUFFLE picks a few for them, for the case where the question is not "is A better than B" but "is
 * there something better than what I default to".
 *
 * Each run gets its OWN SESSION rather than a second answer inside one. That is not a UI shortcut, it is
 * the only version that stays honest: a transcript is a conversation with one model, and two models
 * answering in one transcript would then each see the other's reply as if it were their own earlier turn.
 * Reverting and re-asking in a single session has the matching problem in time - the previous attempt is
 * gone, so there is nothing left to compare against.
 *
 * The decisions here are separated from the plumbing that creates sessions because they are the part with
 * rules worth pinning: what a duplicate means, what happens when fewer models are available than were
 * asked for, and the fact that shuffle must not hand back the same set every time while still being
 * testable.
 */

export type FanOutModel = {
  providerID: string
  modelID: string
  /** Kept so a caller can honour a session's variant, e.g. a thinking level. */
  variant?: string | null
  /** False when the model is listed but cannot currently be used, e.g. no connected provider. */
  available?: boolean
}

/** How many sessions one action may open. Past this it is not a comparison, it is a mess to close. */
export const MAX_FAN_OUT = 5

/** What shuffle picks when the caller does not say. Three fits on screen and reads as a set. */
export const DEFAULT_SHUFFLE_COUNT = 3

const key = (model: FanOutModel) => `${model.providerID}/${model.modelID}/${model.variant ?? ""}`

/**
 * The two commands that start a fan-out, parsed off a draft.
 *
 * Commands rather than a new menu section, for one reason that matters more than tidiness: the prompt has
 * to come with them. `/shuffle explain this regex` says what to run and on how many models in one line,
 * where a menu item would have to guess which text it applied to. They also appear in the slash menu the
 * composer already shows, so the feature is discoverable without a fifth panel in the tool menu.
 *
 * `/compare` names models explicitly and `/shuffle` lets the app pick, which is the only real difference
 * between the two features. Everything after the command word, minus a leading count or model list, is
 * the prompt.
 */
export type FanOutCommand =
  | { kind: "shuffle"; count: number; prompt: string }
  | { kind: "compare"; modelIDs: string[]; prompt: string }

export function parseFanOutCommand(content: string): FanOutCommand | null {
  const text = content.trim()
  const shuffle = /^\/shuffle(?:\s+(\d+))?(?:\s+([\s\S]*))?$/i.exec(text)
  if (shuffle) {
    const count = shuffle[1] ? Number.parseInt(shuffle[1], 10) : DEFAULT_SHUFFLE_COUNT
    return {
      kind: "shuffle",
      count: Math.max(1, Math.min(Number.isFinite(count) ? count : DEFAULT_SHUFFLE_COUNT, MAX_FAN_OUT)),
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
 * The models a COMPARE should actually run.
 *
 * Duplicates are dropped by provider, model and variant together, because the same model at two thinking
 * levels is a legitimate comparison and collapsing those would silently answer a different question than
 * the user asked. Unavailable models are dropped rather than attempted: a session that opens and
 * immediately errors is worse than not opening.
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
  // One model is not a comparison. Returning it anyway would open a session that looks like a normal
  // one and leave the user wondering what the action did.
  return usable.length >= 2 ? usable : []
}

/**
 * The models a SHUFFLE should run.
 *
 * `random` is injected so the choice is testable: a shuffle whose spread cannot be asserted is a shuffle
 * nobody can tell apart from picking the first N. `exclude` keeps the session's current model out of the
 * draw, since including it would spend one of very few slots on the answer the user already has.
 */
export function resolveShuffleModels(input: {
  models: readonly FanOutModel[]
  count?: number
  exclude?: FanOutModel | null
  random?: () => number
}): FanOutModel[] {
  const random = input.random ?? Math.random
  const excluded = input.exclude ? key(input.exclude) : null
  const seen = new Set<string>()
  const pool: FanOutModel[] = []
  for (const model of input.models) {
    if (!model.providerID || !model.modelID) continue
    if (model.available === false) continue
    const id = key(model)
    if (id === excluded || seen.has(id)) continue
    seen.add(id)
    pool.push(model)
  }
  const wanted = Math.max(1, Math.min(input.count ?? DEFAULT_SHUFFLE_COUNT, MAX_FAN_OUT))
  // Fisher-Yates over a copy, so the caller's list is not reordered under it.
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const held = pool[index] as FanOutModel
    pool[index] = pool[swap] as FanOutModel
    pool[swap] = held
  }
  // Fewer models available than asked for is not an error: run what there is. Zero means the caller has
  // nothing to run and should say so rather than opening an empty session.
  return pool.slice(0, wanted)
}

/**
 * The title a fanned-out session should carry.
 *
 * Named after the model rather than the prompt, because the whole point is telling several sessions with
 * the SAME prompt apart in a sidebar. The prompt is identical in every one of them, so using it as the
 * title would produce a column of rows nobody can distinguish.
 */
export function fanOutSessionTitle(input: { model: FanOutModel; index: number; total: number }): string {
  const variant = input.model.variant ? ` ${input.model.variant}` : ""
  return `${input.model.modelID}${variant} (${input.index + 1}/${input.total})`
}
