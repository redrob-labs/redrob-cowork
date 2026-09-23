/**
 * Harness shim — a local OpenAI-compatible endpoint in front of the user's own
 * Codex and Claude Code.
 *
 * This is what makes the harness backends reachable by EVERY Redrob product instead
 * of only by whichever app the adapters happen to live in. The engine already admits
 * a provider at a local address using the trusted `@ai-sdk/openai-compatible` package
 * (`packages/core/src/config/plugin/local-provider.ts` — the door opened for Ollama,
 * LM Studio and vLLM, whose only shared trait is speaking OpenAI-compatible
 * chat-completions over loopback). A harness that speaks the same wire meets the same
 * bar, so nothing has to move into the engine and no new provider machinery is needed.
 *
 *   codex exec / claude -p   ← subprocess, holds its OWN credential
 *          ▲
 *     this shim              ← loopback, OpenAI-compatible
 *          ▲
 *     redrob-code engine     ← registers it via the existing local-provider path
 *          ▲
 *     every product
 *
 * Scope: the CHAT TIER only. Prompt in, text out. These runtimes are agent harnesses
 * rather than completion endpoints, and the agent tier — where the runtime owns a real
 * loop against a workspace — cannot be expressed through chat-completions at all,
 * because that contract's rule is "tools present → the caller owns them" while here
 * the runtime owns the loop. Caller-supplied `tools` are therefore REJECTED rather
 * than silently ignored: quietly dropping them would make the caller wait for
 * `tool_calls` that can never arrive.
 *
 * Binds loopback only. This endpoint can spend the user's subscription, so exposing it
 * on a routable address would let anything on the network do so.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { CodexRuntime, discoverCodexBinary } from "./codex-runtime.js";
import { ClaudeRuntime, discoverClaudeBinary, type HarnessTurnResult } from "./claude-runtime.js";

/** Which runtime a model id selects. */
export type HarnessKind = "codex" | "claude-code";

export type ShimOptions = {
  /** Directory the harnesses run in. */
  workingDirectory: string;
  /** Override discovery; mainly for tests. */
  codexPath?: string | null;
  claudePath?: string | null;
  /** Port to bind. 0 asks the OS, which is the normal choice. */
  port?: number;
};

/**
 * Split an OpenAI `model` string into a runtime and the model to ask it for.
 *
 * `codex/gpt-5.6` → codex, gpt-5.6. `claude-code/opus-5` → claude-code, opus-5. A bare
 * name with no prefix is rejected rather than defaulted: guessing which harness the
 * caller meant would silently bill the wrong subscription, and the user cannot see
 * which one answered.
 */
export function parseHarnessModel(model: string): { kind: HarnessKind; model?: string } | null {
  const slash = model.indexOf("/");
  if (slash <= 0) return null;
  const prefix = model.slice(0, slash);
  const rest = model.slice(slash + 1);
  if (prefix !== "codex" && prefix !== "claude-code") return null;
  return { kind: prefix, ...(rest && rest !== "auto" ? { model: rest } : {}) };
}

/**
 * Flatten OpenAI messages into one prompt.
 *
 * A harness takes a single prompt, not a message array, so the shape is lost either
 * way; making the flattening explicit and labelled is better than dropping roles and
 * letting the model guess who said what. `system` is kept first because both runtimes
 * treat leading instructions as instructions.
 */
export function flattenMessages(
  messages: Array<{ role: string; content: unknown }>,
): string {
  const parts: string[] = [];
  for (const message of messages) {
    const text =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .map((block) =>
                typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text"
                  ? String((block as { text?: unknown }).text ?? "")
                  : "",
              )
              .join("")
          : "";
    if (!text) continue;
    if (message.role === "system") parts.unshift(text);
    else if (message.role === "assistant") parts.push(`Assistant: ${text}`);
    else if (message.role === "tool") parts.push(`Tool result: ${text}`);
    else parts.push(text);
  }
  return parts.join("\n\n");
}

/** OpenAI's non-streaming response body. */
export function toChatCompletion(result: HarnessTurnResult, model: string, id: string) {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: result.text },
        // A harness that ran its own tools has still finished its turn, so from the
        // caller's point of view this is a stop, not a tool call. Reporting
        // "tool_calls" here would make a caller wait for calls it will never receive.
        finish_reason: "stop",
      },
    ],
    usage: result.usage
      ? {
          prompt_tokens: "inputTokens" in result.usage ? result.usage.inputTokens : 0,
          completion_tokens: "outputTokens" in result.usage ? result.usage.outputTokens : 0,
          total_tokens:
            ("inputTokens" in result.usage ? result.usage.inputTokens : 0) +
            ("outputTokens" in result.usage ? result.usage.outputTokens : 0),
        }
      : undefined,
  };
}

/** One SSE chunk in OpenAI's streaming shape. */
export function toChunk(delta: string, model: string, id: string, finish: boolean) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: finish ? {} : { role: "assistant", content: delta },
        finish_reason: finish ? "stop" : null,
      },
    ],
  };
}

function errorBody(status: number, message: string, type: string, code: string | null) {
  return { status, body: { error: { message, type, code, param: null } } };
}

/**
 * Normalize a Codex result into the shared shape.
 *
 * The two runtimes report cost differently — Claude gives dollars, Codex gives tokens —
 * so this maps Codex's token counts into the union rather than pretending one field
 * means the other.
 */
