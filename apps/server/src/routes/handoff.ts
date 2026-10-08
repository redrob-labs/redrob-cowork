import { readFile } from "node:fs/promises";
import { recordAudit } from "../audit.js";
import { listCommands } from "../commands.js";
import { EngineCliError, exportEngineSession, importEngineSession } from "../engine-cli.js";
import { ApiError } from "../errors.js";
import {
  HANDOFF_ASKS,
  HandoffBuildError,
  applyDecisions,
  buildHandoffDraft,
  handoffFileName,
  writeHandoffBundle,
  type HandoffAsk,
  type HandoffDraft,
} from "../handoff-bundle.js";
import { findHandoff, receivedHandoffForSession, recordHandoff, type ReceivedHandoff } from "../handoff-registry.js";
import {
  HandoffOpenError,
  describeBundle,
  openHandoffBundle,
  readHandoffFile,
  transcriptSeedSession,
  writeCarriedFiles,
} from "../handoff-open.js";
import { upsertCommand } from "../commands.js";
import { upsertSkill } from "../skills.js";
import { isSafeId, mergeReview, readSessionReview, type ReviewAuthor, type ReviewComment } from "../review-store.js";
import {
  SessionExportError,
  engineVersionCompatibility,
  rekeyEngineSessionExportWithMap,
  type EngineSessionExport,
} from "../session-export.js";
import { ZIP_LIMITS } from "../zip.js";
import { listSkills } from "../skills.js";
import type { ServerConfig, TokenScope, WorkspaceInfo } from "../types.js";
import { shortId } from "../utils.js";
import { ZipError } from "../zip.js";

import { addRoute, type RequestContext, type Route } from "./registry.js";

type JsonResponse = (data: unknown, status?: number) => Response;
type ReadJsonBody = (request: Request) => Promise<Record<string, unknown>>;

export interface RegisterHandoffRoutesOptions {
  routes: Route[];
  config: ServerConfig;
  jsonResponse: JsonResponse;
  readJsonBody: ReadJsonBody;
  ensureWritable: (config: ServerConfig) => void;
  requireClientScope: (ctx: RequestContext, required: TokenScope) => void;
  resolveWorkspace: (config: ServerConfig, id: string) => Promise<WorkspaceInfo>;
  resolveOpencodeDirectory: (workspace: WorkspaceInfo) => string | null;
  resolveAuthor: (ctx: RequestContext) => Promise<ReviewAuthor>;
  redrobCodeVersion: string;
  /** Overridable in tests; the engine's export by default. */
  exportSession?: (sessionId: string, cwd: string) => Promise<EngineSessionExport>;
  importSession?: (exported: EngineSessionExport, cwd: string) => Promise<string>;
}

/** The bundle a request carries: the file's bytes, or `{ path }` of a file the desktop shell was asked to open. */
async function readBundleBody(request: Request): Promise<Buffer> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
    if (!body || typeof body.path !== "string") throw new ApiError(400, "invalid_payload", "path is required");
    return readHandoffFile(body.path);
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > ZIP_LIMITS.archiveBytes) throw new ApiError(413, "handoff_too_large", "The handoff file is too large");
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length > ZIP_LIMITS.archiveBytes) throw new ApiError(413, "handoff_too_large", "The handoff file is too large");
  if (data.length === 0) throw new ApiError(400, "invalid_payload", "The handoff file is empty");
  return data;
}

function openFailure(error: unknown): never {
  if (error instanceof HandoffOpenError) {
    const status = error.code === "handoff_target_not_empty" ? 409 : error.code === "handoff_unsupported" ? 422 : 400;
    throw new ApiError(status, error.code, error.message);
  }
  throw error;
}

/** Comments keep pointing at the same messages after the session was rekeyed, or at its one message after a fallback. */
function reanchor(comments: readonly ReviewComment[], messageIds: Map<string, string> | null, fallbackMessageId: string | null): ReviewComment[] {
  return comments.map((comment) => {
    if (fallbackMessageId) return { ...comment, anchor: { kind: "message" as const, messageId: fallbackMessageId } };
    const mapped = messageIds?.get(comment.anchor.messageId);
    return mapped ? { ...comment, anchor: { ...comment.anchor, messageId: mapped } } : comment;
  });
}

