import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { buildRedrobRuntimeConfigObjectFromSnapshot } from "./redrob-runtime-config.js";

const repoRoot = resolve(import.meta.dir, "../../..");
const sidecarDir = join(repoRoot, "apps/desktop/resources/sidecars");
const connectUrl = "https://connect.example.test/salesforce/start";
const toolName = "request_salesforce_authorization";

/**
 * A path existing is not the same as an engine being available.
 *
 * The sidecar directory is gitignored and gets whatever a previous fetch or packaging step left
 * behind, which is sometimes the npm launcher shim rather than a compiled engine — and that shim is
 * CommonJS under a `"type": "module"` root, so it exits immediately with `require is not defined`.
 * `existsSync` alone accepted it, this suite decided an engine was available, and then spent the
 * whole 30s `waitFor` budget waiting for a process that had already died. Ask the candidate for its
 * version instead: a real engine answers, anything else is treated as no engine and the suite skips
 * the way it already does on a machine that has none.
 */
function runnableEngine(candidate: string): boolean {
  if (!existsSync(candidate)) return false;
  const probe = spawnSync(candidate, ["--version"], { timeout: 20_000, stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

function findEngine(): string | null {
  const explicit = process.env.REDROB_CODE_BIN;
  if (explicit) return runnableEngine(explicit) ? explicit : null;
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const name = process.platform === "darwin"
    ? `redrob-${arch}-apple-darwin`
    : process.platform === "linux"
      ? `redrob-${arch}-unknown-linux-gnu`
      : "";
  if (!name) return null;
  const candidate = join(sidecarDir, name);
  return runnableEngine(candidate) ? candidate : null;
}

async function freePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = server.port;
  server.stop(true);
  if (port === undefined) throw new Error("failed to allocate a free port");
  return port;
}

async function waitFor<T>(read: () => Promise<T | null>, label: string | (() => string), timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value !== null) return value;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(100);
  }
  const resolvedLabel = typeof label === "function" ? label() : label;
  throw new Error(`timed out waiting for ${resolvedLabel}${lastError ? `: ${String(lastError)}` : ""}`);
}

