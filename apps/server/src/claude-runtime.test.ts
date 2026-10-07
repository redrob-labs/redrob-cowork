/**
 * Tests for the Claude Code runtime adapter.
 *
 * Same two layers as the Codex adapter: `collectClaudeTurn` against synthetic
 * stream-json with no process, and `ClaudeRuntime` against a fake `claude` that emits
 * real stream-json on stdout.
 *
 * What these cannot prove: that a real `claude` accepts these flags, and that a real
 * Claude plan pays for the turn. Neither is checkable without the binary and a login.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  billingOverrideVars,
  buildClaudeArgs,
  buildClaudeEnv,
  ClaudeRuntime,
  collectClaudeTurn,
  discoverClaudeBinary,
  isClaudeAuthError,
} from "./claude-runtime.js";

const init = { type: "system", subtype: "init", session_id: "sess_1", apiKeySource: "none" };
const okResult = {
  type: "result",
  subtype: "success",
  session_id: "sess_1",
  is_error: false,
  result: "final text",
  total_cost_usd: 0.02,
  modelUsage: { "claude-sonnet-5": { inputTokens: 100, outputTokens: 20, costUSD: 0.015 } },
};

function lines(...messages: unknown[]): string[] {
  return messages.map((m) => JSON.stringify(m));
}

describe("collectClaudeTurn", () => {
  test("takes assistant text and the session id", () => {
    const out = collectClaudeTurn(
      lines(
        init,
        { type: "assistant", session_id: "sess_1", message: { content: [{ type: "text", text: "Hello " }] } },
        { type: "assistant", session_id: "sess_1", message: { content: [{ type: "text", text: "world" }] } },
        okResult,
      ),
    );
    expect(out.status).toBe("completed");
    expect(out.text).toBe("Hello world");
    expect(out.sessionId).toBe("sess_1");
    expect(out.error).toBeUndefined();
  });

  test("sums cost from modelUsage, not total_cost_usd", () => {
    // usage/total_cost_usd undercount or over-accumulate: usage covers the main loop
    // only, and total_cost_usd is cumulative across a resumed conversation.
    const out = collectClaudeTurn(
      lines(init, {
        ...okResult,
        modelUsage: {
          "claude-sonnet-5": { inputTokens: 100, outputTokens: 20, costUSD: 0.015 },
          "claude-haiku-5": { inputTokens: 50, outputTokens: 10, costUSD: 0.001 },
        },
      }),
    );
    expect(out.usage).toEqual({ inputTokens: 150, outputTokens: 30, costUsd: 0.016 });
  });

  test("falls back to total_cost_usd only when modelUsage is absent", () => {
    const out = collectClaudeTurn(lines(init, { ...okResult, modelUsage: undefined }));
    expect(out.usage).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0.02 });
  });

  test("collects tool_use blocks without putting them in the text", () => {
    const out = collectClaudeTurn(
      lines(
        init,
        {
          type: "assistant",
          session_id: "sess_1",
          message: {
            content: [
              { type: "tool_use", id: "tu_1", name: "Read", input: { path: "a.txt" } },
              { type: "text", text: "read it" },
            ],
          },
        },
        okResult,
      ),
    );
    expect(out.text).toBe("read it");
    expect(out.toolUses).toEqual([{ name: "Read", id: "tu_1" }]);
  });

  test("an error subtype is a failure carrying the errors array", () => {
    const out = collectClaudeTurn(
      lines(init, {
        type: "result",
        subtype: "error_max_turns",
        session_id: "sess_1",
        is_error: true,
        errors: ["turn limit reached"],
      }),
    );
    expect(out.status).toBe("failed");
    expect(out.error).toBe("turn limit reached");
  });

  test("is_error on the success arm is still a failure", () => {
    // Checking subtype alone would report this as a completed turn.
    const out = collectClaudeTurn(lines(init, { ...okResult, is_error: true }));
    expect(out.status).toBe("failed");
  });

  test("a stream with no result message fails instead of reporting empty success", () => {
    const out = collectClaudeTurn(lines(init, { type: "assistant", message: { content: [] } }));
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/ended before a result/);
  });

  test("an unparseable line is skipped, not fatal", () => {
    // The CLI can print diagnostics; dropping the turn over one would turn a cosmetic
    // warning into a failure.
    const out = collectClaudeTurn(["not json at all", ...lines(init, okResult)]);
    expect(out.status).toBe("completed");
    expect(out.text).toBe("final text");
  });

  test("uses result.result when no assistant text arrived", () => {
    const out = collectClaudeTurn(lines(init, okResult));
    expect(out.text).toBe("final text");
  });

  test("surfaces an assistant-level auth error code", () => {
    const out = collectClaudeTurn(
      lines(init, { type: "assistant", session_id: "s", error: "authentication_failed", message: { content: [] } }),
    );
    expect(isClaudeAuthError(out.error ?? "")).toBe(true);
  });
});

describe("buildClaudeEnv", () => {
  test("carries what locates the credential, and drops the rest", () => {
    const env = buildClaudeEnv({ HOME: "/home/x", CLAUDE_CONFIG_DIR: "/cfg", PATH: "/usr/bin", AWS_SECRET_ACCESS_KEY: "s" });
    expect(env.HOME).toBe("/home/x");
    expect(env.CLAUDE_CONFIG_DIR).toBe("/cfg");
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  test("strips every variable that outranks the OAuth login", () => {
    // The Codex env trap in reverse: leaving one of these set bills an API account
    // instead of the user's subscription -- a turn that succeeds while charging the
    // wrong thing.
    const source: Record<string, string> = { HOME: "/home/x", PATH: "/usr/bin" };
    for (const name of billingOverrideVars()) source[name] = "set";
    const env = buildClaudeEnv(source);
    for (const name of billingOverrideVars()) expect(env[name]).toBeUndefined();
  });

  test("keeps ANTHROPIC_API_KEY only when BYOK is explicitly requested", () => {
    const source = { HOME: "/home/x", ANTHROPIC_API_KEY: "sk-ant" };
    expect(buildClaudeEnv(source).ANTHROPIC_API_KEY).toBeUndefined();
    expect(buildClaudeEnv(source, { useSubscription: false }).ANTHROPIC_API_KEY).toBe("sk-ant");
  });
});

describe("buildClaudeArgs", () => {
  const base = { claudePath: "/bin/claude", workingDirectory: "/proj" };

  test("cannot block waiting for a human", () => {
    // A GUI turn has no terminal for Claude to prompt on, so anything that waits for
    // an answer hangs forever.
    const args = buildClaudeArgs(base, "hi").join(" ");
    expect(args).toContain("--permission-mode dontAsk");
    expect(args).toContain("--permission-prompts none");
  });

  test("is read-only by default, enforced twice", () => {
    const args = buildClaudeArgs(base, "hi").join(" ");
    expect(args).toContain("--tools Read,Glob,Grep");
    // A bare name in --disallowedTools removes the tool from context entirely, and
    // --tools does not affect MCP tools, hence the explicit deny.
    expect(args).toContain("--disallowedTools Edit Write NotebookEdit Bash mcp__*");
  });

  test("never passes --bare, which would ignore the OAuth login", () => {
    expect(buildClaudeArgs(base, "hi")).not.toContain("--bare");
  });

  test("requests stream-json with the --verbose the CLI requires alongside it", () => {
    const args = buildClaudeArgs(base, "hi");
    expect(args).toContain("stream-json");
    expect(args).toContain("--verbose");
  });

  test("opts into edits only when asked", () => {
    const args = buildClaudeArgs({ ...base, allowEdits: true }, "hi").join(" ");
    expect(args).toContain("Edit,Write");
    expect(args).not.toContain("--disallowedTools");
  });

  test("resumes by session id when given one", () => {
    expect(buildClaudeArgs({ ...base, resumeSessionId: "sess_9" }, "hi").join(" ")).toContain("--resume sess_9");
  });
});

describe("discoverClaudeBinary", () => {
  test("prefers an existing override", () => {
    expect(discoverClaudeBinary({ REDROB_CLAUDE_PATH: "/opt/claude" }, (p) => p === "/opt/claude")).toBe("/opt/claude");
  });

  test("returns null when nothing is installed", () => {
    expect(discoverClaudeBinary({ PATH: "/usr/bin", HOME: "/home/x" }, () => false)).toBeNull();
  });

  test.if(process.platform !== "win32")("falls back past a minimal PATH", () => {
    const found = discoverClaudeBinary({ PATH: "/usr/bin", HOME: "/home/x" }, (p) => p === "/home/x/.claude/local/claude");
    expect(found).toBe("/home/x/.claude/local/claude");
  });
});

describe("ClaudeRuntime against a fake claude binary", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claude-runtime-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeFakeClaude(body: string, recordTo?: string): string {
    const path = join(dir, "claude");
    const preamble = `
const RECORD_TO = ${recordTo ? JSON.stringify(recordTo) : "null"};
if (RECORD_TO) {
  await Bun.write(RECORD_TO, JSON.stringify({
    argv: process.argv.slice(2),
    home: process.env.HOME ?? null,
    sawApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    sawOauthToken: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN),
  }));
}
`;
    writeFileSync(path, `#!/usr/bin/env bun\n${preamble}\n${body}\n`, "utf8");
    chmodSync(path, 0o755);
    return path;
  }

  const emitOk = `
for (const line of ${JSON.stringify(lines(init, { type: "assistant", session_id: "sess_1", message: { content: [{ type: "text", text: "fake answer" }] } }, okResult))}) {
  console.log(line);
}
`;

  test("spawns, parses stream-json, and returns the answer", async () => {
    const runtime = new ClaudeRuntime({ claudePath: writeFakeClaude(emitOk), workingDirectory: dir });
    const result = await runtime.send("hello");
    expect(result.status).toBe("completed");
    expect(result.text).toBe("fake answer");
    expect(result.usage?.costUsd).toBeCloseTo(0.015);
  });

  test("remembers the session id so the next message resumes", async () => {
    const runtime = new ClaudeRuntime({ claudePath: writeFakeClaude(emitOk), workingDirectory: dir });
    expect(runtime.currentSessionId).toBeNull();
    await runtime.send("first");
    expect(runtime.currentSessionId).toBe("sess_1");
  });

  test("the child gets HOME but neither a key nor an OAuth token", async () => {
    const out = join(dir, "env.json");
    const runtime = new ClaudeRuntime({ claudePath: writeFakeClaude(emitOk, out), workingDirectory: dir });
    process.env.ANTHROPIC_API_KEY = "must-not-propagate";
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "must-not-propagate";
    try {
      await runtime.send("hello");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
    const recorded = JSON.parse(readFileSync(out, "utf8"));
    expect(recorded.home).toBe(process.env.HOME ?? null);
    expect(recorded.sawApiKey).toBe(false);
    expect(recorded.sawOauthToken).toBe(false);
  });

  test("a CLI that dies before emitting a result reports stderr rather than nothing", async () => {
    const runtime = new ClaudeRuntime({
      claudePath: writeFakeClaude(`console.error("unknown option --nope");\nprocess.exit(2);`),
      workingDirectory: dir,
    });
    const result = await runtime.send("hello");
    expect(result.status).toBe("failed");
    expect(result.error).toContain("unknown option");
  });

  test("a signed-out claude surfaces as an auth failure", async () => {
    const runtime = new ClaudeRuntime({
      claudePath: writeFakeClaude(
        `console.log(${JSON.stringify(JSON.stringify({ type: "result", subtype: "error_during_execution", session_id: "s", is_error: true, errors: ["authentication_failed"] }))});`,
      ),
      workingDirectory: dir,
    });
    const result = await runtime.send("hello");
    expect(result.status).toBe("failed");
    expect(isClaudeAuthError(result.error ?? "")).toBe(true);
  });
});
