import { readFile } from "node:fs/promises";
import { recordAudit } from "../audit.js";
import { listCommands } from "../commands.js";
import { EngineCliError, exportEngineSession } from "../engine-cli.js";
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
import { recordHandoff } from "../handoff-registry.js";
import { isSafeId, readSessionReview, type ReviewAuthor } from "../review-store.js";
import { SessionExportError, type EngineSessionExport } from "../session-export.js";
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
}
