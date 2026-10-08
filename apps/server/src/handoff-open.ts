import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  HANDOFF_ASKS,
  HANDOFF_EXTENSION,
  HANDOFF_FORMAT,
  HANDOFF_VERSION,
  contentsDigest,
  isHandoffId,
  isNeverCarried,
  type HandoffAsk,
  type HandoffEntryKind,
  type HandoffManifest,
} from "./handoff-bundle.js";
import { engineId } from "./engine-ids.js";
import { readAuthor, readComment, readState, type ReviewComment, type ReviewState } from "./review-store.js";
import { readEngineSessionExport, type EngineSessionExport } from "./session-export.js";
import { isRecord } from "./workspace-kv-store.js";
import { ZIP_LIMITS, readZip } from "./zip.js";

/**
 * Opening a `.redrobhandoff` someone sent: every check happens before anything is written, and the
 * file is trusted for nothing its digest does not cover. A bundle is a file from outside; the
 * person opening it has said only that they want to look.
 */

export class HandoffOpenError extends Error {
  constructor(
    readonly code: "handoff_invalid" | "handoff_unsupported" | "handoff_tampered" | "handoff_target_not_empty",
    message: string,
  ) {
    super(message);
    this.name = "HandoffOpenError";
  }
}

export type OpenedBundle = {
  manifest: HandoffManifest;
  exported: EngineSessionExport;
  transcript: string;
  review: { comments: ReviewComment[]; state: ReviewState };
  desk: unknown[];
  files: Array<{ relativePath: string; kind: "produced" | "read"; data: Buffer }>;
  skills: Array<{ name: string; content: string }>;
  commands: Array<{ name: string; template: string; description?: string }>;
};

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

const KIND_FOR_PATH: Array<[RegExp, HandoffEntryKind]> = [
  [/^session\/engine\.json$/, "engine"],
  [/^session\/transcript\.md$/, "transcript"],
  [/^session\/desk\.json$/, "desk"],
  [/^session\/review\.json$/, "review"],
  [/^files\/.+$/, "produced"],
  [/^workspace\/skills\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/SKILL\.md$/, "skill"],
  [/^workspace\/commands\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.json$/, "command"],
];

function allowedKind(path: string): HandoffEntryKind | null {
  return KIND_FOR_PATH.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}

function readManifest(value: unknown): HandoffManifest {
  if (!isRecord(value) || value.format !== HANDOFF_FORMAT) throw new HandoffOpenError("handoff_invalid", "This is not a handoff file");
  if (value.v !== HANDOFF_VERSION) {
    throw new HandoffOpenError("handoff_unsupported", "This handoff was made by a newer Redrob Cowork. Update the app to open it");
  }
  const from = readAuthor(value.from);
  const ask = typeof value.ask === "string" && (HANDOFF_ASKS as readonly string[]).includes(value.ask) ? (value.ask as HandoffAsk) : null;
  if (!isHandoffId(value.id) || !from || !ask || !isRecord(value.session) || typeof value.session.id !== "string") {
    throw new HandoffOpenError("handoff_invalid", "The handoff's details are incomplete");
  }
  if (!Array.isArray(value.contents) || typeof value.digest !== "string") {
    throw new HandoffOpenError("handoff_invalid", "The handoff does not list what it carries");
  }
  const contents = value.contents.map((entry) => {
    if (!isRecord(entry) || typeof entry.path !== "string" || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") {
      throw new HandoffOpenError("handoff_invalid", "The handoff's contents list is damaged");
    }
    return { path: entry.path, kind: (entry.kind as HandoffEntryKind) ?? "produced", bytes: entry.bytes, sha256: entry.sha256 };
  });
  const text = (field: unknown, max: number) => (typeof field === "string" && field.trim() ? Array.from(field.trim()).slice(0, max).join("") : undefined);
  const to = text(value.to, 120);
  const note = text(value.note, 1000);
  return {
    format: HANDOFF_FORMAT,
    v: HANDOFF_VERSION,
    id: value.id,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    from,
    ...(to ? { to } : {}),
    ask,
    ...(note ? { note } : {}),
    workspace: { name: isRecord(value.workspace) && typeof value.workspace.name === "string" ? value.workspace.name.slice(0, 120) : "" },
    session: {
      id: value.session.id,
      title: typeof value.session.title === "string" ? value.session.title.slice(0, 200) : "",
    },
    engine: {
      redrobCodeVersion: isRecord(value.engine) && typeof value.engine.redrobCodeVersion === "string" ? value.engine.redrobCodeVersion : "",
    },
    contents,
    digest: value.digest,
  };
}

