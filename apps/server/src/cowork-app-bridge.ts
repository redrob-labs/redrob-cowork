/**
 * Control from Redrob Code: hand the shared daemon's agent this server's tasks as MCP tools.
 *
 * The tools act on the real state through the HTTP routes the renderer already calls
 * (`/workspace/:id/sessions`, `/workspace/:id/session-groups`, the engine proxy, `/approvals`),
 * invoked over loopback on this very server with its own tokens. That keeps one code path per
 * action: whatever the UI does on "new task", "send", or "allow" is what the agent does.
 *
 * The bridge is optional. When no daemon is reachable the server runs exactly as before; the
 * failure is logged once and swallowed. The bridge never starts a daemon of its own: it reuses the
 * engine this server is attached to, or the record of a daemon already running for the user.
 */
import { z } from "zod";
import { startAppBridge, type AppBridgeHandle, type ToolDef } from "./app-bridge.js";
import { currentDaemon, daemonHeaders } from "./engine-daemon.js";
import { sharedEngineForConfig } from "./engine-connection.js";
import { loopbackFetch } from "./server-fetch.js";
import type { ServerConfig } from "./types.js";
import pkg from "../package.json" with { type: "json" };

export const COWORK_APP_BRIDGE_NAME = "cowork";

/** The most characters `get_task` answers for the message tail. */
const MESSAGE_TAIL_LIMIT = 4000;
/** How many sessions `list_tasks` reads per workspace. */
const LIST_LIMIT = 50;
/** How many messages `get_task` reads before trimming to the character cap. */
const MESSAGE_READ_LIMIT = 6;

export type CoworkAppBridgeLogger = {
  log: (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;
};

export type CoworkAppBridgeOptions = {
  config: ServerConfig;
  /** This server's own base URL, the port that actually bound. */
  serverUrl: string;
  logger: CoworkAppBridgeLogger;
};

export type CoworkAppBridge = {
  /** The loopback MCP URL the daemon was given. */
  url: string;
  /** Unregister from the daemon and stop serving. Safe to call twice. */
  stop: () => Promise<void>;
};

type ServerCall = (method: string, path: string, body?: unknown) => Promise<unknown>;

type SessionLine = {
  id: string;
  title: string;
  workspaceId: string;
  updated: number | undefined;
};

type SessionGroupState = {
  groups: Array<{ id: string; label: string }>;
  assignments: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatTime(value: number | undefined): string {
  return value === undefined ? "-" : new Date(value).toISOString();
}

function serverErrorMessage(status: number, payload: unknown): string {
  if (isRecord(payload)) {
    const message = asString(payload.message);
    const code = asString(payload.code);
    if (message && code) return `${message} (${code})`;
    if (message) return message;
    if (code) return code;
  }
  return `Redrob Cowork server answered ${status}`;
}

/** Calls this server's own API the way the renderer does, with the server's own credentials. */
function createServerCall(config: ServerConfig, serverUrl: string): ServerCall {
  const base = serverUrl.replace(/\/+$/, "");
  return async (method, path, body) => {
    const response = await loopbackFetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        "x-redrob-host-token": config.hostToken,
        "x-redrob-client-id": "app-bridge",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let payload: unknown = undefined;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) throw new Error(serverErrorMessage(response.status, payload));
    return payload;
  };
}

function engineProxyPath(workspaceId: string, enginePath: string): string {
  return `/workspace/${encodeURIComponent(workspaceId)}/opencode${enginePath}`;
}

function readSessionLines(payload: unknown, workspaceId: string): SessionLine[] {
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  const lines: SessionLine[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    if (!id) continue;
    const time = isRecord(item.time) ? item.time : {};
    lines.push({
      id,
      title: asString(item.title)?.trim() || "(untitled)",
      workspaceId,
      updated: asNumber(time.updated) ?? asNumber(time.created),
    });
  }
  return lines;
}

function readGroupState(payload: unknown): SessionGroupState {
  const state = isRecord(payload) && isRecord(payload.state) ? payload.state : {};
  const groups: SessionGroupState["groups"] = [];
  if (Array.isArray(state.groups)) {
    for (const group of state.groups) {
      if (!isRecord(group)) continue;
      const id = asString(group.id);
      const label = asString(group.label);
      if (id && label) groups.push({ id, label });
    }
  }
  const assignments: Record<string, string> = {};
  if (isRecord(state.assignments)) {
    for (const [sessionId, groupId] of Object.entries(state.assignments)) {
      if (typeof groupId === "string") assignments[sessionId] = groupId;
    }
  }
  return { groups, assignments };
}

/** `/session/status` answers `{ [sessionId]: { type: "idle" | "busy" | "retry", ... } }`. */
function readStatuses(payload: unknown): Record<string, string> {
  const statuses: Record<string, string> = {};
  if (!isRecord(payload)) return statuses;
  for (const [sessionId, status] of Object.entries(payload)) {
    if (isRecord(status) && typeof status.type === "string") statuses[sessionId] = status.type;
  }
  return statuses;
}

/** Flattens one engine message (`{ info, parts }`) to `role: text`, text parts only. */
function messageText(message: unknown): string | null {
  if (!isRecord(message) || !isRecord(message.info) || !Array.isArray(message.parts)) return null;
  const role = asString(message.info.role) ?? "unknown";
  const texts: string[] = [];
  for (const part of message.parts) {
    if (!isRecord(part)) continue;
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) texts.push(part.text.trim());
    else if (part.type === "tool" && typeof part.tool === "string") texts.push(`[tool ${part.tool}]`);
  }
  if (texts.length === 0) return null;
  return `${role}: ${texts.join("\n")}`;
}

