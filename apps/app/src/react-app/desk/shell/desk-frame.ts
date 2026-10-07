import { createContext, use } from "react";

/**
 * True inside `DeskShell`. A screen that brings its own frame (the session page and
 * its sidebar) reads this to leave the menu to the shell.
 */
export const DeskFrameContext = createContext(false);

export function useInDeskFrame(): boolean {
  return use(DeskFrameContext);
}