function parseJson(data: Buffer, what: string): unknown {
  try {
    return JSON.parse(data.toString("utf8"));
  } catch {
    throw new HandoffOpenError("handoff_invalid", `The handoff's ${what} is damaged`);
  }
}

/**
 * The bundle, checked: a known format, every entry listed with its hash, nothing listed missing,
 * nothing outside the paths a handoff may carry, the digest recomputed, and the session export
 * internally consistent.
 */
export function openHandoffBundle(buffer: Buffer): OpenedBundle {
  let entries;
  try {
    entries = readZip(buffer);
  } catch (error) {
    throw new HandoffOpenError("handoff_invalid", error instanceof Error ? error.message : "This is not a handoff file");
  }
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]));
  const manifestData = byName.get("manifest.json");
  if (!manifestData) throw new HandoffOpenError("handoff_invalid", "This is not a handoff file");
  const manifest = readManifest(parseJson(manifestData, "manifest"));

  const listed = new Map(manifest.contents.map((entry) => [entry.path, entry]));
  if (listed.size !== manifest.contents.length) throw new HandoffOpenError("handoff_tampered", "The handoff lists an item twice");
  for (const entry of entries) {
    if (entry.name === "manifest.json") continue;
    const kind = allowedKind(entry.name);
    if (!kind) throw new HandoffOpenError("handoff_invalid", `The handoff carries something it may not: ${entry.name}`);
    if (kind === "produced" && isNeverCarried(entry.name.slice("files/".length))) {
      throw new HandoffOpenError("handoff_invalid", `The handoff carries a file that is never carried: ${entry.name}`);
    }
    const record = listed.get(entry.name);
    if (!record || record.bytes !== entry.data.length || record.sha256 !== sha256(entry.data)) {
      throw new HandoffOpenError("handoff_tampered", `The handoff was changed after it was made: ${entry.name}`);
    }
  }
  for (const path of listed.keys()) {
    if (!byName.has(path)) throw new HandoffOpenError("handoff_tampered", `The handoff is missing ${path}`);
  }
  if (contentsDigest(manifest.contents) !== manifest.digest) {
    throw new HandoffOpenError("handoff_tampered", "The handoff was changed after it was made");
  }

  const engineData = byName.get("session/engine.json");
  if (!engineData) throw new HandoffOpenError("handoff_invalid", "The handoff has no conversation");
  let exported: EngineSessionExport;
  try {
    exported = readEngineSessionExport(parseJson(engineData, "conversation"));
  } catch (error) {
    if (error instanceof HandoffOpenError) throw error;
    throw new HandoffOpenError("handoff_invalid", error instanceof Error ? error.message : "The conversation is damaged");
  }
  if (exported.info.id !== manifest.session.id) throw new HandoffOpenError("handoff_tampered", "The conversation is not the one the handoff names");

  const reviewValue = byName.has("session/review.json") ? parseJson(byName.get("session/review.json")!, "review") : {};
  const reviewRecord = isRecord(reviewValue) ? reviewValue : {};
  const comments = Array.isArray(reviewRecord.comments)
    ? reviewRecord.comments.flatMap((entry) => {
        const comment = readComment(entry);
        return comment ? [comment] : [];
      })
    : [];
  const deskValue = byName.has("session/desk.json") ? parseJson(byName.get("session/desk.json")!, "plan") : [];

  const files: OpenedBundle["files"] = [];
  const skills: OpenedBundle["skills"] = [];
  const commands: OpenedBundle["commands"] = [];
  for (const entry of entries) {
    const kind = allowedKind(entry.name);
    if (kind === "produced") {
      const listedKind = listed.get(entry.name)?.kind === "read" ? "read" : "produced";
      files.push({ relativePath: entry.name.slice("files/".length), kind: listedKind, data: entry.data });
    } else if (kind === "skill") {
      skills.push({ name: entry.name.split("/")[2]!, content: entry.data.toString("utf8") });
    } else if (kind === "command") {
      const value = parseJson(entry.data, "playbook");
      if (isRecord(value) && typeof value.name === "string" && typeof value.template === "string") {
        commands.push({
          name: entry.name.split("/")[2]!.replace(/\.json$/, ""),
          template: value.template,
          ...(typeof value.description === "string" ? { description: value.description } : {}),
        });
      }
    }
  }

  return {
    manifest,
    exported,
    transcript: byName.get("session/transcript.md")?.toString("utf8") ?? "",
    review: { comments, state: readState(reviewRecord.state) },
    desk: Array.isArray(deskValue) ? deskValue : [],
    files,
    skills,
    commands,
  };
}