function tailWithin(lines: string[], limit: number): string {
  const kept: string[] = [];
  let size = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? "";
    const cost = line.length + 1;
    if (kept.length > 0 && size + cost > limit) break;
    kept.unshift(cost > limit ? `...${line.slice(line.length - (limit - 3))}` : line);
    size += cost;
  }
  return kept.join("\n");
}

function buildTools(config: ServerConfig, call: ServerCall): ToolDef[] {
  const workspaces = () => config.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name || workspace.id }));

  const requireWorkspace = (requested: string | undefined) => {
    const all = workspaces();
    if (all.length === 0) throw new Error("No workspace is configured on this Redrob Cowork server");
    if (!requested) return all[0]!;
    const wanted = requested.trim().toLowerCase();
    const found = all.find((workspace) => workspace.id.toLowerCase() === wanted || workspace.name.toLowerCase() === wanted);
    if (!found) throw new Error(`Unknown workspace "${requested}"; known: ${all.map((workspace) => workspace.id).join(", ")}`);
    return found;
  };

  const listAllSessions = async (): Promise<SessionLine[]> => {
    const lines: SessionLine[] = [];
    for (const workspace of workspaces()) {
      const payload = await call("GET", `/workspace/${encodeURIComponent(workspace.id)}/sessions?roots=true&limit=${LIST_LIMIT}`);
      lines.push(...readSessionLines(payload, workspace.id));
    }
    return lines;
  };

  /** Finds which workspace a session belongs to: every workspace route checks the session's directory. */
  const locateSession = async (sessionId: string): Promise<SessionLine> => {
    let lastError: unknown = undefined;
    for (const workspace of workspaces()) {
      try {
        const payload = await call(
          "GET",
          `/workspace/${encodeURIComponent(workspace.id)}/sessions/${encodeURIComponent(sessionId)}`,
        );
        const [line] = readSessionLines({ items: [isRecord(payload) ? payload.item : undefined] }, workspace.id);
        if (line) return line;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`Task ${sessionId} not found${lastError instanceof Error ? `: ${lastError.message}` : ""}`);
  };

  const readGroups = async (workspaceId: string): Promise<SessionGroupState> =>
    readGroupState(await call("GET", `/workspace/${encodeURIComponent(workspaceId)}/session-groups`));

  const readStatusMap = async (workspaceId: string): Promise<Record<string, string>> => {
    try {
      return readStatuses(await call("GET", engineProxyPath(workspaceId, "/session/status")));
    } catch {
      return {};
    }
  };

  const groupLabel = (state: SessionGroupState, sessionId: string): string => {
    const groupId = state.assignments[sessionId];
    if (!groupId) return "-";
    return state.groups.find((group) => group.id === groupId)?.label ?? groupId;
  };

  return [
    {
      name: "list_tasks",
      description:
        "List the tasks (chat sessions) of this Redrob Cowork, one line each: id, title, status (idle/busy/retry), desk, workspace, last update.",
      input: z.object({
        workspace: z.string().optional().describe("Workspace id or name; omitted lists every workspace"),
      }),
      handler: async (args) => {
        const requested = asString(args.workspace);
        const scope = requested ? [requireWorkspace(requested)] : workspaces();
        const lines: string[] = [];
        for (const workspace of scope) {
          const [sessions, groups, statuses] = await Promise.all([
            call("GET", `/workspace/${encodeURIComponent(workspace.id)}/sessions?roots=true&limit=${LIST_LIMIT}`).then((payload) =>
              readSessionLines(payload, workspace.id),
            ),
            readGroups(workspace.id),
            readStatusMap(workspace.id),
          ]);
          for (const session of sessions) {
            lines.push(
              `${session.id}\t${session.title}\t${statuses[session.id] ?? "idle"}\t${groupLabel(groups, session.id)}\t${workspace.id}\t${formatTime(session.updated)}`,
            );
          }
        }
        return lines.length > 0 ? lines.join("\n") : "No tasks.";
      },
    },
    {
      name: "get_task",
      description: "Answer one task's title, status, desk and the last few messages (at most 4000 characters) by task id.",
      input: z.object({ id: z.string().min(1).describe("Task (session) id") }),
      handler: async (args) => {
        const id = String(args.id);
        const located = await locateSession(id);
        const [snapshot, groups] = await Promise.all([
          call(
            "GET",
            `/workspace/${encodeURIComponent(located.workspaceId)}/sessions/${encodeURIComponent(id)}/snapshot?limit=${MESSAGE_READ_LIMIT}`,
          ),
          readGroups(located.workspaceId),
        ]);
        const item = isRecord(snapshot) && isRecord(snapshot.item) ? snapshot.item : {};
        const status = isRecord(item.status) ? asString(item.status.type) ?? "idle" : "idle";
        const messages = Array.isArray(item.messages) ? item.messages : [];
        const texts = messages.map(messageText).filter((text): text is string => text !== null);
        const header = [
          `id: ${located.id}`,
          `title: ${located.title}`,
          `status: ${status}`,
          `desk: ${groupLabel(groups, located.id)}`,
          `workspace: ${located.workspaceId}`,
          `updated: ${formatTime(located.updated)}`,
        ].join("\n");
        const tail = texts.length > 0 ? tailWithin(texts, MESSAGE_TAIL_LIMIT) : "(no messages)";
        return `${header}\n\n${tail}`;
      },
    },
    {
      name: "create_task",
      description:
        "Create a task the way the UI's new-task button does: a session with the title, the prompt sent as its first message; answers the new task id.",
      input: z.object({
        title: z.string().min(1).max(120).describe("Task title"),
        prompt: z.string().min(1).max(100_000).describe("First message for the agent"),
        desk: z.string().optional().describe("Desk (session group) id or label to file the task under"),
        workspace: z.string().optional().describe("Workspace id or name; omitted uses the first workspace"),
      }),
      handler: async (args) => {
        const workspace = requireWorkspace(asString(args.workspace));
        let groupId: string | undefined = undefined;
        const desk = asString(args.desk)?.trim();
        if (desk) {
          const groups = await readGroups(workspace.id);
          const wanted = desk.toLowerCase();
          const group = groups.groups.find((entry) => entry.id.toLowerCase() === wanted || entry.label.toLowerCase() === wanted);
          if (!group) throw new Error(`Unknown desk "${desk}"; known: ${groups.groups.map((entry) => entry.label).join(", ") || "none"}`);
          groupId = group.id;
        }
        const created = await call("POST", `/workspace/${encodeURIComponent(workspace.id)}/sessions`, {
          title: String(args.title),
          prompt: String(args.prompt),
        });
        const id = isRecord(created) && isRecord(created.item) ? asString(created.item.id) : undefined;
        if (!id) throw new Error("The server created the task but answered no id");
        if (groupId) {
          await call(
            "PATCH",
            `/workspace/${encodeURIComponent(workspace.id)}/session-groups/assignments/${encodeURIComponent(id)}`,
            { groupId },
          );
        }
        return id;
      },
    },
    {
      name: "send_message",
      description: "Send a follow-up text message into an existing task, the way the UI's composer does; answers \"sent\".",
      input: z.object({
        id: z.string().min(1).describe("Task (session) id"),
        text: z.string().min(1).max(100_000).describe("Message text"),
      }),
      handler: async (args) => {
        const id = String(args.id);
        const located = await locateSession(id);
        await call("POST", engineProxyPath(located.workspaceId, `/session/${encodeURIComponent(id)}/prompt_async`), {
          parts: [{ type: "text", text: String(args.text) }],
        });
        return "sent";
      },
    },
    {
      name: "list_desks",
      description: "List the desks (session groups) per workspace with the number of tasks filed under each, plus how many tasks have no desk.",
      input: z.object({
        workspace: z.string().optional().describe("Workspace id or name; omitted lists every workspace"),
      }),
      handler: async (args) => {
        const requested = asString(args.workspace);
        const scope = requested ? [requireWorkspace(requested)] : workspaces();
        const lines: string[] = [];
        for (const workspace of scope) {
          const [groups, sessions] = await Promise.all([
            readGroups(workspace.id),
            call("GET", `/workspace/${encodeURIComponent(workspace.id)}/sessions?roots=true&limit=${LIST_LIMIT}`).then((payload) =>
              readSessionLines(payload, workspace.id),
            ),
          ]);
          // Counted over the sessions that exist: an assignment can outlive its session.
          const counts = new Map<string, number>();
          let unfiled = 0;
          for (const session of sessions) {
            const groupId = groups.assignments[session.id];
            if (groupId) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
            else unfiled += 1;
          }
          lines.push(`workspace ${workspace.id} (${workspace.name})`);
          for (const group of groups.groups) {
            lines.push(`  ${group.id}\t${group.label}\t${counts.get(group.id) ?? 0} tasks`);
          }
          lines.push(`  (no desk)\t${unfiled} tasks`);
        }
        return lines.join("\n");
      },
    },
    {
      name: "set_status",
      description:
        "Move a task's status the way a person can in the UI: \"idle\" stops a running task (the stop button), \"active\" restores an archived task (the restore button). busy/retry are set by the agent working and cannot be set by hand.",
      input: z.object({
        id: z.string().min(1).describe("Task (session) id"),
        status: z.string().min(1).describe("idle (stop the task) or active (restore it from the archive)"),
      }),
      handler: async (args) => {
        const id = String(args.id);
        const status = String(args.status).trim().toLowerCase();
        if (status !== "idle" && status !== "active") {
          throw new Error(
            `Status "${status}" has no user action. Use "idle" to stop a running task or "active" to restore an archived one; busy and retry come from the agent working.`,
          );
        }
        const located = await locateSession(id);
        if (status === "idle") {
          await call(
            "POST",
            `/workspace/${encodeURIComponent(located.workspaceId)}/sessions/${encodeURIComponent(id)}/abort`,
          );
          return `${id}: stopped`;
        }
        // The sidebar's restore button: clear the engine's `time.archived` stamp.
        await call("PATCH", engineProxyPath(located.workspaceId, `/session/${encodeURIComponent(id)}`), {
          time: { archived: 0 },
        });
        return `${id}: restored`;
      },
    },
    {
      name: "open_desk",
      description:
        "Bring the Redrob Cowork window to the front on a desk (session group), opening its most recent task. Needs the app to be open on this server.",
      input: z.object({
        desk: z.string().min(1).describe("Desk (session group) id or label"),
        workspace: z.string().optional().describe("Workspace id or name; omitted uses the first workspace"),
      }),
      handler: async (args) => {
        const workspace = requireWorkspace(asString(args.workspace));
        const desk = String(args.desk).trim();
        const groups = await readGroups(workspace.id);
        const wanted = desk.toLowerCase();
        const group = groups.groups.find((entry) => entry.id.toLowerCase() === wanted || entry.label.toLowerCase() === wanted);
        if (!group) throw new Error(`Unknown desk "${desk}"; known: ${groups.groups.map((entry) => entry.label).join(", ") || "none"}`);
        await call(
          "POST",
          `/workspace/${encodeURIComponent(workspace.id)}/session-groups/${encodeURIComponent(group.id)}/open`,
        );
        return `asked the app to open desk ${group.label}`;
      },
    },
    {
      name: "list_approvals",
      description: "List the approval requests waiting for a human on this server, one line each: approval id, workspace, action, summary.",
      handler: async () => {
        const payload = await call("GET", "/approvals");
        const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
        const lines = items.filter(isRecord).map((item) =>
          `${asString(item.id) ?? "?"}\t${asString(item.workspaceId) ?? "-"}\t${asString(item.action) ?? "-"}\t${asString(item.summary) ?? ""}`,
        );
        return lines.length > 0 ? lines.join("\n") : "No pending approvals.";
      },
    },
    {
      name: "approve",
      description: "Answer a pending approval request by id with allow or deny, through the same route the UI's approval dialog uses.",
      input: z.object({
        approval_id: z.string().min(1).describe("Approval request id from list_approvals"),
        decision: z.enum(["allow", "deny"]).describe("allow or deny"),
      }),
      handler: async (args) => {
        const approvalId = String(args.approval_id);
        const decision = args.decision === "allow" ? "allow" : "deny";
        const payload = await call("POST", `/approvals/${encodeURIComponent(approvalId)}`, { reply: decision });
        const allowed = isRecord(payload) && payload.allowed === true;
        return `${approvalId}: ${allowed ? "allowed" : "denied"}`;
      },
    },
  ];
}

