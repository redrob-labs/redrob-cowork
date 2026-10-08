/**
 * Secret-looking values inside free text: transcripts, tool output, files.
 *
 * The workspace export detectors (workspace-export-safety.ts) judge config keys and values one at a
 * time. A transcript has no keys, so this finds the same value shapes by position, so each one can
 * be shown and redacted where it is. Words such as "password" in prose are not findings; a value
 * assigned to one is.
 */

export type SecretKind = "bearer" | "token" | "jwt" | "private-key" | "assignment";
export type SecretMatch = { kind: SecretKind; start: number; end: number; value: string };

const PATTERNS: Array<{ kind: SecretKind; re: RegExp; group?: number }> = [
  { kind: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: "bearer", re: /\bBearer\s+([A-Za-z0-9._~+/-]{12,}=*)/g, group: 1 },
  // The same prefixes the export check knows: GitHub, Slack, OpenAI-style, AWS, Google.
  { kind: "token", re: /\b(?:ghp|gho|ghu|ghs|github_pat|xox[baprs]|sk|rk|AKIA|ASIA|AIza)[-_A-Za-z0-9]{16,}\b/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b/g },
  {
    kind: "assignment",
    re: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|passwd|token)\b["']?\s*[:=]\s*["']?([^\s"'`,;\\]{8,})/gi,
    group: 1,
  },
];

/** Every finding, earliest first, with overlaps dropped in favour of the earlier, longer one. */
export function findSecretsInText(text: string): SecretMatch[] {
  const found: SecretMatch[] = [];
  for (const { kind, re, group } of PATTERNS) {
    re.lastIndex = 0;
    for (let match = re.exec(text); match; match = re.exec(text)) {
      const value = group ? match[group] : match[0];
      if (!value) continue;
      const start = match.index + (group ? match[0].indexOf(value) : 0);
      found.push({ kind, start, end: start + value.length, value });
      if (match[0].length === 0) re.lastIndex += 1;
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: SecretMatch[] = [];
  for (const match of found) {
    const last = kept[kept.length - 1];
    if (last && match.start < last.end) continue;
    kept.push(match);
  }
  return kept;
}

export const REDACTED = "[REDACTED]";

/** The text with the given matches replaced. Matches must come from this same text. */
export function redactMatches(text: string, matches: readonly SecretMatch[]): string {
  let output = "";
  let cursor = 0;
  for (const match of [...matches].sort((a, b) => a.start - b.start)) {
    if (match.start < cursor) continue;
    output += text.slice(cursor, match.start) + REDACTED;
    cursor = match.end;
  }
  return output + text.slice(cursor);
}

/** A finding as it can be shown: the kind, and the value with all but its edges hidden. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}

/** Whether a buffer is text this scan can read: valid UTF-8 without NUL bytes. */
export function isScannableText(data: Buffer): boolean {
  if (data.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return true;
  } catch {
    return false;
  }
}