const NOTE_MAX = 1000;
const TO_MAX = 120;

function stringList(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string") || value.length > 2000) {
    throw new ApiError(400, "invalid_payload", `${name} must be a list of strings`);
  }
  return value as string[];
}

function optionalText(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || Array.from(value).length > max) {
    throw new ApiError(400, "invalid_payload", `${name} must be a string of ${max} characters or fewer`);
  }
  return value.trim() || undefined;
}

function isAsk(value: unknown): value is HandoffAsk {
  return typeof value === "string" && (HANDOFF_ASKS as readonly string[]).includes(value);
}

function draftSummary(draft: HandoffDraft) {
  return {
    entries: draft.entries.map((entry) => ({ path: entry.path, kind: entry.kind, bytes: entry.data.length, scannable: entry.scannable })),
    readCandidates: draft.readCandidates,
    missing: draft.missing,
    findings: draft.findings,
    unscanned: draft.unscanned,
    fingerprint: draft.fingerprint,
  };
}

function failure(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof EngineCliError) {
    throw new ApiError(502, "engine_export_failed", "Redrob Code could not export this chat", { stderr: error.detail.stderr.slice(-500) });
  }
  if (error instanceof SessionExportError) throw new ApiError(502, "engine_export_invalid", error.message);
  if (error instanceof HandoffBuildError) throw new ApiError(400, "handoff_invalid", error.message);
  if (error instanceof ZipError) throw new ApiError(413, "handoff_too_large", error.message);
  throw error;
}

/**
 * `POST /workspace/:id/sessions/:sessionId/handoff/preview`: what a handoff would carry, and what
 * in it looks secret. `POST .../handoff`: the bundle, built from the same draft with the sender's
 * decisions, as `application/zip`. Nothing is kept on this machine but a registry row and an audit
 * line.
 */
