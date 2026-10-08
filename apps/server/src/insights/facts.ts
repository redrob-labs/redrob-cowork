/*
 * What the insights recorder keeps from engine events: counts, flags and times, never text.
 *
 * The engine plugin (opencode-plugins/redrob-insights-recorder.ts) sees every bus event and calls
 * `factsOf` on it; only the result crosses to redrob-server. A message's words, a file's contents, a
 * command line and a tool's output all stay in the plugin: where one of them decides a flag (a
 * command that runs tests, a file attached to the first message) the flag is computed here and only
 * the boolean leaves.
 *
 * One exception, kept out of facts: the text of a session's first message goes, once, to
 * redrob-server's /insights/work on this machine, where the work classifier names its family and the
 * text is dropped (`textPartOf`). Only the family is stored or sent on.
 */

export type Fact =
  | { kind: "session"; sessionID: string; parentID: string | null; at: number }
  | { kind: "user-turn"; sessionID: string; messageID: string; at: number; attachedSource: boolean }
  | { kind: "assistant-done"; sessionID: string; messageID: string; at: number }
  | { kind: "tool"; sessionID: string; callID: string; at: number; status: "running" | "completed" | "error"; effect: ToolEffect }
  | { kind: "permission"; sessionID: string; at: number; asked: boolean; reply: "once" | "always" | "reject" | null }
  | { kind: "busy"; sessionID: string; at: number; busy: boolean }
  | { kind: "aborted"; sessionID: string; at: number }
  | { kind: "idle"; sessionID: string; at: number };

/** What a tool call did, as far as the labels care. */
export type ToolEffect = "artifact" | "checks" | "delegates" | "sends" | "reads" | "other";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const field = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined);

