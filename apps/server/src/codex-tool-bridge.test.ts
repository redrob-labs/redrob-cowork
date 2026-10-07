/**
 * Tests for the MCP stdio tool bridge.
 *
 * Two layers. `handleMessage` is exercised directly for the protocol, and the whole
 * bridge is driven as a real SUBPROCESS over stdin/stdout for the framing — because
 * framing is the part that breaks in ways that look like model misbehaviour rather
 * than like a transport bug, so asserting it through the real pipes is the point.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  codexConfigEntry,
  handleMessage,
  PROTOCOL_VERSION,
  type ToolBridgeOptions,
} from "./codex-tool-bridge.js";

const options: ToolBridgeOptions = {
  serverName: "redrob-tools-test",
  serverVersion: "1.2.3",
  tools: [
    {
      name: "echo",
      description: "Echo the given text",
      inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      run: (args) => `echoed: ${String(args.text)}`,
    },
    {
      name: "explode",
      description: "Always fails",
      inputSchema: { type: "object", properties: {} },
      run: () => {
        throw new Error("tool blew up");
      },
    },
  ],
};

function req(method: string, params?: unknown, id: string | number = 1) {
  return { jsonrpc: "2.0" as const, id, method, params };
}

describe("handleMessage", () => {
  test("initialize advertises only the tools capability", async () => {
    const res = (await handleMessage(req("initialize"), options)) as { result: Record<string, any> };
    expect(res.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(res.result.capabilities).toEqual({ tools: {} });
    expect(res.result.serverInfo).toEqual({ name: "redrob-tools-test", version: "1.2.3" });
    // Claiming a capability we do not implement makes the client call a method that
    // then fails, which reads as our bug rather than an unsupported feature.
    expect(Object.keys(res.result.capabilities)).toEqual(["tools"]);
  });

  test("a notification is NOT answered", async () => {
    // Replying to a notification is a protocol violation, and MCP's own handshake
    // sends notifications/initialized as one.
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, options)).toBeNull();
    expect(await handleMessage({ jsonrpc: "2.0", method: "tools/list" }, options)).toBeNull();
  });

  test("tools/list returns every tool with its schema", async () => {
    const res = (await handleMessage(req("tools/list"), options)) as { result: { tools: any[] } };
    expect(res.result.tools.map((t) => t.name)).toEqual(["echo", "explode"]);
    expect(res.result.tools[0]?.inputSchema.required).toEqual(["text"]);
  });

  test("tools/call runs the tool and returns text content", async () => {
    const res = (await handleMessage(
      req("tools/call", { name: "echo", arguments: { text: "hi" } }),
      options,
    )) as { result: { content: any[]; isError: boolean } };
    expect(res.result.isError).toBe(false);
    expect(res.result.content).toEqual([{ type: "text", text: "echoed: hi" }]);
  });

  test("a throwing tool reports isError in a SUCCESSFUL result, not a JSON-RPC error", async () => {
    // This distinction is the whole design: a tool failure is an outcome the model
    // must read and can recover from. A transport error aborts the call and tells the
    // model nothing, so the turn ends with the model unaware of why.
    const res = (await handleMessage(req("tools/call", { name: "explode", arguments: {} }), options)) as {
      result: { content: any[]; isError: boolean };
      error?: unknown;
    };
    expect(res.error).toBeUndefined();
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0]?.text).toBe("tool blew up");
  });

  test("an unknown tool is invalid params, not a crash", async () => {
    const res = (await handleMessage(req("tools/call", { name: "nope" }), options)) as {
      error: { code: number; message: string };
    };
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain("nope");
  });

  test("tools/call without a name is rejected before any tool runs", async () => {
    const res = (await handleMessage(req("tools/call", { arguments: {} }), options)) as {
      error: { code: number };
    };
    expect(res.error.code).toBe(-32602);
  });

  test("an unsupported method is method-not-found", async () => {
    const res = (await handleMessage(req("resources/list"), options)) as { error: { code: number } };
    expect(res.error.code).toBe(-32601);
  });

  test("ping is answered", async () => {
    const res = (await handleMessage(req("ping"), options)) as { result: unknown };
    expect(res.result).toEqual({});
  });
});

describe("runToolBridge over real pipes", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tool-bridge-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** A runnable bridge whose single tool is trivially verifiable. */
  function writeBridge(): string {
    const path = join(dir, "bridge.ts");
    writeFileSync(
      path,
      `import { runToolBridge } from ${JSON.stringify(join(import.meta.dir, "codex-tool-bridge.ts"))};
await runToolBridge({
  serverName: "bridge-under-test",
  tools: [{
    name: "add",
    description: "Add two numbers",
    inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } },
    run: (args) => String(Number(args.a) + Number(args.b)),
  }],
});
`,
      "utf8",
    );
    chmodSync(path, 0o755);
    return path;
  }

  async function exchange(input: string[]): Promise<Record<string, any>[]> {
    const proc = Bun.spawn(["bun", writeBridge()], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    proc.stdin.write(input.map((line) => `${line}\n`).join(""));
    await proc.stdin.end();
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  test("completes a handshake and a tool call over stdio", async () => {
    const frames = await exchange([
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "add", arguments: { a: 2, b: 3 } } }),
    ]);

    // Exactly three frames: the notification must produce none. A fourth frame here
    // would mean we answered a notification, which desynchronises the peer.
    expect(frames).toHaveLength(3);
    expect(frames[0]?.id).toBe(1);
    expect(frames[0]?.result.serverInfo.name).toBe("bridge-under-test");
    expect(frames[1]?.result.tools[0]?.name).toBe("add");
    expect(frames[2]?.result.content[0]?.text).toBe("5");
  });

  test("an unparseable frame is skipped without killing the server", async () => {
    // Dropping one malformed line is survivable; exiting mid-conversation is not.
    const frames = await exchange([
      "this is not json",
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" }),
    ]);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.id).toBe(7);
  });

  test("writes nothing but protocol frames to stdout", async () => {
    // A stray console.log is indistinguishable from a message and desynchronises the
    // peer, so every stdout line must parse as JSON.
    const frames = await exchange([JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })]);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.jsonrpc).toBe("2.0");
  });
});

describe("codexConfigEntry", () => {
  test("marks the server required so a failed start is loud", () => {
    // Without required, a bridge that fails to start leaves codex exec running
    // WITHOUT our tools, and the model answers as if the document does not exist --
    // a silent wrong answer instead of a loud failure.
    const entry = codexConfigEntry({ serverName: "redrob", command: "bun", args: ["bridge.ts"] });
    const server = (entry.mcp_servers as Record<string, any>).redrob;
    expect(server.required).toBe(true);
    expect(server.enabled).toBe(true);
  });

  test("raises the startup timeout above Codex's 10s default", () => {
    const server = (codexConfigEntry({ serverName: "r", command: "bun", args: [] }).mcp_servers as any).r;
    expect(server.startup_timeout_sec).toBe(20);
    expect(server.tool_timeout_sec).toBe(60);
  });

  test("omits cwd when not given rather than emitting undefined", () => {
    const server = (codexConfigEntry({ serverName: "r", command: "bun", args: [] }).mcp_servers as any).r;
    expect("cwd" in server).toBe(false);
  });
});
