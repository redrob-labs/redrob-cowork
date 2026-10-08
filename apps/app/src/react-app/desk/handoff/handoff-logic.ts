import type {
  RedrobHandoffAsk,
  RedrobHandoffEntryKind,
  RedrobHandoffFinding,
  RedrobHandoffPreview,
  RedrobHandoffRequest,
} from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";

export const HANDOFF_ASKS: readonly RedrobHandoffAsk[] = ["review", "continue", "approve"];

/** What the sender has chosen so far. Findings are redacted unless kept. */
export type HandoffChoices = {
  ask: RedrobHandoffAsk;
  to: string;
  note: string;
  includeRead: string[];
  keep: string[];
  exclude: string[];
};

export function initialChoices(): HandoffChoices {
  return { ask: "review", to: "", note: "", includeRead: [], keep: [], exclude: [] };
}

export function handoffRequest(choices: HandoffChoices, fingerprint: string): RedrobHandoffRequest {
  return {
    ask: choices.ask,
    ...(choices.to.trim() ? { to: choices.to.trim() } : {}),
    ...(choices.note.trim() ? { note: choices.note.trim() } : {}),
    includeRead: choices.includeRead,
    keep: choices.keep,
    exclude: choices.exclude,
    fingerprint,
  };
}

export function toggle(list: readonly string[], value: string, on: boolean): string[] {
  const rest = list.filter((entry) => entry !== value);
  return on ? [...rest, value] : rest;
}

/** Items the sender may leave out. The conversation itself always goes. */
export function isOptional(kind: RedrobHandoffEntryKind): boolean {
  return kind === "produced" || kind === "read" || kind === "skill" || kind === "command";
}

/** The optional items, grouped the way the dialog lists them. */
export function optionalEntries(preview: RedrobHandoffPreview) {
  const pick = (kinds: RedrobHandoffEntryKind[]) => preview.entries.filter((entry) => kinds.includes(entry.kind));
  return { files: pick(["produced", "read"]), library: pick(["skill", "command"]) };
}

/** `files/notes/a.md` as `notes/a.md`; `workspace/skills/x/SKILL.md` as `x`. */
export function entryLabel(path: string): string {
  if (path.startsWith("files/")) return path.slice("files/".length);
  const skill = /^workspace\/skills\/([^/]+)\/SKILL\.md$/.exec(path);
  if (skill) return skill[1]!;
  const command = /^workspace\/commands\/([^/]+)\.json$/.exec(path);
  if (command) return command[1]!;
  return path;
}

export function findingKindLabel(kind: RedrobHandoffFinding["kind"]): string {
  switch (kind) {
    case "bearer":
    case "token":
      return t("desk.handoff_secret_token");
    case "jwt":
      return t("desk.handoff_secret_jwt");
    case "private-key":
      return t("desk.handoff_secret_private_key");
    case "assignment":
      return t("desk.handoff_secret_assignment");
  }
}

/** Where a finding is, in words: the conversation, or a file and line. */
export function findingWhere(finding: RedrobHandoffFinding): string {
  if (finding.path.startsWith("session/")) return t("desk.handoff_where_chat");
  return t("desk.handoff_where_file", { name: entryLabel(finding.path), line: finding.line });
}

/** Findings in items that are still going, so a left-out file's findings stop asking for a decision. */
export function liveFindings(preview: RedrobHandoffPreview, exclude: readonly string[]): RedrobHandoffFinding[] {
  return preview.findings.filter((finding) => !exclude.includes(finding.path));
}

export function askLabel(ask: RedrobHandoffAsk): string {
  switch (ask) {
    case "review":
      return t("desk.handoff_ask_review");
    case "continue":
      return t("desk.handoff_ask_continue");
    case "approve":
      return t("desk.handoff_ask_approve");
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Saves bytes as a file through the browser or the desktop shell's download handling. */
export function downloadBytes(filename: string, data: ArrayBuffer, mimeType: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
