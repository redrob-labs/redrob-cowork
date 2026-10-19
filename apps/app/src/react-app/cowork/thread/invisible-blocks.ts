import { hasCoworkBlocks, parseCoworkBlocks } from "./cowork-blocks";

/** What the thread knows about a message's blocks beyond its own text. */
export type CoworkTextVisibility = {
  /** Its Plan questions still wait on the person. */
  questionsOpen: boolean;
  /** Its plan is held back because questions came with it this turn. */
  planHeld?: boolean;
};

/**
 * Whether an assistant text group draws NOTHING in
 * the Cowork thread, so the transcript can skip its message wrapper instead of leaving an empty
 * band. True only for a text that is nothing but Cowork blocks that render nothing inline:
 * - Plan questions that are answered,
 * - a plan held back until the answers come,
 * - a cross-check block (its verdict shows as chips in the answer footer).
 * Any prose, a shown plan, a still-pending block, or questions still waiting keep the group. Pure.
 */
export function isInvisibleCoworkText(text: string, visibility: CoworkTextVisibility): boolean {
  const blocks = parseCoworkBlocks(text);
  if (!hasCoworkBlocks(blocks) || blocks.pending) return false;
  if (blocks.prose.trim()) return false;
  if (blocks.questions && visibility.questionsOpen) return false;
  // A plan beside questions is always held (see CoworkBlocksView); otherwise the thread says.
  if (blocks.plan && !blocks.questions && !visibility.planHeld) return false;
  return true;
}
