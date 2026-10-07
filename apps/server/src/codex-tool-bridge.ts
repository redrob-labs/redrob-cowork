/**
 * Codex tool bridge — PROTOTYPE.
 *
 * A stdio MCP server that exposes OUR tools to the user's Codex, so a harness
 * backend can do more than answer text. Speaks MCP over newline-delimited JSON-RPC
 * on stdin/stdout, which is what `codex exec` and `claude -p` both consume.
 *
 * Why MCP and not Codex app-server's `dynamicTools`, which would let the tool stay
 * inside our own process: app-server is labelled experimental and "not supported for
 * production workloads", has no row in OpenAI's Feature Maturity table, and
 * `dynamicTools` is gated behind `capabilities.experimentalApi` AND absent from the
 * generated `ThreadStartParams` bindings, so the field is hand-written against no
 * type. It has already changed wire shape once. MCP costs one subprocess and is a
 * documented, supported surface. See redrob-code `docs/LOCAL-HARNESS-BACKENDS.md`.
 *
 * The cost this accepts, stated plainly: an MCP tool runs in THIS process, not in
 * the Electron main process, so a tool that needs live renderer state (the open
 * document's shape tree) cannot be implemented here as-is — it has to reach back
 * over an IPC hop. That is the one thing `dynamicTools` would have given us for free,
 * and the reason to revisit it when Office needs it.
 *
 * Deliberately hand-rolled rather than pulling @modelcontextprotocol/sdk: the server
 * side of MCP needed here is three methods, and the transport is the part worth
 * owning and testing, since a framing bug here corrupts a subprocess conversation in
 * ways that look like model misbehaviour.
 */
import { createInterface } from "node:readline";

/** JSON-RPC 2.0, as MCP uses it. `id` absent means a notification — no reply. */
type Request = { jsonrpc: "2.0"; id?: string | number; method: string; params?: unknown };
type Response = { jsonrpc: "2.0"; id: string | number; result: unknown } | {
  jsonrpc: "2.0";
  id: string | number;
  error: { code: number; message: string };
};

/** The MCP protocol revision this server implements. */
export const PROTOCOL_VERSION = "2025-06-18";

/** JSON-RPC reserved codes. -32602 is what a bad tool argument must map to. */
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export type ToolDefinition = {
  name: string;
  description: string;
  /** Raw JSON Schema for the arguments object. */
  inputSchema: Record<string, unknown>;
  /**
   * Returns the tool's textual result. Throwing is fine and expected: the error is
   * reported to the MODEL as tool output (`isError: true`) rather than as a
   * transport failure, because a tool that fails is information the model should
   * see and react to, not a reason to tear down the turn.
   */
  run: (args: Record<string, unknown>) => Promise<string> | string;
};

export type ToolBridgeOptions = {
  /** Shown to the model in `initialize`; keep it recognisable in Codex's UI. */
  serverName?: string;
  serverVersion?: string;
  tools: ToolDefinition[];
};

/**
 * Handle one decoded JSON-RPC message.
 *
 * Exported and pure-ish so the protocol can be tested without spawning a process or
 * touching stdio. Returns null for a notification, which MUST NOT be answered — a
 * reply to a notification is a protocol violation, and MCP's own handshake sends
 * `notifications/initialized` as one.
 */
export async function handleMessage(
  message: Request,
  options: ToolBridgeOptions,
): Promise<Response | null> {
  const id = message.id;
  const isNotification = id === undefined;

  const reply = (result: unknown): Response | null =>
    isNotification ? null : { jsonrpc: "2.0", id: id!, result };
  const fail = (code: number, msg: string): Response | null =>
    isNotification ? null : { jsonrpc: "2.0", id: id!, error: { code, message: msg } };

  switch (message.method) {
    case "initialize":
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        // Only `tools` is advertised. Claiming a capability we do not implement makes
        // the client call a method that then fails, which reads to the user as our
        // bug rather than as an unsupported feature.
        capabilities: { tools: {} },
        serverInfo: {
          name: options.serverName ?? "redrob-tools",
          version: options.serverVersion ?? "0.0.0-prototype",
        },
      });

    case "notifications/initialized":
      return null;

    case "tools/list":
      return reply({
        tools: options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });

    case "tools/call": {
      const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== "string") return fail(INVALID_PARAMS, "tools/call requires a string `name`");
      const tool = options.tools.find((candidate) => candidate.name === params.name);
      if (!tool) return fail(INVALID_PARAMS, `unknown tool: ${params.name}`);

      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const text = await tool.run(args);
        return reply({ content: [{ type: "text", text }], isError: false });
      } catch (error) {
        // isError inside a successful result, NOT a JSON-RPC error. A tool failure is
        // an outcome the model must read and can recover from; a transport error
        // aborts the call and tells the model nothing useful.
        const text = error instanceof Error ? error.message : String(error);
        return reply({ content: [{ type: "text", text }], isError: true });
      }
    }

    case "ping":
      return reply({});

    default:
      return fail(METHOD_NOT_FOUND, `unsupported method: ${message.method}`);
  }
}

/**
 * Run the bridge on stdin/stdout until stdin closes.
 *
 * Nothing may be written to stdout except protocol frames — a stray `console.log`
 * here is indistinguishable from a message and desynchronises the peer. Diagnostics
 * go to stderr, which the host is free to log.
 */
export function runToolBridge(options: ToolBridgeOptions): Promise<void> {
  return new Promise((resolve) => {
    const lines = createInterface({ input: process.stdin });

    lines.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let message: Request;
      try {
        message = JSON.parse(trimmed) as Request;
      } catch {
        // No id is recoverable from an unparseable frame, so there is nobody to
        // answer. Report and continue rather than exiting: dropping one malformed
        // line is survivable, killing the server mid-conversation is not.
        process.stderr.write(`redrob-tools: ignoring unparseable frame\n`);
        return;
      }

      void handleMessage(message, options)
        .then((response) => {
          if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
        })
        .catch((error) => {
          process.stderr.write(`redrob-tools: handler threw: ${String(error)}\n`);
          if (message.id !== undefined) {
            const response: Response = {
              jsonrpc: "2.0",
              id: message.id,
              error: { code: INTERNAL_ERROR, message: "internal error" },
            };
            process.stdout.write(`${JSON.stringify(response)}\n`);
          }
        });
    });

    lines.on("close", () => resolve());
  });
}

/**
 * The Codex `config.toml` entry that registers this bridge.
 *
 * Returned as an object rather than a TOML string so the caller can hand it to
 * `CodexOptions.config`, which the SDK flattens into `--config key=value` for us —
 * that avoids writing into the user's own `~/.codex/config.toml`, which we do not
 * own and should not edit.
 *
 * `required: true` is deliberate. Without it, a bridge that fails to start leaves
 * `codex exec` running happily WITHOUT our tools, and the model then answers as if
 * the document it was asked to edit does not exist — a silent wrong answer instead of
 * a loud failure. Note the defaults it overrides: Codex's `startup_timeout_sec` is 10
 * and `tool_timeout_sec` is 60.
 */
export function codexConfigEntry(input: {
  serverName: string;
  command: string;
  args: string[];
  cwd?: string;
  startupTimeoutSec?: number;
  toolTimeoutSec?: number;
}): Record<string, unknown> {
  return {
    mcp_servers: {
      [input.serverName]: {
        command: input.command,
        args: input.args,
        ...(input.cwd ? { cwd: input.cwd } : {}),
        startup_timeout_sec: input.startupTimeoutSec ?? 20,
        tool_timeout_sec: input.toolTimeoutSec ?? 60,
        required: true,
        enabled: true,
      },
    },
  };
}
