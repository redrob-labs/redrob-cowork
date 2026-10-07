/**
 * Claude Code runtime adapter — PROTOTYPE.
 *
 * The second harness backend, beside `codex-runtime.ts`. Drives the user's own
 * `claude` through its headless interface (`claude -p --output-format stream-json`)
 * so their Claude plan pays, and normalizes the stream into the same
 * `HarnessTurnResult` the Codex adapter produces. That shared result type is the whole
 * point of the split: a second runtime is a second NORMALIZER, not a second
 * architecture.
 *
 * Compliance, which is narrower here than for Codex and shapes the code:
 *
 *   - Claude Code is PROPRIETARY with no redistribution grant, so we can never ship
 *     it. `claudePath` is required and must point at the user's own install — there is
 *     no bundled fallback to fall back to, unlike Codex where the SDK quietly supplies
 *     one.
 *   - Anthropic forbids a third party offering Claude login or holding its tokens, and
 *     began blocking third-party harnesses from subscription billing on 2026-04-04. We
 *     never read `~/.claude/.credentials.json` or the keychain; auth state is read by
 *     ASKING the CLI. Treat the subscription path as revocable and keep BYOK working.
 *   - `--bare` is never passed: it deliberately never reads the OAuth login, so it
 *     would silently force an API key and bill the wrong account.
 *
 * See redrob-code `docs/PROVIDER-AUTH.md` and `docs/LOCAL-HARNESS-BACKENDS.md`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

/**
 * The shape both harness adapters produce, so a caller does not branch on runtime.
 *
 * Deliberately not Codex's `CodexTurnResult` re-exported: the two runtimes report
 * cost differently (Claude gives dollars, Codex gives tokens), so one honest union
 * beats pretending the fields mean the same thing.
 */
export type HarnessTurnResult = {
  /** Conversation id, so a later message can continue the same thread. */
  sessionId: string | null;
  text: string;
  status: "completed" | "failed";
  error?: string;
  /** Claude reports a dollar estimate; tokens are per-model and summed here. */
  usage: { inputTokens: number; outputTokens: number; costUsd: number } | null;
  /** Tool activity, kept so a UI can show what the agent did. */
  toolUses: Array<{ name: string; id: string }>;
};

export type ClaudeRuntimeOptions = {
  /**
   * Absolute path to the user's `claude`. REQUIRED — Claude Code is proprietary and
   * cannot be bundled, so there is nothing to default to.
   */
  claudePath: string;
  workingDirectory: string;
  /** Read-only by default; a caller that expects edits must opt in explicitly. */
  allowEdits?: boolean;
  model?: string;
  /** Continue an existing conversation instead of starting one. */
  resumeSessionId?: string;
  /**
   * Ask the CLI for partial message events, so text can be forwarded as it arrives.
   * Off by default: it multiplies the stream's line count, which is waste for a caller
   * that only wants the finished turn.
   */
  streamPartials?: boolean;
};

/** Same three states the Codex adapter reports, for one settings UI across runtimes. */
export type ClaudeAvailability =
  | { state: "not-installed" }
  | { state: "signed-out"; binary: string }
  | { state: "ready"; binary: string };

/**
 * Environment variables that OUTRANK the OAuth login in Claude Code's credential
 * precedence, and therefore silently change who pays.
 *
 * This is the Codex env trap in reverse. There, forgetting HOME lost the credential;
 * here, LEAVING one of these set quietly bills an API account instead of the user's
 * subscription — a turn that succeeds and looks correct while charging the wrong
 * thing, which is the hardest kind of bug to notice.
 */
const BILLING_OVERRIDE_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_PROFILE",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "ANTHROPIC_VERTEX_BASE_URL",
] as const;

/**
 * Build the child environment from an allow-list, then strip the billing overrides.
 *
 * `useSubscription: false` keeps `ANTHROPIC_API_KEY` so a BYOK caller can bill a key
 * on purpose. That is the one case where an override is the intent rather than an
 * accident, and it must be explicit.
 */
export function buildClaudeEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: { useSubscription?: boolean } = {},
): Record<string, string> {
  const useSubscription = options.useSubscription ?? true;
  const passthrough = [
    "HOME",
    "USERPROFILE",
    "CLAUDE_CONFIG_DIR",
    "PATH",
    "Path",
    "SYSTEMROOT",
    "SystemRoot",
    "COMSPEC",
    "TEMP",
    "TMP",
    "APPDATA",
    "LOCALAPPDATA",
  ];
  const env: Record<string, string> = {};
  for (const name of passthrough) {
    const value = source[name];
    if (typeof value === "string" && value.length > 0) env[name] = value;
  }
  if (!useSubscription) {
    const key = source.ANTHROPIC_API_KEY;
    if (typeof key === "string" && key.length > 0) env.ANTHROPIC_API_KEY = key;
  }
  return env;
}

/** Names of the variables this adapter refuses to forward when billing a subscription. */
export function billingOverrideVars(): readonly string[] {
  return BILLING_OVERRIDE_VARS;
}

