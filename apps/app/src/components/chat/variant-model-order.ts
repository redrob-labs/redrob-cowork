/**
 * The order models appear in when picking one for a paraphrase or a compare.
 *
 * Three hundred rows in a popover is a list nobody reads to the end, so the order has to put the useful
 * ones where the eye lands. `auto` first because it is the default and the recommended entry. Then the
 * families people actually reach for by name, in the order they were asked for. Then everything else,
 * alphabetically, so a reader scanning for a specific id knows where to look instead of guessing.
 *
 * Pinning is ordering, NOT filtering: every model stays in the list and a search still reaches all of
 * them. A filter would have quietly answered "these are the models you have", which is not true.
 *
 * The families are matched on the id rather than the vendor field because the id is what the reader sees
 * and what they type into the search box; a vendor label can be `Anthracite Org` while the id says
 * `magnum`, and matching the label would put rows where nobody looks for them.
 */

const PINNED_FAMILIES = ["grok", "claude", "gpt", "deepseek"] as const

export type OrderableModel = { providerID: string; modelID: string }

/** Which pinned family an id belongs to, or -1. Lower wins, in the order above. */
function familyRank(modelID: string): number {
  const id = modelID.toLowerCase()
  for (let index = 0; index < PINNED_FAMILIES.length; index += 1) {
    if (id.includes(PINNED_FAMILIES[index] as string)) return index
  }
  return -1
}

export function orderVariantModels<T extends OrderableModel>(models: readonly T[]): T[] {
  return [...models].sort((left, right) => {
    const leftAuto = left.modelID === "auto"
    const rightAuto = right.modelID === "auto"
    if (leftAuto !== rightAuto) return leftAuto ? -1 : 1

    const leftFamily = familyRank(left.modelID)
    const rightFamily = familyRank(right.modelID)
    const leftPinned = leftFamily >= 0
    const rightPinned = rightFamily >= 0
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
    if (leftPinned && rightPinned && leftFamily !== rightFamily) return leftFamily - rightFamily

    // Alphabetical within a group, and `localeCompare` so digits inside an id sort the way a reader expects.
    return left.modelID.localeCompare(right.modelID, undefined, { numeric: true })
  })
}
