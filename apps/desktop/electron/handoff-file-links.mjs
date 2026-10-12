import path from "node:path";

/**
 * A double-clicked `.redrobhandoff` arrives as a file path: in argv on Windows and Linux (first
 * launch and second-instance), and as an `open-file` event on macOS. The renderer already takes
 * deep links, so a path becomes `<scheme>://open-handoff?file=<absolute path>` and goes the same
 * way. The renderer only opens a preview; nothing is written until the person confirms.
 */

export const HANDOFF_EXTENSION = ".redrobhandoff";
/** A teammate's reply to a handoff, opened on the machine that sent it. */
export const REPLY_EXTENSION = ".redrobreply";

export function isHandoffFilePath(value) {
  if (typeof value !== "string") return false;
  const lower = value.trim().toLowerCase();
  return lower.endsWith(HANDOFF_EXTENSION) || lower.endsWith(REPLY_EXTENSION);
}

export function handoffLinkForPath(filePath, scheme) {
  return `${scheme}://open-handoff?file=${encodeURIComponent(path.resolve(filePath))}`;
}

/** Links for every existing handoff file named in argv. Flags and the executable are skipped. */
export function handoffLinksFromArgv(argv, { scheme, exists }) {
  return argv
    .slice(1)
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry && !entry.startsWith("-") && isHandoffFilePath(entry) && exists(entry))
    .map((entry) => handoffLinkForPath(entry, scheme));
}