/** Port the daemon record carries; the engine handle only knows the URL. */
function portOf(url: string): number {
  try {
    const parsed = new URL(url);
    return Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80);
  } catch {
    return 0;
  }
}

/**
 * The daemon connection to register with. The engine this server attached to first; failing
 * that, a daemon already running for the user. Never starts one: the server's own engine policy
 * decides that, and a bridge-started daemon would be a second owner.
 */
async function resolveDaemonConnection(config: ServerConfig) {
  const engine = sharedEngineForConfig(config);
  if (engine && engine.isAlive()) {
    return {
      url: engine.url,
      headers: daemonHeaders(engine.password),
      record: {
        id: engine.identity,
        version: engine.execution.daemon.version,
        url: engine.url,
        port: portOf(engine.url),
        pid: engine.pid ?? 0,
        secret: engine.password,
      },
      started: false,
    };
  }
  return currentDaemon();
}

/**
 * Serve the tools on loopback and register them with the shared daemon. Resolves to null, after
 * one log line, when no daemon is reachable or refuses the registration: the server runs on.
 */
export async function startCoworkAppBridge(options: CoworkAppBridgeOptions): Promise<CoworkAppBridge | null> {
  const { config, logger } = options;
  if (config.readOnly) {
    logger.log("info", "App bridge not started: the server is read-only.");
    return null;
  }
  let handle: AppBridgeHandle;
  try {
    const connect = await resolveDaemonConnection(config);
    if (!connect) {
      logger.log("info", "App bridge not started: no Redrob Code daemon is running.");
      return null;
    }
    handle = await startAppBridge({
      name: COWORK_APP_BRIDGE_NAME,
      version: pkg.version,
      connect,
      tools: buildTools(config, createServerCall(config, options.serverUrl)),
    });
  } catch (error) {
    logger.log("warn", "App bridge not started: the Redrob Code daemon could not be reached.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  logger.log("info", `App bridge registered with Redrob Code as ${COWORK_APP_BRIDGE_NAME}`, {
    "bridge.url": handle.url,
    "bridge.id": handle.id,
  });
  return {
    url: handle.url,
    stop: () => handle.stop().catch(() => undefined),
  };
}
