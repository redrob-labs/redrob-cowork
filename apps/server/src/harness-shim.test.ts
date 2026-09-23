/**
 * Tests for the harness shim.
 *
 * `planRequest`, `parseHarnessModel` and `flattenMessages` are exercised directly,
 * because every rejection path is a thing a caller feels first and is the part most
 * likely to be wrong. The server is then driven over a real socket with a fake `codex`
 * so the wire shape — JSON body, SSE framing, statuses — is asserted as delivered
 * rather than as intended.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  flattenMessages,
  parseHarnessModel,
  planRequest,
  startHarnessShim,
  toChatCompletion,
  toChunk,
  type HarnessShim,
} from "./harness-shim.js";

const both = { codex: "/bin/codex", claude: "/bin/claude" };

describe("parseHarnessModel", () => {
  test("splits a prefixed model", () => {
    expect(parseHarnessModel("codex/gpt-5.6")).toEqual({ kind: "codex", model: "gpt-5.6" });
    expect(parseHarnessModel("claude-code/opus-5")).toEqual({ kind: "claude-code", model: "opus-5" });
  });

  test("treats auto as no explicit model", () => {
    expect(parseHarnessModel("codex/auto")).toEqual({ kind: "codex" });
  });

  test("refuses a bare name rather than defaulting to a runtime", () => {
    // Guessing would silently bill the wrong subscription, and the user cannot see
    // which harness answered.
    expect(parseHarnessModel("gpt-5.6")).toBeNull();
    expect(parseHarnessModel("/leading")).toBeNull();
    expect(parseHarnessModel("ollama/llama3")).toBeNull();
  });
});

describe("flattenMessages", () => {
  test("puts system first and labels the other roles", () => {
    const prompt = flattenMessages([
      { role: "user", content: "what is 2+2" },
      { role: "system", content: "be terse" },
      { role: "assistant", content: "4" },
    ]);
    expect(prompt.startsWith("be terse")).toBe(true);
    expect(prompt).toContain("Assistant: 4");
  });

  test("reads text blocks out of array content", () => {
    const prompt = flattenMessages([
      { role: "user", content: [{ type: "text", text: "hello " }, { type: "image_url" }, { type: "text", text: "world" }] },
    ]);
    expect(prompt).toBe("hello world");
  });

  test("skips empty content instead of emitting blank separators", () => {
    expect(flattenMessages([{ role: "user", content: "" }, { role: "user", content: "hi" }])).toBe("hi");
  });
});

describe("planRequest", () => {
  test("accepts a well-formed request", () => {
    const plan = planRequest({ model: "codex/gpt-5.6", messages: [{ role: "user", content: "hi" }] }, both);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.kind).toBe("codex");
      expect(plan.binary).toBe("/bin/codex");
      expect(plan.stream).toBe(false);
    }
  });

  test("REJECTS caller-supplied tools rather than ignoring them", () => {
    // The core contract difference: a harness runs its own loop, so it can never emit
    // tool_calls for the caller's tools. Silently dropping the field would leave the
    // caller waiting for a response shape that cannot arrive.
    const plan = planRequest(
      {
        model: "codex/gpt-5.6",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "x" } }],
      },
      both,
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.status).toBe(400);
      expect(JSON.stringify(plan.body)).toContain("tools_unsupported");
    }
  });

  test("an empty tools array is not a rejection", () => {
    expect(planRequest({ model: "codex/x", messages: [{ role: "user", content: "hi" }], tools: [] }, both).ok).toBe(true);
  });

  test("a missing runtime is 503, not 400", () => {
    // The request is fine; the runtime is not installed. A caller tells "fix your
    // request" from "install the runtime" by the status.
    const plan = planRequest({ model: "claude-code/opus", messages: [{ role: "user", content: "hi" }] }, {
      codex: "/bin/codex",
      claude: null,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.status).toBe(503);
      expect(JSON.stringify(plan.body)).toContain("runtime_not_installed");
    }
  });

  test("rejects a missing model and empty messages", () => {
    expect(planRequest({ messages: [{ role: "user", content: "hi" }] }, both).ok).toBe(false);
    expect(planRequest({ model: "codex/x", messages: [] }, both).ok).toBe(false);
  });

  test("an unprefixed model names both accepted forms in the error", () => {
    const plan = planRequest({ model: "gpt-5.6", messages: [{ role: "user", content: "hi" }] }, both);
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      const text = JSON.stringify(plan.body);
      expect(text).toContain("codex/");
      expect(text).toContain("claude-code/");
    }
  });
});

describe("response shapes", () => {
  const result = {
    sessionId: "s1",
    text: "hello",
    status: "completed" as const,
    usage: { inputTokens: 10, outputTokens: 4, costUsd: 0.01 },
    toolUses: [],
  };

  test("non-streaming body matches OpenAI's shape", () => {
    const body = toChatCompletion(result, "codex/gpt-5.6", "id1");
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0]?.message).toEqual({ role: "assistant", content: "hello" });
    // A harness that ran its own tools still finished its turn: from the caller's view
    // this is a stop. Reporting tool_calls would make it wait for calls never sent.
    expect(body.choices[0]?.finish_reason).toBe("stop");
    expect(body.usage).toEqual({ prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 });
  });

  test("chunks carry a delta, and the terminator carries finish_reason", () => {
    expect(toChunk("hi", "codex/x", "id", false).choices[0]).toEqual({
      index: 0,
      delta: { role: "assistant", content: "hi" },
      finish_reason: null,
    });
    expect(toChunk("", "codex/x", "id", true).choices[0]).toEqual({ index: 0, delta: {}, finish_reason: "stop" });
  });
});

describe("startHarnessShim over a real socket", () => {
  let dir: string;
  let shim: HarnessShim | null = null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "harness-shim-test-"));
  });

  afterEach(async () => {
    await shim?.close();
    shim = null;
    rmSync(dir, { recursive: true, force: true });
  });

  function fakeCodex(): string {
    const path = join(dir, "codex");
    writeFileSync(
      path,
      `#!/usr/bin/env bun
await new Response(Bun.stdin.stream()).text().catch(() => "");
const lines = [
  { type: "thread.started", thread_id: "thr_1" },
  { type: "turn.started" },
  { type: "item.completed", item: { id: "i1", type: "agent_message", text: "shim answer" } },
  { type: "turn.completed", usage: { input_tokens: 7, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 3, reasoning_output_tokens: 0 } },
];
for (const line of lines) console.log(JSON.stringify(line));
`,
      "utf8",
    );
    chmodSync(path, 0o755);
    return path;
  }

  /** Emits three separate assistant messages, so chunking is observable. */
  function fakeCodexMultiPart(): string {
    const path = join(dir, "codex-multi");
    writeFileSync(
      path,
      `#!/usr/bin/env bun
await new Response(Bun.stdin.stream()).text().catch(() => "");
const lines = [
  { type: "thread.started", thread_id: "thr_1" },
  { type: "turn.started" },
  { type: "item.completed", item: { id: "i1", type: "agent_message", text: "one " } },
  { type: "item.completed", item: { id: "i2", type: "agent_message", text: "two " } },
  { type: "item.completed", item: { id: "i3", type: "agent_message", text: "three" } },
  { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 3, reasoning_output_tokens: 0 } },
];
for (const line of lines) console.log(JSON.stringify(line));
`,
      "utf8",
    );
    chmodSync(path, 0o755);
    return path;
  }

  /** Fails after the stream has opened. */
  function fakeCodexFailing(): string {
    const path = join(dir, "codex-fail");
    writeFileSync(
      path,
      `#!/usr/bin/env bun
await new Response(Bun.stdin.stream()).text().catch(() => "");
console.log(JSON.stringify({ type: "turn.started" }));
console.log(JSON.stringify({ type: "turn.failed", error: { message: "upstream exploded" } }));
`,
      "utf8",
    );
    chmodSync(path, 0o755);
    return path;
  }

  async function start(): Promise<HarnessShim> {
    shim = await startHarnessShim({
      workingDirectory: dir,
      codexPath: fakeCodex(),
      claudePath: null,
    });
    return shim;
  }

  test("binds loopback only", async () => {
    // This endpoint can spend the user's subscription; a routable bind would let
    // anything on the network do so.
    const s = await start();
    expect(s.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
  });

  test("answers a non-streaming request in OpenAI's shape", async () => {
    const s = await start();
    const response = await fetch(`${s.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "codex/gpt-5.6", messages: [{ role: "user", content: "hi" }] }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.choices[0].message.content).toBe("shim answer");
    expect(body.usage.prompt_tokens).toBe(7);
  });

  test("streams SSE terminated by [DONE]", async () => {
    const s = await start();
    const response = await fetch(`${s.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "codex/gpt-5.6", messages: [{ role: "user", content: "hi" }], stream: true }),
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("shim answer");
    // Without the terminator an OpenAI client hangs waiting for more.
    expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  test("forwards each piece of text as its own chunk, not one at the end", async () => {
    // The regression this guards: an earlier version awaited the whole turn and then sent a
    // single chunk. That is correct SSE framing with none of the latency benefit, and reads
    // to the user as the model thinking for ten seconds then answering instantly.
    shim = await startHarnessShim({
      workingDirectory: dir,
      codexPath: fakeCodexMultiPart(),
      claudePath: null,
    });
    const response = await fetch(`${shim.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "codex/gpt-5.6", messages: [{ role: "user", content: "hi" }], stream: true }),
    });

    const text = await response.text();
    const contentChunks = text
      .split("\n")
      .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
      .map((line) => JSON.parse(line.slice(6)) as { choices: Array<{ delta: { content?: string } }> })
      .filter((frame) => typeof frame.choices[0]?.delta.content === "string");

    expect(contentChunks).toHaveLength(3);
    expect(contentChunks.map((frame) => frame.choices[0]!.delta.content).join("")).toBe("one two three");
  });

  test("reports a mid-stream failure as an error frame, not a silent end", async () => {
    // Headers are already out by then, so the only way to report is in the stream. Ending
    // silently would look like a short but successful answer.
    shim = await startHarnessShim({
      workingDirectory: dir,
      codexPath: fakeCodexFailing(),
      claudePath: null,
    });
    const response = await fetch(`${shim.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "codex/gpt-5.6", messages: [{ role: "user", content: "hi" }], stream: true }),
    });

    const text = await response.text();
    expect(text).toContain('"type":"api_error"');
    expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  test("a missing runtime is 503 over the wire", async () => {
    const s = await start();
    const response = await fetch(`${s.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-code/opus", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(response.status).toBe(503);
  });

  test("a non-JSON body is 400, not a crash", async () => {
    const s = await start();
    const response = await fetch(`${s.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(response.status).toBe(400);
  });

  test("any other path is 404", async () => {
    const s = await start();
    expect((await fetch(`${s.baseUrl}/models`)).status).toBe(404);
  });
});
