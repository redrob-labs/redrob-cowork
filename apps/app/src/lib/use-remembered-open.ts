import { useState } from "react"

/** Most remembered toggles; the oldest is dropped past this so the map cannot grow for the renderer's lifetime. */
const CAP = 500

const remembered = new Map<string, boolean>()

/**
 * An open/closed toggle that survives a remount under the same key (a group regrouped when the run
 * ends, or scrolled out of a virtual list). Keys are tool call or message ids, which are unique, and
 * the store is bounded.
 */
export function useRememberedOpen(key: string): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(() => remembered.get(key) ?? false)
  const setOpen = (value: boolean) => {
    remembered.delete(key)
    remembered.set(key, value)
    if (remembered.size > CAP) {
      const oldest = remembered.keys().next().value
      if (oldest !== undefined) remembered.delete(oldest)
    }
    setOpenState(value)
  }
  return [open, setOpen]
}
