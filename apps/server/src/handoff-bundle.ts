import { createHash, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ReviewAuthor, SessionReview } from "./review-store.js";
import type { EngineSessionExport } from "./session-export.js";
import { findSecretsInText, isScannableText, maskSecret, redactMatches, type SecretKind } from "./text-secrets.js";
import { ZIP_LIMITS, writeZip, type ZipEntry } from "./zip.js";

/**
 * A `.redrobhandoff`: one session packed for a teammate. See
 * docs/features/handoff-and-live-coworking/README.md, "The bundle".
 *
 * Built in two steps so nothing leaves without the sender seeing it: a draft (every entry, every
 * secret-looking value, every file that could be added) and then the bundle, made from the same
 * draft with the sender's decisions applied. The fingerprint ties the two together.
 */

export const HANDOFF_FORMAT = "redrob-handoff";
export const HANDOFF_VERSION = 1;
export const HANDOFF_EXTENSION = ".redrobhandoff";

export const HANDOFF_ASKS = ["review", "continue", "approve"] as const;
export type HandoffAsk = (typeof HANDOFF_ASKS)[number];

export type HandoffEntryKind = "engine" | "transcript" | "desk" | "review" | "produced" | "read" | "skill" | "command";

export type HandoffManifest = {
  format: typeof HANDOFF_FORMAT;
  v: typeof HANDOFF_VERSION;
  id: string;
  createdAt: string;
  from: ReviewAuthor;
  to?: string;
  ask: HandoffAsk;
  note?: string;
  workspace: { name: string };
  session: { id: string; title: string };
  engine: { redrobCodeVersion: string };
  contents: Array<{ path: string; kind: HandoffEntryKind; bytes: number; sha256: string }>;
  /** sha256 over `path:sha256\n` of every content entry, in path order. */
  digest: string;
};

export type DraftEntry = { path: string; kind: HandoffEntryKind; data: Buffer; scannable: boolean };

export type HandoffFinding = {
  id: string;
  path: string;
  kind: SecretKind;
  masked: string;
  /** 1-based line of the value in its entry, for "where". */
  line: number;
};

export type HandoffDraft = {
  entries: DraftEntry[];
  /** Files the agent read, not included unless the sender ticks them, as workspace-relative paths. */
  readCandidates: string[];
  /** Produced files the transcript names but this machine no longer has. */
  missing: string[];
  findings: HandoffFinding[];
  /** Entries that could not be scanned (binary files); shown so the sender knows. */
  unscanned: string[];
  fingerprint: string;
};

/** Never carried, whatever the transcript names: they run code or hold credentials on the receiver. */
const NEVER_CARRIED = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)credentials\.(json|ya?ml)$/,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)\.opencode\/(plugins?|tools?)\//,
  /(^|\/)opencode\.jsonc?$/,
  /(^|\/)\.git\//,
  /(^|\/)node_modules\//,
];

export function isNeverCarried(relativePath: string): boolean {
  return NEVER_CARRIED.some((pattern) => pattern.test(relativePath));
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

export function createHandoffId(): string {
  return `hof_${randomBytes(12).toString("hex")}`;
}

const HANDOFF_ID_RE = /^hof_[a-f0-9]{24}$/;
export function isHandoffId(value: unknown): value is string {
  return typeof value === "string" && HANDOFF_ID_RE.test(value);
}

/* ---------- What the session touched ---------- */

const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "patch"]);
const READ_TOOLS = new Set(["read"]);