/**
 * Flags for one non-interactive, read-only turn.
 *
 * `dontAsk` plus `--permission-prompts none` is the combination that CANNOT block: a
 * GUI turn has no terminal for Claude to prompt on, so anything that waits for an
 * answer hangs forever. Read-only is enforced twice on purpose — `--tools` limits the
 * built-ins, and a bare name in `--disallowedTools` removes the tool from Claude's
 * context entirely, which also stops it planning around a tool it cannot use.
 * `--tools` does not affect MCP tools, hence the explicit `mcp__*` deny.
 */
export function buildClaudeArgs(options: ClaudeRuntimeOptions, prompt: string): string[] {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    // stream-json requires --verbose; without it the CLI refuses the combination.
    "--verbose",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--add-dir",
    options.workingDirectory,
  ];
  // Partial messages are what make incremental delivery possible: without them the first
  // text arrives only when the assistant message completes, so a streaming caller can
  // emit one chunk at the end and nothing before it. Requested only when a caller
  // actually wants deltas, because it multiplies the line count on the stream.
  if (options.streamPartials) args.push("--include-partial-messages");
  if (options.allowEdits) {
    args.push("--tools", "Read,Glob,Grep,Edit,Write");
  } else {
    args.push(
      "--tools",
      "Read,Glob,Grep",
      "--disallowedTools",
      "Edit",
      "Write",
      "NotebookEdit",
      "Bash",
      "mcp__*",
    );
  }
  if (options.model) args.push("--model", options.model);
  if (options.resumeSessionId) args.push("--resume", options.resumeSessionId);
  return args;
}

/** True when the text looks like Claude reporting that nobody is signed in. */
export function isClaudeAuthError(message: string): boolean {
  return /\b(authentication_failed|not logged in|unauthorized|401|claude login|oauth_org_not_allowed|account_on_hold)\b/i
    .test(message);
}

/**
 * The assistant text carried by one stream-json line, or null.
 *
 * Used for LIVE forwarding while the turn runs, separately from `collectClaudeTurn`,
 * which folds the whole stream at the end. Two passes rather than one on purpose: the
 * fold is cheap, well tested and must stay correct for buffered callers, and making it
 * incremental-only would mean a streaming bug could silently change what a buffered
 * caller sees.
 *
 * With `--include-partial-messages` the deltas arrive as `stream_event` frames; without
 * it, text appears only when the assistant message completes. Both are handled so a
 * caller that forgot the flag still gets text, just later.
 */
export function textDeltaOf(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (message.type === "stream_event") {
    const event = message.event as { delta?: { type?: unknown; text?: unknown } } | undefined;
    if (event?.delta?.type === "text_delta" && typeof event.delta.text === "string") return event.delta.text;
    return null;
  }
  if (message.type === "assistant") {
    const inner = message.message as { content?: unknown } | undefined;
    const content = Array.isArray(inner?.content) ? inner.content : [];
    const text = content
      .filter(
        (block): block is { type: "text"; text: string } =>
          typeof block === "object" &&
          block !== null &&
          (block as { type?: unknown }).type === "text" &&
          typeof (block as { text?: unknown }).text === "string",
      )
      .map((block) => block.text)
      .join("");
    return text || null;
  }
  return null;
}

/**
 * Fold `stream-json` lines into one turn result.
 *
 * Exported separately so every message type can be pinned without a process, which is
 * how the Codex adapter is tested too.
 *
 * Three field choices worth stating, all from the documented schema:
 *
 *   - Cost comes from `modelUsage`, NOT `usage`. `usage` covers the main loop only and
 *     undercounts subagents, so billing read from it is quietly low.
 *   - Success is `subtype === "success"` AND `is_error !== true`. Either alone is not
 *     enough: the error arm uses `error_*` subtypes, and `is_error` can be set on the
 *     success arm too.
 *   - `session_id` is read from whichever message carries it. It is on every one, and
 *     `system`/`init` is merely the earliest — insisting on that message would lose
 *     the id whenever startup events precede it.
 */
export function collectClaudeTurn(lines: Iterable<string>): HarnessTurnResult {
  const chunks: string[] = [];
  const toolUses: Array<{ name: string; id: string }> = [];
  let sessionId: string | null = null;
  let usage: HarnessTurnResult["usage"] = null;
  let status: HarnessTurnResult["status"] = "failed";
  let error: string | undefined = "Claude stream ended before a result message";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // A non-JSON line is not fatal: the CLI can emit diagnostics, and dropping the
      // turn over one unparseable line would turn a cosmetic warning into a failure.
      continue;
    }

    if (typeof message.session_id === "string") sessionId = message.session_id;

    switch (message.type) {
      case "assistant": {
        const inner = message.message as { content?: unknown } | undefined;
        const content = Array.isArray(inner?.content) ? inner.content : [];
        for (const block of content) {
          if (typeof block !== "object" || block === null) continue;
          const typed = block as Record<string, unknown>;
          if (typed.type === "text" && typeof typed.text === "string") chunks.push(typed.text);
          if (typed.type === "tool_use" && typeof typed.name === "string") {
            toolUses.push({ name: typed.name, id: typeof typed.id === "string" ? typed.id : "" });
          }
        }
        // An assistant message can carry its own error code (authentication_failed,
        // rate_limit, ...) while the stream continues to a result.
        if (typeof message.error === "string") error = message.error;
        break;
      }
      case "result": {
        const subtype = message.subtype;
        const isError = message.is_error === true;
        if (subtype === "success" && !isError) {
          status = "completed";
          error = undefined;
        } else {
          status = "failed";
          const errors = Array.isArray(message.errors) ? message.errors.filter((e) => typeof e === "string") : [];
          error = errors.length > 0 ? errors.join("; ") : typeof subtype === "string" ? subtype : "unknown failure";
        }
        // `result` also carries the final text; prefer accumulated assistant text and
        // fall back to it, because a turn can end with text only in `result`.
        if (chunks.length === 0 && typeof message.result === "string") chunks.push(message.result);
        usage = summarizeUsage(message);
        break;
      }
      default:
        break;
    }
  }

  return { sessionId, text: chunks.join(""), status, error, usage, toolUses };
}