export function registerHandoffRoutes(options: RegisterHandoffRoutesOptions): void {
  const { routes, config, jsonResponse, readJsonBody, ensureWritable, requireClientScope, resolveWorkspace, resolveOpencodeDirectory, resolveAuthor } =
    options;
  const exportSession =
    options.exportSession ?? ((sessionId: string, cwd: string) => exportEngineSession(sessionId, { cwd, timeoutMs: 120_000 }));

  const draftFor = async (ctx: RequestContext, includeRead: readonly string[]) => {
    const workspace = await resolveWorkspace(config, ctx.params.id ?? "");
    if (workspace.workspaceType !== "local") throw new ApiError(400, "invalid_payload", "Only a chat on this computer can be handed off");
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!isSafeId(sessionId)) throw new ApiError(400, "invalid_payload", "sessionId is invalid");
    const cwd = resolveOpencodeDirectory(workspace) ?? workspace.path;
    const exported = await exportSession(sessionId, cwd);
    const skills = await Promise.all(
      (await listSkills(workspace.path, false)).map(async (skill) => ({ name: skill.name, content: await readFile(skill.path, "utf8") })),
    );
    const commands = (await listCommands(workspace.path, "workspace")).map((command) => ({
      name: command.name,
      template: command.template,
      ...(command.description ? { description: command.description } : {}),
    }));
    const draft = await buildHandoffDraft({
      exported,
      review: await readSessionReview(config, workspace.id, sessionId),
      workspaceRoot: workspace.path,
      sessionDirectory: typeof exported.info.directory === "string" ? exported.info.directory : workspace.path,
      skills,
      commands,
      includeRead,
    });
    return { workspace, sessionId, exported, draft };
  };

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/handoff/preview", "client", async (ctx) => {
    requireClientScope(ctx, "collaborator");
    const body = await readJsonBody(ctx.request);
    const includeRead = stringList(body.includeRead, "includeRead");
    const { exported, draft } = await draftFor(ctx, includeRead).catch(failure);
    return jsonResponse({
      session: { id: exported.info.id, title: typeof exported.info.title === "string" ? exported.info.title : "" },
      from: await resolveAuthor(ctx),
      ...draftSummary(draft),
    });
  });

  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/handoff", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const body = await readJsonBody(ctx.request);
    if (!isAsk(body.ask)) throw new ApiError(400, "invalid_payload", `ask must be one of ${HANDOFF_ASKS.join(", ")}`);
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : "";
    if (!fingerprint) throw new ApiError(400, "handoff_preview_required", "Preview the handoff first");
    const note = optionalText(body.note, "note", NOTE_MAX);
    const to = optionalText(body.to, "to", TO_MAX);
    const includeRead = stringList(body.includeRead, "includeRead");
    const keep = new Set(stringList(body.keep, "keep"));
    const exclude = new Set(stringList(body.exclude, "exclude"));

    const { workspace, sessionId, exported, draft } = await draftFor(ctx, includeRead).catch(failure);
    if (draft.fingerprint !== fingerprint) {
      throw new ApiError(409, "handoff_preview_stale", "The chat changed since the preview; preview it again");
    }
    const from = await resolveAuthor(ctx);
    const title = typeof exported.info.title === "string" && exported.info.title.trim() ? exported.info.title.trim() : sessionId;
    const built = (() => {
      try {
        return writeHandoffBundle(applyDecisions(draft, { keep, exclude }), {
          from,
          ...(to ? { to } : {}),
          ask: body.ask,
          ...(note ? { note } : {}),
          workspaceName: workspace.name ?? "",
          sessionTitle: title,
          sessionId,
          redrobCodeVersion: options.redrobCodeVersion,
        });
      } catch (error) {
        return failure(error);
      }
    })();

    await recordHandoff(config, {
      id: built.manifest.id,
      direction: "sent",
      workspaceId: workspace.id,
      sessionId,
      createdAt: Date.now(),
      ...(to ? { to } : {}),
      ask: body.ask,
    });
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "handoff.sent",
      target: sessionId,
      summary: `Handed off ${built.manifest.contents.length} items${to ? ` to ${to}` : ""} (${built.manifest.id})`,
      timestamp: Date.now(),
    });

    const fileName = handoffFileName(title);
    return new Response(new Uint8Array(built.zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Redrob-Handoff-Id": built.manifest.id,
      },
    });
  });

  const importSession =
    options.importSession ?? ((exported: EngineSessionExport, cwd: string) => importEngineSession(exported, { cwd, timeoutMs: 120_000 }));

  // What a handoff file is, before anything is written. Host only: opening one writes files and a
  // chat on this computer, which is the person at this machine's call.
  addRoute(routes, "POST", "/handoff/inspect", "host", async (ctx) => {
    const opened = await readBundleBody(ctx.request).then(openHandoffBundle).catch(openFailure);
    const already = await findHandoff(config, opened.manifest.id, "received");
    return jsonResponse({
      handoff: describeBundle(opened),
      digest: opened.manifest.digest,
      compatibility: engineVersionCompatibility(opened.manifest.engine.redrobCodeVersion, options.redrobCodeVersion),
      alreadyOpened: already ? { workspaceId: already.workspaceId, sessionId: already.sessionId } : null,
    });
  });

  // Opens a handoff into a workspace made for it (POST /workspaces/local with managed: true):
  // the files, the skills and playbooks, the chat, and its comments.
  addRoute(routes, "POST", "/workspace/:id/handoff/open", "host", async (ctx) => {
    ensureWritable(config);
    const workspace = await resolveWorkspace(config, ctx.params.id ?? "");
    if (workspace.workspaceType !== "local") throw new ApiError(400, "invalid_payload", "A handoff opens into a folder on this computer");
    const opened = await readBundleBody(ctx.request).then(openHandoffBundle).catch(openFailure);
    const digest = ctx.url.searchParams.get("digest") ?? "";
    if (digest !== opened.manifest.digest) {
      throw new ApiError(409, "handoff_changed", "The file is not the one that was checked; open it again");
    }
    const cwd = resolveOpencodeDirectory(workspace) ?? workspace.path;

    await writeCarriedFiles(workspace.path, opened.files).catch(openFailure);
    for (const skill of opened.skills) {
      await upsertSkill(workspace.path, { name: skill.name, content: skill.content, description: "" }).catch(() => undefined);
    }
    for (const command of opened.commands) {
      await upsertCommand(workspace.path, command).catch(() => undefined);
    }

    // The same chat id already here (a handoff opened twice, or back on the machine it came from)
    // would merge into the existing chat, so it is opened under new ids instead.
    const existing = await exportSession(opened.exported.info.id, cwd).then(
      () => true,
      () => false,
    );
    const rekeyed = existing ? rekeyEngineSessionExportWithMap(opened.exported) : null;
    let sessionId: string;
    let fallbackMessageId: string | null = null;
    try {
      sessionId = await importSession(rekeyed?.exported ?? opened.exported, cwd);
    } catch (error) {
      if (!(error instanceof EngineCliError) && !(error instanceof SessionExportError)) throw error;
      const seed = transcriptSeedSession({
        title: opened.manifest.session.title || "Handoff",
        transcript: opened.transcript,
        fromName: opened.manifest.from.displayName,
        engineVersion: options.redrobCodeVersion,
        directory: cwd,
      });
      sessionId = await importSession(seed, cwd).catch(failure);
      fallbackMessageId = seed.messages[0]?.info.id ?? null;
    }

    await mergeReview(config, {
      workspaceId: workspace.id,
      sessionId,
      comments: reanchor(opened.review.comments, rekeyed?.messageIds ?? null, fallbackMessageId),
      origin: "handoff",
      state: opened.review.state,
    });
    const record: ReceivedHandoff = {
      id: opened.manifest.id,
      direction: "received",
      workspaceId: workspace.id,
      sessionId,
      originSessionId: opened.manifest.session.id,
      createdAt: Date.now(),
      fromName: opened.manifest.from.displayName,
      fromParticipantId: opened.manifest.from.participantId,
      ask: opened.manifest.ask,
      ...(opened.manifest.note ? { note: opened.manifest.note } : {}),
      ...(fallbackMessageId ? { fallback: true } : {}),
    };
    await recordHandoff(config, record);
    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "host" },
      action: "handoff.opened",
      target: sessionId,
      summary: `Opened a handoff from ${opened.manifest.from.displayName || "a teammate"} (${opened.manifest.id})`,
      timestamp: Date.now(),
    });
    return jsonResponse({ sessionId, workspaceId: workspace.id, fallback: Boolean(fallbackMessageId), handoff: record }, 201);
  });

  // The handoff a chat came from: who sent it, what they asked, and whether the person has continued.
  addRoute(routes, "GET", "/workspace/:id/sessions/:sessionId/handoff", "client", async (ctx) => {
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!isSafeId(sessionId)) throw new ApiError(400, "invalid_payload", "sessionId is invalid");
    return jsonResponse({ handoff: await receivedHandoffForSession(config, ctx.params.id ?? "", sessionId) });
  });

  // Continue: the chat stops being a review and takes messages.
  addRoute(routes, "POST", "/workspace/:id/sessions/:sessionId/handoff/continue", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const sessionId = (ctx.params.sessionId ?? "").trim();
    if (!isSafeId(sessionId)) throw new ApiError(400, "invalid_payload", "sessionId is invalid");
    const record = await receivedHandoffForSession(config, ctx.params.id ?? "", sessionId);
    if (!record) throw new ApiError(404, "handoff_not_found", "This chat did not come from a handoff");
    const next: ReceivedHandoff = { ...record, continuedAt: record.continuedAt ?? Date.now() };
    await recordHandoff(config, next);
    return jsonResponse({ handoff: next });
  });
}
