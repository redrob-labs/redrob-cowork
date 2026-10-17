import { createContext, use } from "react";

/**
 * True inside `CoworkShell`. A screen that brings its own frame (the session page and
 * its sidebar) reads this to leave the menu to the shell.
 */
export const CoworkFrameContext = createContext(false);

export function useInCoworkFrame(): boolean {
  return use(CoworkFrameContext);
}
