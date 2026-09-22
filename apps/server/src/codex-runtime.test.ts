/**
 * Tests for the Codex runtime adapter.
 *
 * Two layers, deliberately:
 *   - `collectTurn` against synthetic event sequences. No process, so the
 *     normalization and every failure mode are pinned cheaply.
 *   - `CodexRuntime` against a FAKE `codex` binary that emits real JSONL on
 *     stdout, reached through `codexPathOverride`. This is the same trick
 *     `writeFakeEngineBin` uses in `engine-pool.test.ts:51-100`, and it is what
 *     makes the spawn path testable on a machine with no codex and no ChatGPT
 *     login.
 *
 * What these tests CANNOT prove: that a real `codex` accepts our flags and that a
 * real ChatGPT subscription pays for the turn. That needs a host with the CLI
 * installed and signed in.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCodexEnv,
  collectTurn,
  CodexRuntime,
  isCodexAuthError,
} from "./codex-runtime.js";
import type { ThreadEvent } from "@openai/codex-sdk";

async function* stream(...events: ThreadEvent[]): AsyncGenerator<ThreadEvent> {
  for (const event of events) yield event;
}

const usage = {
  input_tokens: 10,
  cached_input_tokens: 4,
  cache_write_input_tokens: 0,
  output_tokens: 7,
  reasoning_output_tokens: 2,
};

describe("collectTurn", () => {
  test("joins assistant text in emission order and reports usage", async () => {
    const result = await collectTurn(
      stream(
        { type: "thread.started", thread_id: "thr_1" },
        { type: "turn.started" },
        { type: "item.completed", item: { id: "i1", type: "agent_message", text: "Hello " } },
        { type: "item.completed", item: { id: "i2", type: "agent_message", text: "world" } },
        { type: "turn.completed", usage },
      ),
      () => "thr_1",
    );

    expect(result.status).toBe("completed");
    expect(result.text).toBe("Hello world");
    expect(result.error).toBeUndefined();
    expect(result.usage).toEqual({
      inputTokens: 10,
      cachedInputTokens: 4,
      outputTokens: 7,
      reasoningOutputTokens: 2,
    });
    expect(result.threadId).toBe("thr_1");
  });

  test("keeps non-message items out of the text but available to the caller", async () => {
    const result = await collectTurn(
      stream(
        {
          type: "item.completed",
          item: {
            id: "c1",
            type: "command_execution",
            command: "bash -lc ls",
            aggregated_output: "docs\nsdk\n",
            exit_code: 0,
            status: "completed",
          },
        },
        { type: "item.completed", item: { id: "i1", type: "agent_message", text: "Two dirs." } },
        { type: "turn.completed", usage },
      ),
      () => "thr_2",
    );

    expect(result.text).toBe("Two dirs.");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe("command_execution");
  });

  test("a turn.failed event is a failure carrying Codex's own message", async () => {
    const result = await collectTurn(
      stream(
        { type: "turn.started" },
        { type: "turn.failed", error: { message: "Not logged in. Run `codex login`." } },
      ),
      () => "thr_3",
    );

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Not logged in. Run `codex login`.");
    expect(isCodexAuthError(result.error ?? "")).toBe(true);
  });

  test("a top-level error event is a failure distinct from turn.failed", async () => {
    const result = await collectTurn(
      stream({ type: "error", message: "stream closed unexpectedly" }),
      () => null,
    );

    expect(result.status).toBe("failed");
    expect(result.error).toBe("stream closed unexpectedly");
  });

  test("a stream that ends with no terminal event fails instead of reporting empty success", async () => {
    // Regression guard: returning { status: "completed", text: "" } here would
    // render a blank assistant reply and read as "the model had nothing to say".
    const result = await collectTurn(
      stream({ type: "thread.started", thread_id: "thr_4" }, { type: "turn.started" }),
      () => "thr_4",
    );

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/ended before the turn completed/);
    expect(result.text).toBe("");
  });
});

describe("buildCodexEnv", () => {
  test("carries the variables that locate the credential cache", () => {
    const env = buildCodexEnv({ HOME: "/home/someone", CODEX_HOME: "/custom/.codex", PATH: "/usr/bin" });
    expect(env.HOME).toBe("/home/someone");
    expect(env.CODEX_HOME).toBe("/custom/.codex");
    expect(env.PATH).toBe("/usr/bin");
  });

  test("drops unrelated variables rather than handing them to the child", () => {
    const env = buildCodexEnv({ HOME: "/home/someone", REDROB_API_KEY: "secret", AWS_SECRET_ACCESS_KEY: "x" });
    expect(env.REDROB_API_KEY).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  test("omits empty values so the child does not see HOME=''", () => {
    // An empty HOME is worse than an absent one: path joining produces
    // "/.codex/auth.json" at the filesystem root and the login looks missing.
    const env = buildCodexEnv({ HOME: "", PATH: "/usr/bin" });
    expect("HOME" in env).toBe(false);
  });
});

describe("isCodexAuthError", () => {
  test("recognizes the sign-in cases", () => {
    expect(isCodexAuthError("Not logged in")).toBe(true);
    expect(isCodexAuthError("401 Unauthorized")).toBe(true);
    expect(isCodexAuthError("Please run `codex login` first")).toBe(true);
  });

  test("does not claim an unrelated failure is an auth problem", () => {
    // The point of this guard: a generic failure must NOT send the user to
    // `codex login`, which would be a dead end and hide the real error.
    expect(isCodexAuthError("sandbox denied write to /etc/hosts")).toBe(false);
    expect(isCodexAuthError("model gpt-5.6-terra is not available")).toBe(false);
  });
});

describe("CodexRuntime against a fake codex binary", () => {
  let dir: string;
  let fakeCodex: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "codex-runtime-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Writes a stand-in for `codex` that prints the JSONL `codex exec
   * --experimental-json` produces.
   *
   * `recordTo` is interpolated into the script as a literal rather than passed
   * through the environment, because `buildCodexEnv` correctly strips any
   * variable that is not on its allow-list — the first version of this helper
   * used an env var and the recording silently never happened.
   */
  function writeFakeCodex(body: string, recordTo?: string): string {
    const path = join(dir, "codex");
    const preamble = `
// A real codex reads the prompt from stdin when the SDK sends it that way.
// Draining it matters: exiting without reading makes the parent's write race
// against process exit and raises EPIPE in the test process intermittently.
await new Response(Bun.stdin.stream()).text().catch(() => "");
const RECORD_TO = ${recordTo ? JSON.stringify(recordTo) : "null"};
if (RECORD_TO) {
  await Bun.write(RECORD_TO, JSON.stringify({
    argv: process.argv.slice(2),
    home: process.env.HOME ?? null,
    codexHome: process.env.CODEX_HOME ?? null,
    sawRedrobKey: Boolean(process.env.REDROB_API_KEY),
    sawCodexApiKey: Boolean(process.env.CODEX_API_KEY),
  }));
}
`;
    writeFileSync(path, `#!/usr/bin/env bun\n${preamble}\n${body}\n`, "utf8");
    chmodSync(path, 0o755);
    return path;
  }

  const emitOk = `
const lines = [
  { type: "thread.started", thread_id: "thr_fake_1" },
  { type: "turn.started" },
  { type: "item.completed", item: { id: "i1", type: "agent_message", text: "fake answer" } },
  { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0 } },
];
for (const line of lines) console.log(JSON.stringify(line));
`;

  test("spawns the binary, parses its JSONL, and returns the answer", async () => {
    fakeCodex = writeFakeCodex(emitOk);
    const runtime = new CodexRuntime({ codexPath: fakeCodex, workingDirectory: dir });

    const result = await runtime.send("hello");

    expect(result.status).toBe("completed");
    expect(result.text).toBe("fake answer");
    expect(result.usage?.outputTokens).toBe(2);
  });

  test("remembers the thread id so the next message continues the conversation", async () => {
    fakeCodex = writeFakeCodex(emitOk);
    const runtime = new CodexRuntime({ codexPath: fakeCodex, workingDirectory: dir });

    expect(runtime.currentThreadId).toBeNull();
    await runtime.send("first");
    expect(runtime.currentThreadId).toBe("thr_fake_1");
  });

  test("passes a non-interactive approval policy and a read-only sandbox by default", async () => {
    // A GUI turn has no terminal for Codex to prompt on, so an approval request
    // would hang forever. Write access must be opted into, never inherited.
    const argvOut = join(dir, "argv.json");
    fakeCodex = writeFakeCodex(emitOk, argvOut);
    const runtime = new CodexRuntime({ codexPath: fakeCodex, workingDirectory: dir });

    await runtime.send("hello");

    const recorded = await Bun.file(argvOut).json();
    const argv = (recorded.argv as string[]).join(" ");
    expect(argv).toContain('approval_policy="never"');
    expect(argv).toContain("read-only");
    expect(argv).not.toContain("untrusted");
  });

  test("the spawned child can still find the credential cache, and gets no unrelated secrets", async () => {
    // The regression this pins: CodexOptions.env REPLACES process.env, so a
    // forgotten HOME makes a signed-in user look signed out. It also checks we
    // do not leak our own key into a child that must not use it, and that we
    // never set CODEX_API_KEY, which would bill an API account instead of the
    // user's ChatGPT plan.
    const envOut = join(dir, "env.json");
    fakeCodex = writeFakeCodex(emitOk, envOut);
    const runtime = new CodexRuntime({ codexPath: fakeCodex, workingDirectory: dir });
    process.env.REDROB_API_KEY = "must-not-propagate";
    try {
      await runtime.send("hello");
    } finally {
      delete process.env.REDROB_API_KEY;
    }

    const recorded = await Bun.file(envOut).json();
    expect(recorded.home).toBe(process.env.HOME ?? null);
    expect(recorded.sawRedrobKey).toBe(false);
    expect(recorded.sawCodexApiKey).toBe(false);
  });

  test("a signed-out codex surfaces as an auth failure, not a crash", async () => {
    // The message deliberately contains no backtick: it is written through a
    // nested template literal into a generated script, and a quoted `codex
    // login` there is three levels of escaping for no test value.
    fakeCodex = writeFakeCodex(`
console.log(JSON.stringify({ type: "turn.started" }));
console.log(JSON.stringify({ type: "turn.failed", error: { message: "Not logged in. Run codex login to continue." } }));
`);
    const runtime = new CodexRuntime({ codexPath: fakeCodex, workingDirectory: dir });

    const result = await runtime.send("hello");

    expect(result.status).toBe("failed");
    expect(isCodexAuthError(result.error ?? "")).toBe(true);
  });
});