function streamResponse(lines: object[]): Response {
  const body = [
    ...lines.map((line) => `data: ${JSON.stringify(line)}\n\n`),
    "data: [DONE]\n\n",
  ].join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function chunk(delta: object, finishReason: string | null = null) {
  return {
    id: "chatcmpl-authorization-link",
    object: "chat.completion.chunk",
    created: 1,
    model: "test-model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

const enginePath = findEngine();
const describeMaybe = enginePath ? describe : describe.skip;

describeMaybe("authorization-required MCP tool error pass-through", () => {
  let engine: ChildProcess;
  let mcp: ChildProcess;
  let llm: ReturnType<typeof Bun.serve>;
  let workspace = "";
  let dataDir = "";
  let enginePort = 0;
  let mcpPort = 0;
  let modelSawAuthorizationError = false;
  let modelRequests: Array<{ hasToolError: boolean; toolNames: Array<string | undefined> }> = [];
  let engineLogs = "";

  const engineUrl = () => `http://127.0.0.1:${enginePort}`;
  /**
   * Every attempt is bounded: the engine binds a few seconds after spawn, and a
   * connect attempt against the not-yet-listening port can hang instead of
   * failing fast, which would silently consume the whole hook budget.
   */
  const engineFetch = (path: string, init?: RequestInit) => {
    const url = new URL(`${engineUrl()}${path}`);
    url.searchParams.set("directory", workspace);
    return fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) });
  };

  beforeAll(async () => {
    enginePort = await freePort();
    mcpPort = await freePort();
    workspace = mkdtempSync(join(tmpdir(), "mcp-authorization-link-ws-"));
    dataDir = mkdtempSync(join(tmpdir(), "mcp-authorization-link-data-"));

    llm = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = await request.json() as {
          messages?: Array<{ role?: string; content?: unknown }>;
          tools?: Array<{ function?: { name?: string } }>;
        };
        const serialized = JSON.stringify(body);
        const hasToolError = body.messages?.some((message) => message.role === "tool") ?? false;
        modelRequests.push({
          hasToolError,
          toolNames: body.tools?.map((tool) => tool.function?.name) ?? [],
        });

        if (hasToolError) {
          modelSawAuthorizationError = serialized.includes("Authorization required")
            && serialized.includes(connectUrl);
          return streamResponse([
            chunk({ role: "assistant" }),
            chunk({ content: `Salesforce needs authorization. [Connect Salesforce](${connectUrl}), then tell me to retry.` }),
            chunk({}, "stop"),
          ]);
        }

        const requestedTool = body.tools?.find((tool) => tool.function?.name?.endsWith(toolName));
        if (requestedTool?.function?.name) {
          return streamResponse([
            chunk({ role: "assistant" }),
            chunk({
              tool_calls: [{
                index: 0,
                id: "call_authorization_link",
                type: "function",
                function: { name: requestedTool.function.name, arguments: "{}" },
              }],
            }),
            chunk({}, "tool_calls"),
          ]);
        }

        return streamResponse([
          chunk({ role: "assistant" }),
          chunk({ content: "Authorization link test" }),
          chunk({}, "stop"),
        ]);
      },
    });

    const runtime = buildRedrobRuntimeConfigObjectFromSnapshot({});
    const configPath = join(workspace, "opencode.json");
    writeFileSync(configPath, JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      formatter: false,
      lsp: false,
      default_agent: "redrob",
      agent: runtime.agent,
      model: "test/test-model",
      provider: {
        test: {
          name: "Test",
          id: "test",
          env: [],
          npm: "@ai-sdk/openai-compatible",
          models: {
            "test-model": {
              id: "test-model",
              name: "Test Model",
              attachment: false,
              reasoning: false,
              temperature: false,
              tool_call: true,
              release_date: "2025-01-01",
              limit: { context: 100_000, output: 10_000 },
              cost: { input: 0, output: 0 },
            },
          },
          options: { apiKey: "test-key", baseURL: `http://127.0.0.1:${llm.port}/v1` },
        },
      },
      mcp: {
        "mock-authorization": {
          type: "remote",
          url: `http://127.0.0.1:${mcpPort}/mcp`,
          enabled: true,
          oauth: false,
        },
      },
    }));

    mcp = spawn("node", [join(repoRoot, "scripts/mock-oauth-mcp-server.mjs")], {
      env: {
        ...process.env,
        PORT: String(mcpPort),
        MOCK_ALLOW_UNAUTHENTICATED_MCP: "1",
        MOCK_ERROR_TOOL_NAME: toolName,
        MOCK_ERROR_TOOL_MODE: "authorization_required",
        MOCK_ERROR_TOOL_CONNECT_URL: connectUrl,
        MOCK_ERROR_TOOL_PROVIDER: "salesforce",
      },
      stdio: "ignore",
    });
    await waitFor(
      async () =>
        (await fetch(`http://127.0.0.1:${mcpPort}/health`, { signal: AbortSignal.timeout(5_000) })).ok ? true : null,
      "MCP mock",
    );

    engine = spawn(enginePath!, ["serve", "--pure", "--hostname", "127.0.0.1", "--port", String(enginePort)], {
      env: {
        ...process.env,
        REDROB_CONFIG: configPath,
        REDROB_DISABLE_AUTOUPDATE: "1",
        XDG_DATA_HOME: join(dataDir, "data"),
        XDG_CONFIG_HOME: join(dataDir, "config"),
        XDG_STATE_HOME: join(dataDir, "state"),
        XDG_CACHE_HOME: join(dataDir, "cache"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    engine.stdout?.on("data", (chunk) => {
      engineLogs = `${engineLogs}${String(chunk)}`.slice(-8_000);
    });
    engine.stderr?.on("data", (chunk) => {
      engineLogs = `${engineLogs}${String(chunk)}`.slice(-8_000);
    });
    await waitFor(async () => (await engineFetch("/mcp")).ok ? true : null, "Redrob Code engine");
    await waitFor(async () => {
      const statuses = await (await engineFetch("/mcp")).json() as Record<string, { status?: string }>;
      return statuses["mock-authorization"]?.status === "connected" ? true : null;
    }, "MCP connection");
  }, 60_000);

  afterAll(() => {
    engine?.kill();
    mcp?.kill();
    llm?.stop(true);
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  test("the agent receives the exact error and responds with its connect link", async () => {
    const createdResponse = await engineFetch("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(createdResponse.ok).toBe(true);
    const created = await createdResponse.json() as { id: string };

    const promptResponse = await engineFetch(`/session/${created.id}/prompt_async`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent: "redrob",
        model: { providerID: "test", modelID: "test-model" },
        parts: [{ type: "text", text: "Use Salesforce to find the account." }],
      }),
    });
    expect(promptResponse.status).toBe(204);

    let lastMessages: Array<{
      info?: { role?: string };
      parts?: Array<{ type?: string; text?: string; state?: { status?: string; error?: string } }>;
    }> = [];
    const messages = await waitFor(async () => {
      const response = await engineFetch(`/session/${created.id}/message`);
      if (!response.ok) return null;
      const value = await response.json() as typeof lastMessages;
      lastMessages = value;
      const linkedReply = value
        .filter((message) => message.info?.role === "assistant")
        .flatMap((message) => message.parts ?? [])
        .find((part) => part.type === "text" && part.text?.includes(`[Connect Salesforce](${connectUrl})`));
      return linkedReply ? value : null;
    }, () => `agent authorization-link response; model=${JSON.stringify(modelRequests)} messages=${JSON.stringify(lastMessages)} engine=${engineLogs}`);

    const failedTool = messages.flatMap((message) => message.parts ?? [])
      .find((part) => part.type === "tool" && part.state?.status === "error");
    expect(failedTool?.state?.error).toContain("Authorization required");
    expect(failedTool?.state?.error).toContain(connectUrl);
    expect(modelSawAuthorizationError).toBe(true);
  }, 60_000);
});
