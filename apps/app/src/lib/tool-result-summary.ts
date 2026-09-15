/**
 * Tool result summaries — the one line that says what a step actually DID.
 *
 * The engine reports a structured `metadata` object per tool call (exit code,
 * match count, lines loaded, diff stats). The UI used to drop that object at
 * parse time and could therefore only show the raw output string in a `<pre>`,
 * which is why in-progress work read as a wall of code with no report in it.
 *
 * Two halves live here on purpose:
 *  - `extractToolResultFacts` runs at parse time and keeps a small WHITELIST of
 *    scalars. Carrying the whole metadata blob would copy every command's full
 *    stdout and every file preview into UI state.
 *  - `formatToolResultSummary` renders those scalars as translated text at
 *    render time, so the summary follows the user's locale.
 */

import { t } from "@/i18n";

export type ToolResultFacts = {
  /** Process exit code (bash). `null` means the engine reported none. */
  exit?: number | null;
  /** Match count (grep). */
  matches?: number;
  /** Item count (glob, lsp). */
  count?: number;
  /** Lines or files loaded (read). */
  loaded?: number;
  /** Diff stats (edit, write, apply_patch). */
  additions?: number;
  deletions?: number;
  /** The engine cut the output short. */
  truncated?: boolean;
};

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Pull the summary scalars for `tool` out of the engine's tool metadata.
 * Returns `null` when the metadata carries nothing worth summarizing, so the
 * caller stores no key at all.
 */
export function extractToolResultFacts(tool: string, metadata: unknown): ToolResultFacts | null {
  if (!isRecord(metadata)) return null;

  const facts: ToolResultFacts = {};

  switch (tool) {
    case "bash": {
      const exit = metadata.exit;
      if (typeof exit === "number" || exit === null) facts.exit = exit;
      break;
    }
    case "grep": {
      const matches = asNumber(metadata.matches);
      if (matches !== undefined) facts.matches = matches;
      break;
    }
    case "glob": {
      const count = asNumber(metadata.count);
      if (count !== undefined) facts.count = count;
      break;
    }
    case "read": {
      const loaded = Array.isArray(metadata.loaded) ? metadata.loaded.length : undefined;
      if (loaded !== undefined) facts.loaded = loaded;
      break;
    }
    case "lsp": {
      const count = Array.isArray(metadata.result) ? metadata.result.length : undefined;
      if (count !== undefined) facts.count = count;
      break;
    }
    case "edit":
    case "write":
    case "apply_patch": {
      const filediff = isRecord(metadata.filediff) ? metadata.filediff : null;
      const additions = asNumber(filediff?.additions);
      const deletions = asNumber(filediff?.deletions);
      if (additions !== undefined) facts.additions = additions;
      if (deletions !== undefined) facts.deletions = deletions;
      break;
    }
    default:
      break;
  }

  if (metadata.truncated === true) facts.truncated = true;

  return Object.keys(facts).length > 0 ? facts : null;
}

/**
 * Translated one-line summary, or `null` when there is nothing to say. Never
 * invents a result: an absent fact produces no text rather than a zero.
 */
export function formatToolResultSummary(facts: ToolResultFacts | null | undefined): string | null {
  if (!facts) return null;

  const pieces: string[] = [];

  if (facts.exit !== undefined && facts.exit !== null) {
    pieces.push(
      facts.exit === 0
        ? t("tool_summary.exit_ok")
        : t("tool_summary.exit_code", { code: facts.exit }),
    );
  }
  if (facts.matches !== undefined) {
    pieces.push(t("tool_summary.matches", { count: facts.matches }));
  }
  if (facts.count !== undefined) {
    pieces.push(t("tool_summary.results", { count: facts.count }));
  }
  if (facts.loaded !== undefined) {
    pieces.push(t("tool_summary.lines", { count: facts.loaded }));
  }
  if (facts.additions !== undefined || facts.deletions !== undefined) {
    pieces.push(
      t("tool_summary.diff", {
        additions: facts.additions ?? 0,
        deletions: facts.deletions ?? 0,
      }),
    );
  }
  if (facts.truncated) {
    pieces.push(t("tool_summary.truncated"));
  }

  return pieces.length > 0 ? pieces.join(" · ") : null;
}

/** Read the facts back off a UI tool part's provider metadata. */
export function readToolResultFacts(
  callProviderMetadata: unknown,
): ToolResultFacts | null {
  if (!isRecord(callProviderMetadata)) return null;
  const redrob = callProviderMetadata.redrob;
  if (!isRecord(redrob)) return null;
  const facts = redrob.resultFacts;
  if (!isRecord(facts)) return null;
  return facts as ToolResultFacts;
}