function fromCodex(result: Awaited<ReturnType<CodexRuntime["send"]>>): HarnessTurnResult {
  return {
    sessionId: result.threadId,
    text: result.text,
    status: result.status,
    error: result.error,
    usage: result.usage
      ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: 0 }
      : null,
    toolUses: result.items
      .filter((item) => item.type === "command_execution" || item.type === "mcp_tool_call")
      .map((item) => ({ name: item.type, id: item.id })),
  };
}

export type ShimRequest = {
  model?: unknown;
  messages?: unknown;
  stream?: unknown;
  tools?: unknown;
};

/**
 * Decide what to do with one request, without touching a socket.
 *
 * Exported so every rejection path is testable without a server or a subprocess — the
 * rejections are the part most likely to be wrong, and the part a caller feels first.
 */
export function planRequest(
  payload: ShimRequest,
  available: { codex: string | null; claude: string | null },
):
  | { ok: true; kind: HarnessKind; binary: string; model: string; prompt: string; stream: boolean }
  | { ok: false; status: number; body: unknown } {
  if (typeof payload.model !== "string" || !payload.model) {
    return { ok: false, ...errorBody(400, "`model` is required", "invalid_request_error", null) };
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return { ok: false, ...errorBody(400, "`messages` must be a non-empty array", "invalid_request_error", null) };
  }
  if (Array.isArray(payload.tools) && payload.tools.length > 0) {
    // Rejected, not ignored. A harness runs its own loop with its own tools, so it can
    // never emit tool_calls for the caller's; accepting the field would leave the
    // caller waiting for a response shape that cannot arrive.
    return {
      ok: false,
      ...errorBody(
        400,
        "caller-supplied tools are not supported by a local harness backend: the runtime owns its own tool loop. Omit `tools`, or use a Console model.",
        "invalid_request_error",
        "tools_unsupported",
      ),
    };
  }

  const parsed = parseHarnessModel(payload.model);
  if (!parsed) {
    return {
      ok: false,
      ...errorBody(
        400,
        `model must be prefixed with a harness, e.g. codex/<model> or claude-code/<model>; got ${payload.model}`,
        "invalid_request_error",
        "unknown_model",
      ),
    };
  }

  const binary = parsed.kind === "codex" ? available.codex : available.claude;
  if (!binary) {
    // 503 rather than 400: the request is fine, the runtime is simply not installed,
    // and a caller distinguishes "fix your request" from "install the runtime" by status.
    return {
      ok: false,
      ...errorBody(
        503,
        `${parsed.kind} is not installed on this machine`,
        "api_error",
        "runtime_not_installed",
      ),
    };
  }

  return {
    ok: true,
    kind: parsed.kind,
    binary,
    model: payload.model,
    prompt: flattenMessages(payload.messages as Array<{ role: string; content: unknown }>),
    stream: payload.stream === true,
    ...(parsed.model ? {} : {}),
  };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export type HarnessShim = {
  /** Base URL to register with the engine, e.g. http://127.0.0.1:41234/v1 */
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
};

export async function startHarnessShim(options: ShimOptions): Promise<HarnessShim> {
  const available = {
    codex: options.codexPath === undefined ? discoverCodexBinary() : options.codexPath,
    claude: options.claudePath === undefined ? discoverClaudeBinary() : options.claudePath,
  };

  const handler = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "POST" || !request.url?.startsWith("/v1/chat/completions")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify(errorBody(404, "not found", "invalid_request_error", null).body));
      return;
    }

    let payload: ShimRequest;
    try {
      payload = (await readBody(request)) as ShimRequest;
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify(errorBody(400, "body must be JSON", "invalid_request_error", null).body));
      return;
    }

    const plan = planRequest(payload, available);
    if (!plan.ok) {
      response.writeHead(plan.status, { "content-type": "application/json" });
      response.end(JSON.stringify(plan.body));
      return;
    }

    const id = `chatcmpl-${Date.now().toString(36)}`;
    let result: HarnessTurnResult;
    try {
      if (plan.kind === "codex") {
        const runtime = new CodexRuntime({ codexPath: plan.binary, workingDirectory: options.workingDirectory });
        result = fromCodex(await runtime.send(plan.prompt));
      } else {
        const runtime = new ClaudeRuntime({ claudePath: plan.binary, workingDirectory: options.workingDirectory });
        result = await runtime.send(plan.prompt);
      }
    } catch (error) {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          errorBody(502, error instanceof Error ? error.message : String(error), "api_error", null).body,
        ),
      );
      return;
    }

    if (result.status === "failed") {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(
        JSON.stringify(errorBody(502, result.error ?? "harness turn failed", "api_error", null).body),
      );
      return;
    }

    if (!plan.stream) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(toChatCompletion(result, plan.model, id)));
      return;
    }

    // Streaming is emitted as one content chunk plus a terminator. The harnesses do
    // stream incrementally, but this shim awaits the whole turn before replying, so
    // pretending to stream token-by-token would be a lie about latency. The SSE FRAMING
    // is what callers need in order to work at all; incremental delivery is a later
    // change inside the adapters, not here.
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(`data: ${JSON.stringify(toChunk(result.text, plan.model, id, false))}\n\n`);
    response.write(`data: ${JSON.stringify(toChunk("", plan.model, id, true))}\n\n`);
    response.write("data: [DONE]\n\n");
    response.end();
  };

  const server: Server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify(errorBody(500, "internal error", "api_error", null).body));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Loopback only: this endpoint can spend the user's subscription.
    server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
