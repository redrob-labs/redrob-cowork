import { hasCoworkBlocks, parseCoworkBlocks } from "./cowork-blocks";

/**
 * Round 7 (review of C1/C7): whether an assistant text group draws NOTHING in the Cowork thread,
 * so the transcript can skip its message wrapper instead of leaving an empty band. True only for a
 * text that is nothing but Cowork blocks that render nothing inline:
 * - Plan questions once they are no longer the latest turn (answered or superseded; C1), and
 * - a cross-check block (its verdict shows as chips in the answer footer).
 * Any prose, a plan, or questions still waiting on the person keeps the group. Pure.
 */
export function isInvisibleCoworkText(text: string, isLatest: boolean): boolean {
  const blocks = parseCoworkBlocks(text);
  if (!hasCoworkBlocks(blocks) || blocks.pending) return false;
  if (blocks.prose.trim() || blocks.plan) return false;
  if (blocks.questions && isLatest) return false;
  return true;
}