const ARTIFACT_TOOLS = new Set(["write", "edit", "patch", "multiedit", "apply_patch", "notebookedit"]);
const READ_TOOLS = new Set(["read", "grep", "glob", "list", "ls", "webfetch", "websearch", "codesearch"]);
const DELEGATE_TOOLS = new Set(["task", "agent"]);
/** A command that verifies work: tests, type checks, linters, a build. Matched on the program only. */
const CHECK_COMMAND =
  /(?:^|[\s;&|(])(?:pytest|vitest|jest|mocha|bun\s+test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?(?:test|typecheck|lint)|yarn\s+(?:run\s+)?(?:test|typecheck|lint)|go\s+test|cargo\s+(?:test|check|clippy)|tsc|eslint|ruff|mypy|make\s+(?:test|check))(?:\s|$)/;
/** A connector tool that sends something to someone: an email, a message, a post, a comment. */
const SENDING_TOOL = /(?:^|[_.-])(?:send|post|reply|publish|comment|message|create_issue|create_comment)(?:$|[_.-])/i;

/** The effect of a tool call, from its name and, for a shell, whether the command verifies work. */
export function toolEffect(tool: string, input: unknown): ToolEffect {
  const name = tool.toLowerCase();
  if (ARTIFACT_TOOLS.has(name)) return "artifact";
  if (DELEGATE_TOOLS.has(name)) return "delegates";
  if (READ_TOOLS.has(name)) return "reads";
  if (name === "bash" || name === "shell") {
    const command = str(field(input, "command")) ?? "";
    return CHECK_COMMAND.test(command) ? "checks" : "other";
  }
  if (SENDING_TOOL.test(name)) return "sends";
  return "other";
}

const sessionOf = (properties: unknown): string | null =>
  str(field(properties, "sessionID")) ?? str(field(field(properties, "info"), "sessionID")) ?? str(field(field(properties, "part"), "sessionID"));

/** One engine event reduced to a fact, or null when it carries nothing the labels use. */
export function factsOf(event: unknown, now: number): Fact | null {
  const type = str(field(event, "type"));
  const properties = field(event, "properties");
  if (!type) return null;

  if (type === "session.created") {
    const info = field(properties, "info");
    const sessionID = str(field(info, "id"));
    if (!sessionID) return null;
    return { kind: "session", sessionID, parentID: str(field(info, "parentID")), at: now };
  }

  if (type === "message.updated") {
    const info = field(properties, "info");
    const sessionID = str(field(info, "sessionID"));
    const messageID = str(field(info, "id"));
    const role = str(field(info, "role"));
    if (!sessionID || !messageID) return null;
    const time = field(info, "time");
    if (role === "user") {
      return {
        kind: "user-turn",
        sessionID,
        messageID,
        at: num(field(time, "created")) ?? now,
        attachedSource: false,
      };
    }
    const completed = num(field(time, "completed"));
    if (role === "assistant" && completed !== null) return { kind: "assistant-done", sessionID, messageID, at: completed };
    return null;
  }

  if (type === "message.part.updated") {
    const part = field(properties, "part");
    const sessionID = str(field(part, "sessionID"));
    const partType = str(field(part, "type"));
    if (!sessionID || !partType) return null;
    if (partType === "file") {
      // A file on a person's message: the source was attached rather than retyped. Recorded as a
      // user turn that attached a source; the recorder folds it into the turn it belongs to.
      const messageID = str(field(part, "messageID"));
      if (!messageID) return null;
      return { kind: "user-turn", sessionID, messageID, at: now, attachedSource: true };
    }
    if (partType === "tool") {
      const callID = str(field(part, "callID")) ?? str(field(part, "id"));
      const tool = str(field(part, "tool"));
      const state = field(part, "state");
      const status = str(field(state, "status"));
      if (!callID || !tool || (status !== "running" && status !== "completed" && status !== "error")) return null;
      return { kind: "tool", sessionID, callID, at: now, status, effect: toolEffect(tool, field(state, "input")) };
    }
    return null;
  }

  if (type === "permission.asked" || type === "permission.v2.asked" || type === "permission.updated") {
    const sessionID = sessionOf(properties);
    return sessionID ? { kind: "permission", sessionID, at: now, asked: true, reply: null } : null;
  }

  if (type === "permission.replied" || type === "permission.v2.replied") {
    const sessionID = sessionOf(properties);
    if (!sessionID) return null;
    const raw = str(field(properties, "response")) ?? str(field(properties, "reply"));
    const reply = raw === "always" || raw === "once" || raw === "reject" ? raw : null;
    return { kind: "permission", sessionID, at: now, asked: false, reply };
  }

  if (type === "session.status") {
    const sessionID = sessionOf(properties);
    const status = str(field(field(properties, "status"), "type"));
    if (!sessionID || !status) return null;
    return { kind: "busy", sessionID, at: now, busy: status === "busy" || status === "retry" };
  }

  if (type === "session.error") {
    const sessionID = sessionOf(properties);
    const name = str(field(field(properties, "error"), "name"));
    return sessionID && name === "MessageAbortedError" ? { kind: "aborted", sessionID, at: now } : null;
  }

  if (type === "session.idle") {
    const sessionID = sessionOf(properties);
    return sessionID ? { kind: "idle", sessionID, at: now } : null;
  }

  return null;
}

/** A text part the person wrote (not one the engine added), for the work classifier. */
export function textPartOf(event: unknown): { sessionID: string; messageID: string; text: string } | null {
  if (str(field(event, "type")) !== "message.part.updated") return null;
  const part = field(field(event, "properties"), "part");
  const sessionID = str(field(part, "sessionID"));
  const messageID = str(field(part, "messageID"));
  const text = str(field(part, "text"));
  if (str(field(part, "type")) !== "text" || field(part, "synthetic") === true || !sessionID || !messageID || !text) return null;
  return { sessionID, messageID, text };
}

const EFFECTS: readonly ToolEffect[] = ["artifact", "checks", "delegates", "sends", "reads", "other"];

/**
 * A fact as redrob-server receives it, checked field by field. Anything else in the object is
 * dropped, so the shape is the only thing that can be stored, whatever a caller sends.
 */
export function parseFact(value: unknown): Fact | null {
  const kind = str(field(value, "kind"));
  const sessionID = str(field(value, "sessionID"));
  const at = num(field(value, "at"));
  if (!kind || !sessionID || at === null) return null;
  switch (kind) {
    case "session": {
      const parentID = field(value, "parentID");
      return { kind, sessionID, at, parentID: typeof parentID === "string" && parentID ? parentID : null };
    }
    case "user-turn": {
      const messageID = str(field(value, "messageID"));
      return messageID ? { kind, sessionID, at, messageID, attachedSource: field(value, "attachedSource") === true } : null;
    }
    case "assistant-done": {
      const messageID = str(field(value, "messageID"));
      return messageID ? { kind, sessionID, at, messageID } : null;
    }
    case "tool": {
      const callID = str(field(value, "callID"));
      const status = field(value, "status");
      const effect = EFFECTS.find((e) => e === field(value, "effect"));
      if (!callID || !effect || (status !== "running" && status !== "completed" && status !== "error")) return null;
      return { kind, sessionID, at, callID, status, effect };
    }
    case "permission": {
      const reply = field(value, "reply");
      return {
        kind,
        sessionID,
        at,
        asked: field(value, "asked") === true,
        reply: reply === "once" || reply === "always" || reply === "reject" ? reply : null,
      };
    }
    case "busy":
      return { kind, sessionID, at, busy: field(value, "busy") === true };
    case "aborted":
    case "idle":
      return { kind, sessionID, at };
    default:
      return null;
  }
}