/** Sum per-model usage, which is the only place subagent spend is counted. */
function summarizeUsage(result: Record<string, unknown>): HarnessTurnResult["usage"] {
  const perModel = result.modelUsage;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let sawAny = false;

  if (typeof perModel === "object" && perModel !== null) {
    for (const entry of Object.values(perModel as Record<string, unknown>)) {
      if (typeof entry !== "object" || entry === null) continue;
      const model = entry as Record<string, unknown>;
      if (typeof model.inputTokens === "number") inputTokens += model.inputTokens;
      if (typeof model.outputTokens === "number") outputTokens += model.outputTokens;
      if (typeof model.costUSD === "number") costUsd += model.costUSD;
      sawAny = true;
    }
  }
  if (!sawAny) {
    // total_cost_usd is a client-side estimate and is cumulative across a resumed
    // conversation, so it is the fallback rather than the source.
    if (typeof result.total_cost_usd === "number") {
      return { inputTokens: 0, outputTokens: 0, costUsd: result.total_cost_usd };
    }
    return null;
  }
  return { inputTokens, outputTokens, costUsd };
}

/** Find the user's own `claude`, or null. Same contract as `discoverCodexBinary`. */
export function discoverClaudeBinary(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = (path) => existsSync(path),
): string | null {
  const explicit = env.REDROB_CLAUDE_PATH?.trim();
  if (explicit && exists(explicit)) return explicit;

  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const onPath = (env.PATH ?? env.Path ?? "").split(process.platform === "win32" ? ";" : ":");
  for (const entry of onPath) {
    if (!entry) continue;
    if (exists(join(entry, exe))) return join(entry, exe);
  }

  const home = env.HOME ?? env.USERPROFILE ?? "";
  if (!home) return null;
  // A GUI process does not inherit the user's shell PATH, so a claude that works in
  // their terminal is invisible to a PATH-only lookup.
  const roots = [
    join(home, ".claude", "local"),
    join(home, ".npm-global", "bin"),
    join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  if (process.platform === "win32") roots.push(join(home, "AppData", "Roaming", "npm"));
  for (const root of roots) {
    if (exists(join(root, exe))) return join(root, exe);
  }
  return null;
}

/** One conversation with the user's Claude Code. */
export class ClaudeRuntime {
  private readonly options: ClaudeRuntimeOptions;
  private sessionId: string | null = null;

  constructor(options: ClaudeRuntimeOptions) {
    this.options = options;
    this.sessionId = options.resumeSessionId ?? null;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  async send(prompt: string, signal?: AbortSignal, onText?: (delta: string) => void): Promise<HarnessTurnResult> {
    const args = buildClaudeArgs(
      {
        ...this.options,
        resumeSessionId: this.sessionId ?? undefined,
        // Only pay for partial frames when someone is listening for them.
        streamPartials: this.options.streamPartials ?? Boolean(onText),
      },
      prompt,
    );
    const child = spawn(this.options.claudePath, args, {
      cwd: this.options.workingDirectory,
      env: buildClaudeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      signal,
    });

    let stdout = "";
    let stderr = "";
    // A chunk boundary can land mid-line, so hold the tail until a newline arrives.
    // Forwarding a half-line would emit broken JSON to the delta extractor and, worse,
    // split a word in the user's visible output.
    let pending = "";
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (!onText) return;
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const delta = textDeltaOf(line);
        if (delta) onText(delta);
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      // `close`, not `exit`: stdout must have drained or the final result line is lost.
      child.once("close", (code) => resolve(code));
    });

    const result = collectClaudeTurn(stdout.split("\n"));
    if (result.sessionId) this.sessionId = result.sessionId;

    // A non-zero exit with no parsed result means the CLI failed before emitting one —
    // a bad flag, a missing binary dependency. stderr is the only explanation there.
    if (result.status === "failed" && result.text === "" && exitCode !== 0 && stderr.trim()) {
      return { ...result, error: stderr.trim().split("\n").slice(-3).join("\n") };
    }
    return result;
  }
}