/** What the person sees before opening: who, what for, and what it carries. */
export function describeBundle(opened: OpenedBundle) {
  return {
    id: opened.manifest.id,
    createdAt: opened.manifest.createdAt,
    from: opened.manifest.from,
    ...(opened.manifest.to ? { to: opened.manifest.to } : {}),
    ask: opened.manifest.ask,
    ...(opened.manifest.note ? { note: opened.manifest.note } : {}),
    workspaceName: opened.manifest.workspace.name,
    session: { id: opened.manifest.session.id, title: opened.manifest.session.title, messages: opened.exported.messages.length },
    engine: opened.manifest.engine,
    files: opened.files.map((file) => ({ path: file.relativePath, kind: file.kind, bytes: file.data.length })),
    skills: opened.skills.map((skill) => skill.name),
    commands: opened.commands.map((command) => command.name),
    comments: opened.review.comments.length,
    state: opened.review.state.status,
  };
}

/** Reads a handoff the desktop shell named by path: only a `.redrobhandoff` file, within the size limit. */
export async function readHandoffFile(path: string): Promise<Buffer> {
  const absolute = resolve(path);
  if (!absolute.toLowerCase().endsWith(HANDOFF_EXTENSION)) throw new HandoffOpenError("handoff_invalid", "Only a .redrobhandoff file can be opened");
  const info = await stat(absolute).catch(() => null);
  if (!info?.isFile()) throw new HandoffOpenError("handoff_invalid", "The handoff file was not found");
  if (info.size > ZIP_LIMITS.archiveBytes) throw new HandoffOpenError("handoff_invalid", "The handoff file is too large");
  return readFile(absolute);
}

/**
 * Writes the carried files into the folder the handoff opens in. A file already there is never
 * replaced: the folder is a new one, and finding something in it means it is not.
 */
export async function writeCarriedFiles(root: string, files: OpenedBundle["files"]): Promise<string[]> {
  const base = resolve(root);
  for (const file of files) {
    const target = resolve(base, ...file.relativePath.split("/"));
    if (!target.startsWith(base + sep)) throw new HandoffOpenError("handoff_invalid", `Unsafe path: ${file.relativePath}`);
    if (await lstat(target).then(() => true, () => false)) {
      throw new HandoffOpenError("handoff_target_not_empty", `The folder already has ${file.relativePath}`);
    }
  }
  const written: string[] = [];
  for (const file of files) {
    const target = resolve(base, ...file.relativePath.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.data, { flag: "wx" });
    written.push(file.relativePath);
  }
  return written;
}

/**
 * The fallback when this engine cannot read the sender's export: a new session whose first
 * message is the transcript, in the shape this engine writes. The person still has the whole
 * conversation to read and can continue from it; what is lost is the tool history.
 */
export function transcriptSeedSession(input: {
  title: string;
  transcript: string;
  fromName: string;
  engineVersion: string;
  directory: string;
  now?: number;
}): EngineSessionExport {
  const now = input.now ?? Date.now();
  const sessionId = engineId("ses", "descending", now);
  const messageId = engineId("msg", "ascending", now);
  const partId = engineId("prt", "ascending", now);
  const text = [
    `This chat was handed off by ${input.fromName || "a teammate"}. Their Redrob Code could not be read here, so the conversation so far is below as text.`,
    "",
    input.transcript.trim(),
  ].join("\n");
  return {
    info: {
      id: sessionId,
      slug: "handoff",
      projectID: "global",
      directory: input.directory,
      title: input.title,
      version: input.engineVersion,
      time: { created: now, updated: now },
    },
    messages: [
      {
        info: { id: messageId, role: "user", sessionID: sessionId, time: { created: now }, agent: "build", model: { providerID: "redrob", modelID: "auto" } },
        parts: [{ id: partId, type: "text", text, messageID: messageId, sessionID: sessionId }],
      },
    ],
  };
}

/** `Handoff: Lease review`, bounded for a project name. */
export function handoffProjectName(title: string): string {
  const base = title.trim() || "Chat";
  return `Handoff: ${Array.from(base).slice(0, 80).join("")}`;
}

export { join };
