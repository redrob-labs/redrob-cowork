import { cn } from "@/lib/utils"

/**
 * The one chat column.
 *
 * Both the transcript and the composer have to sit on the same left and right edge, and they have drifted
 * apart twice now for two different reasons. The first was two different widths, fixed by having both read
 * `--ow-chat-column`. The second is subtler and is what this file exists for: the two columns are centred
 * inside wrappers whose OWN horizontal padding differed, `px-3 sm:px-5` for the scroll area against
 * `px-4 max-lg:px-3 lg:px-8` for the composer. While the window is wider than the column, centring absorbs
 * that difference and the edges line up, which is why measuring at one width said the job was done. Once
 * the window is narrow enough for the padding to decide the width, the difference appears directly, and a
 * reader sees the reply start a few pixels outside the box they type into.
 *
 * So the inset is defined once, here, and used by both sides. `CHAT_COLUMN_OUTER` is for the containers
 * that hold a column, and `CHAT_COLUMN` for the column itself.
 */

/**
 * The padding a container that holds the chat column must use, on both sides of the transcript.
 *
 * The inset lives HERE and nowhere else. It was on the column itself, and that failed twice for the same
 * reason in two directions: a row whose own padding is overridden by the component it is handed to loses
 * the inset, and a column nested inside another column applies it twice. Neither is visible in a diff.
 * With the inset on the container only, the column's edge IS the content edge, so a reply and the box the
 * user types into start at the same pixel whatever either component does with its own classes.
 */
export const CHAT_COLUMN_OUTER = "px-5"

/**
 * The scroll container that holds the transcript needs this as well.
 *
 * The transcript scrolls and the composer does not, so the scrollbar takes its width out of the
 * transcript's content box only. Centring a fixed-width column inside a box that is a scrollbar narrower
 * puts it half a scrollbar to the left of the identical column in the composer, which is the last few
 * pixels of this misalignment and the reason it survived being measured on a wide window: the offset is
 * there at every width, it is just small.
 *
 * `stable both-edges` reserves the gutter on BOTH sides, so the content box stays symmetric whether or not
 * a scrollbar is showing and the centred column lands in the same place as the composer's.
 */
export const CHAT_SCROLL_GUTTER = "[scrollbar-gutter:stable_both-edges]"

/** The column: capped at the shared width and centred. No padding of its own, by design - see above. */
export const CHAT_COLUMN = "mx-auto w-full max-w-[var(--ow-chat-column)]"

export function ChatColumn({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn(CHAT_COLUMN, className)}>{children}</div>
}