function toolPath(part: Record<string, unknown>): string | null {
  const state = part.state;
  if (!state || typeof state !== "object") return null;
  const input = (state as Record<string, unknown>).input;
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const value = record.filePath ?? record.file_path ?? record.path;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fileUrlPath(part: Record<string, unknown>): string | null {
  const url = part.url;
  if (typeof url !== "string" || !url.startsWith("file://")) return null;
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
}

/** Absolute paths of files the session wrote and files it only read, in first-seen order. */
export function sessionFiles(exported: EngineSessionExport, sessionDirectory: string): { produced: string[]; read: string[] } {
  const produced: string[] = [];
  const read: string[] = [];
  const add = (into: string[], value: string | null) => {
    if (!value) return;
    const absolute = isAbsolute(value) ? resolve(value) : resolve(sessionDirectory, value);
    if (!into.includes(absolute)) into.push(absolute);
  };
  for (const message of exported.messages) {
    for (const part of message.parts) {
      if (part.type === "tool" && typeof part.tool === "string") {
        if (WRITE_TOOLS.has(part.tool)) add(produced, toolPath(part));
        else if (READ_TOOLS.has(part.tool)) add(read, toolPath(part));
      } else if (part.type === "file" && message.info.role === "assistant") {
        add(produced, fileUrlPath(part));
      }
    }
  }
  return { produced, read: read.filter((path) => !produced.includes(path)) };
}

/** `files/<path inside the workspace>`, or null for a file outside it or one never carried. */
export function bundleFilePath(absolute: string, workspaceRoot: string): string | null {
  const rel = relative(resolve(workspaceRoot), absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  const posix = rel.split(sep).join("/");
  return isNeverCarried(posix) ? null : `files/${posix}`;
}

/* ---------- Readable parts ---------- */

function textOf(parts: EngineSessionExport["messages"][number]["parts"], type: string): string {
  return parts
    .filter((part) => part.type === type && typeof part.text === "string" && !part.synthetic)
    .map((part) => String(part.text))
    .join("\n\n")
    .trim();
}

/** The conversation as Markdown, for reading outside the app and as the fallback's seed. */
export function transcriptMarkdown(exported: EngineSessionExport): string {
  const title = typeof exported.info.title === "string" && exported.info.title.trim() ? exported.info.title.trim() : "Session";
  const lines = [`# ${title}`, ""];
  for (const message of exported.messages) {
    const role = message.info.role === "user" ? "User" : message.info.role === "assistant" ? "Assistant" : message.info.role;
    const body = textOf(message.parts, "text");
    const tools = message.parts
      .filter((part) => part.type === "tool" && typeof part.tool === "string")
      .map((part) => `- ${String(part.tool)}${toolPath(part) ? `: ${toolPath(part)}` : ""}`);
    if (!body && tools.length === 0) continue;
    lines.push(`## ${role}`, "");
    if (body) lines.push(body, "");
    if (tools.length) lines.push(...tools, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

const DESK_TAGS = ["redrob-plan", "redrob-check"] as const;
const FENCE_RE = new RegExp("```[ \\t]*(" + DESK_TAGS.join("|") + ")[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n[ \\t]*```", "g");

/** The plan and check blocks of each answer, as the agents wrote them. The app re-validates them. */
export function deskBlocksOf(exported: EngineSessionExport): Array<{ messageId: string; plan?: unknown; check?: unknown }> {
  const out: Array<{ messageId: string; plan?: unknown; check?: unknown }> = [];
  for (const message of exported.messages) {
    if (message.info.role !== "assistant") continue;
    const text = textOf(message.parts, "text");
    const found: { messageId: string; plan?: unknown; check?: unknown } = { messageId: message.info.id };
    FENCE_RE.lastIndex = 0;
    for (let match = FENCE_RE.exec(text); match; match = FENCE_RE.exec(text)) {
      const key = match[1] === "redrob-plan" ? "plan" : "check";
      if (found[key] !== undefined) continue;
      try {
        found[key] = JSON.parse(match[2] ?? "");
      } catch {
        // A block that does not parse renders as prose in the app too.
      }
    }
    if (found.plan !== undefined || found.check !== undefined) out.push(found);
  }
  return out;
}

/* ---------- The draft ---------- */

export type DraftInput = {
  exported: EngineSessionExport;
  review: SessionReview;
  workspaceRoot: string;
  sessionDirectory: string;
  skills: Array<{ name: string; content: string }>;
  commands: Array<{ name: string; template: string; description?: string }>;
  /** Workspace-relative paths of read files the sender chose to add. */
  includeRead: readonly string[];
};

const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

async function readCarriedFile(absolute: string): Promise<Buffer | null> {
  try {
    const info = await stat(absolute);
    if (!info.isFile() || info.size > ZIP_LIMITS.entryBytes) return null;
    return await readFile(absolute);
  } catch {
    return null;
  }
}

function safeName(name: string): string | null {
  const cleaned = name.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(cleaned) ? cleaned : null;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (text.charCodeAt(cursor) === 10) line += 1;
  return line;
}

export function findingId(path: string, start: number, value: string): string {
  return `fnd_${sha256(`${path}\0${start}\0${value}`).slice(0, 16)}`;
}

function scan(entries: readonly DraftEntry[]): { findings: HandoffFinding[]; unscanned: string[] } {
  const findings: HandoffFinding[] = [];
  const unscanned: string[] = [];
  for (const entry of entries) {
    if (!entry.scannable) {
      unscanned.push(entry.path);
      continue;
    }
    const text = entry.data.toString("utf8");
    for (const match of findSecretsInText(text)) {
      findings.push({
        id: findingId(entry.path, match.start, match.value),
        path: entry.path,
        kind: match.kind,
        masked: maskSecret(match.value),
        line: lineAt(text, match.start),
      });
    }
  }
  return { findings, unscanned };
}

export function draftFingerprint(entries: readonly DraftEntry[]): string {
  const lines = [...entries].sort((a, b) => a.path.localeCompare(b.path)).map((entry) => `${entry.path}:${sha256(entry.data)}`);
  return sha256(lines.join("\n"));
}

export async function buildHandoffDraft(input: DraftInput): Promise<HandoffDraft> {
  const entries: DraftEntry[] = [];
  const add = (path: string, kind: HandoffEntryKind, data: Buffer) => {
    if (entries.some((entry) => entry.path === path)) return;
    entries.push({ path, kind, data, scannable: isScannableText(data) });
  };
  add("session/engine.json", "engine", json(input.exported));
  add("session/transcript.md", "transcript", Buffer.from(transcriptMarkdown(input.exported), "utf8"));
  add("session/desk.json", "desk", json(deskBlocksOf(input.exported)));
  add("session/review.json", "review", json(input.review));

  const touched = sessionFiles(input.exported, input.sessionDirectory);
  const missing: string[] = [];
  for (const absolute of touched.produced) {
    const path = bundleFilePath(absolute, input.workspaceRoot);
    if (!path) continue;
    const data = await readCarriedFile(absolute);
    if (data) add(path, "produced", data);
    else missing.push(path.slice("files/".length));
  }
  const readCandidates: string[] = [];
  const wanted = new Set(input.includeRead);
  for (const absolute of touched.read) {
    const path = bundleFilePath(absolute, input.workspaceRoot);
    if (!path) continue;
    const rel = path.slice("files/".length);
    readCandidates.push(rel);
    if (!wanted.has(rel)) continue;
    const data = await readCarriedFile(absolute);
    if (data) add(path, "read", data);
  }
  for (const skill of input.skills) {
    const name = safeName(skill.name);
    if (name) add(`workspace/skills/${name}/SKILL.md`, "skill", Buffer.from(skill.content, "utf8"));
  }
  for (const command of input.commands) {
    const name = safeName(command.name);
    if (name) add(`workspace/commands/${name}.json`, "command", json(command));
  }

  const { findings, unscanned } = scan(entries);
  return { entries, readCandidates, missing, findings, unscanned, fingerprint: draftFingerprint(entries) };
}

/* ---------- The bundle ---------- */

export type HandoffDecisions = {
  /** Findings to leave as they are. Every other finding is redacted. */
  keep: ReadonlySet<string>;
  /** Produced, read, skill or command entries to leave out. */
  exclude: ReadonlySet<string>;
};

export class HandoffBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffBuildError";
  }
}

const EXCLUDABLE: ReadonlySet<HandoffEntryKind> = new Set(["produced", "read", "skill", "command"]);

/** The draft's entries with the decisions applied: left-out entries dropped, findings redacted. */
export function applyDecisions(draft: HandoffDraft, decisions: HandoffDecisions): DraftEntry[] {
  const out: DraftEntry[] = [];
  for (const entry of draft.entries) {
    if (decisions.exclude.has(entry.path)) {
      if (!EXCLUDABLE.has(entry.kind)) throw new HandoffBuildError(`${entry.path} cannot be left out`);
      continue;
    }
    if (!entry.scannable) {
      out.push(entry);
      continue;
    }
    const text = entry.data.toString("utf8");
    const redact = findSecretsInText(text).filter((match) => !decisions.keep.has(findingId(entry.path, match.start, match.value)));
    if (redact.length === 0) {
      out.push(entry);
      continue;
    }
    const redacted = redactMatches(text, redact);
    if (entry.path.endsWith(".json")) {
      try {
        JSON.parse(redacted);
      } catch {
        throw new HandoffBuildError(`Redacting ${entry.path} broke it; leave that value in or remove the item`);
      }
    }
    out.push({ ...entry, data: Buffer.from(redacted, "utf8") });
  }
  return out;
}

export function contentsDigest(contents: HandoffManifest["contents"]): string {
  return sha256([...contents].sort((a, b) => a.path.localeCompare(b.path)).map((entry) => `${entry.path}:${entry.sha256}`).join("\n"));
}

export type BundleMeta = {
  id?: string;
  now?: Date;
  from: ReviewAuthor;
  to?: string;
  ask: HandoffAsk;
  note?: string;
  workspaceName: string;
  sessionTitle: string;
  sessionId: string;
  redrobCodeVersion: string;
};

export function writeHandoffBundle(entries: readonly DraftEntry[], meta: BundleMeta): { manifest: HandoffManifest; zip: Buffer } {
  const contents = entries.map((entry) => ({ path: entry.path, kind: entry.kind, bytes: entry.data.length, sha256: sha256(entry.data) }));
  const manifest: HandoffManifest = {
    format: HANDOFF_FORMAT,
    v: HANDOFF_VERSION,
    id: meta.id ?? createHandoffId(),
    createdAt: (meta.now ?? new Date()).toISOString(),
    from: meta.from,
    ...(meta.to?.trim() ? { to: meta.to.trim() } : {}),
    ask: meta.ask,
    ...(meta.note?.trim() ? { note: meta.note.trim() } : {}),
    workspace: { name: meta.workspaceName },
    session: { id: meta.sessionId, title: meta.sessionTitle },
    engine: { redrobCodeVersion: meta.redrobCodeVersion },
    contents,
    digest: contentsDigest(contents),
  };
  const zipEntries: ZipEntry[] = [{ name: "manifest.json", data: json(manifest) }, ...entries.map((entry) => ({ name: entry.path, data: entry.data }))];
  return { manifest, zip: writeZip(zipEntries) };
}

/** `lease-review-2026-10-08.redrobhandoff`: the title's words, then the day. */
export function handoffFileName(title: string, now = new Date()): string {
  const slug =
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "session";
  return `${slug}-${now.toISOString().slice(0, 10)}${HANDOFF_EXTENSION}`;
}
