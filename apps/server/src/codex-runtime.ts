/**
 * Codex runtime adapter — PROTOTYPE.
 *
 * Drives the user's own locally-installed `codex` binary through
 * `@openai/codex-sdk`, so a turn is paid for by THEIR ChatGPT plan rather than by
 * our Console key. Nothing here is wired into the engine pool yet; see
 * `docs/CODEX-RUNTIME.md` for why that wiring is a separate decision.
 *
 * Why this is allowed where a "Sign in with ChatGPT" button of our own would not
 * be: the Codex CLI performs its own login and caches its own credential. We
 * spawn it and never see a token. The sanctioned interfaces are named in
 * OpenAI's own docs (`codex exec`, this SDK, `codex app-server`).
 *
 * Deliberately NOT a `ManagedOpencodeServer`. That contract
 * (`managed-opencode.ts:18-25`) requires serving the whole OpenCode HTTP session
 * API on loopback with Basic auth, which `codex` does not do. Pretending to
 * satisfy it would mean writing a protocol shim, and that belongs behind a real
 * backend seam rather than inside a spawn hook.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Codex, type ThreadEvent, type ThreadItem } from "@openai/codex-sdk";

/** Where a turn's text and cost land, normalized off the SDK's event union. */
export type CodexTurnResult = {
  /** Thread id, so a later message can continue the same conversation. */
  threadId: string | null;
  /** Concatenated assistant text, in emission order. */
  text: string;
  /** Terminal state of the turn. */
  status: "completed" | "failed";
  /** Present when status is "failed". */
  error?: string;
  /** Token counts as Codex reported them, or null if the turn never completed. */
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
  } | null;
  /** Non-message items, kept so a UI can show tool activity. */
  items: ThreadItem[];
};

/**
 * Where the user's own `codex` might be, beyond PATH.
 *
 * PATH is checked first and is the normal answer. These are the fallbacks for a GUI
 * process, whose PATH is frequently not the user's shell PATH — an Electron app
 * launched from Finder or a desktop launcher inherits a minimal environment, so a
 * `codex` the user installed via npm, Homebrew or the official installer is often
 * invisible to `which` from inside the app even though it works in their terminal.
 * Getting this wrong looks to the user like "your app cannot find Codex" when Codex
 * is plainly installed.
 */
function candidatePaths(home: string): string[] {
  const exe = process.platform === "win32" ? "codex.exe" : "codex";
  const roots = [
    // Official standalone installer.
    join(home, ".codex", "bin"),
    // npm -g, both common prefixes.
    join(home, ".npm-global", "bin"),
    join(home, ".local", "bin"),
    // Homebrew, Apple silicon then Intel.
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
  if (process.platform === "win32") {
    roots.push(join(home, "AppData", "Roaming", "npm"), join(home, "AppData", "Local", "Programs", "codex"));
  }
  return roots.map((root) => join(root, exe));
}

/**
 * Find the `codex` the USER installed, or null.
 *
 * Returns null rather than throwing or guessing: "not installed" is a state the UI
 * has to render differently from "installed but not signed in", and collapsing the
 * two strands the user because the remedy differs.
 */
export function discoverCodexBinary(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = (path) => existsSync(path),
): string | null {
  const explicit = env.REDROB_CODEX_PATH?.trim();
  if (explicit && exists(explicit)) return explicit;

  const pathEntries = (env.PATH ?? env.Path ?? "").split(process.platform === "win32" ? ";" : ":");
  const exe = process.platform === "win32" ? "codex.exe" : "codex";
  for (const entry of pathEntries) {
    if (!entry) continue;
    const candidate = join(entry, exe);
    if (exists(candidate)) return candidate;
  }

  const home = env.HOME ?? env.USERPROFILE ?? "";
  if (home) {
    for (const candidate of candidatePaths(home)) {
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * The three states a settings UI must distinguish. One "unavailable" is not enough:
 * the remedy for each is different, and for `signed-out` the remedy is the vendor's
 * own login, which we may point at but must never present as our own.
 */
export type CodexAvailability =
  | { state: "not-installed" }
  | { state: "signed-out"; binary: string }
  | { state: "ready"; binary: string };

export type CodexRuntimeOptions = {
  /**
   * Absolute path to the `codex` binary to drive. REQUIRED, and that is the point.
   *
   * Omitting it does NOT fall back to PATH. `@openai/codex-sdk` pins
   * `@openai/codex` to an exact version and resolves the executable out of its own
   * bundled platform packages (`@openai/codex-linux-x64` and friends) unless
   * `codexPathOverride` is set — so the default drives a SECOND copy of Codex that
   * we downloaded as an npm dependency, not the one the user installed and signed
   * in to.
   *
   * That default is wrong for us twice over: it re-creates the duplicate-engine
   * problem this work exists to remove, and it makes "use the runtime you already
   * have" untrue. Auth would still have appeared to work, because the credential
   * lives under CODEX_HOME rather than beside the binary — which is exactly what
   * would have let this ship quietly.
   *
   * `discoverCodexBinary` finds the user's install; the caller decides what to do
   * when there is none. Also the seam the tests use: they point this at a fake
   * binary that speaks the same JSONL, mirroring `writeFakeEngineBin` in
   * `engine-pool.test.ts`.
   */
  codexPath: string;
  /** Directory the agent may read and (with workspace-write) modify. */
  workingDirectory: string;
  /**
   * Default read-only. A document or coding surface that expects edits must opt
   * in explicitly — the adapter does not quietly grant write access.
   */
  sandboxMode?: "read-only" | "workspace-write";
  model?: string;
  /** Codex is not run inside a git repo in our case, so default to skipping. */
  skipGitRepoCheck?: boolean;
};

/**
 * Codex's `ApprovalMode` type still lists "untrusted", but the CLI retired that
 * value and now rejects it. We never send it: "never" is the only correct choice
 * for a GUI turn, because there is no terminal for Codex to prompt on and an
 * approval request would hang the turn forever.
 */
const NON_INTERACTIVE_APPROVAL = "never" as const;

/**
 * Environment for the spawned CLI.
 *
 * `CodexOptions.env` REPLACES `process.env` rather than merging with it — the
 * SDK's own type says "When provided, the SDK will not inherit variables from
 * process.env". So a hand-built env that forgets HOME makes the CLI unable to
 * find `~/.codex/auth.json`, and a signed-in user is reported as signed out.
 * That failure looks like an auth bug and is really a spawn bug, so the variables
 * that locate the credential cache are allow-listed here explicitly.
 *
 * Passing no env at all would also work, but then every unrelated variable in the
 * Electron main process is inherited by a child that does not need them.
 */
export function buildCodexEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  // HOME / USERPROFILE locate ~/.codex; CODEX_HOME overrides it; PATH lets the
  // CLI find the tools it shells out to; the rest are needed on Windows for a
  // child process to start at all.
  const passthrough = [
    "HOME",
    "USERPROFILE",
    "CODEX_HOME",
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
  for (const name of passthrough) {
    const value = source[name];
    if (typeof value === "string" && value.length > 0) env[name] = value;
  }
  return env;
}

/**
 * True when the text looks like Codex reporting that nobody is signed in.
 *
 * Matched on the message rather than an exit code because the SDK surfaces this
 * as a `turn.failed` / `error` event, not as a spawn failure. Callers use it to
 * show "run `codex login`" instead of a generic failure — we must NOT offer a
 * sign-in button of our own, so pointing at Codex's own flow is the whole
 * remedy we are allowed to give.
 */
export function isCodexAuthError(message: string): boolean {
  return /\b(not logged in|no credentials|unauthorized|401|run `?codex login|sign in with chatgpt)\b/i
    .test(message);
}

/** Text of an assistant message item, or null for any other item type. */
function agentMessageText(item: ThreadItem): string | null {
  return item.type === "agent_message" ? item.text : null;
}

/**
 * Fold the SDK's event stream into one turn result.
 *
 * Separated from the spawn so it can be tested against a synthetic event
 * sequence with no binary at all, and so the two failure modes stay distinct: a
 * `turn.failed` event (Codex ran and refused) versus a top-level `error` event
 * (the stream itself died).
 */
export async function collectTurn(
  events: AsyncIterable<ThreadEvent>,
  threadId: () => string | null,
): Promise<CodexTurnResult> {
  const chunks: string[] = [];
  const items: ThreadItem[] = [];
  let usage: CodexTurnResult["usage"] = null;
  let status: CodexTurnResult["status"] = "failed";
  let error: string | undefined =
    // A stream that ends with no terminal event is a failure, not an empty
    // success: reporting "" as a completed answer would render a blank reply and
    // look like the model had nothing to say.
    "Codex stream ended before the turn completed";

  for await (const event of events) {
    switch (event.type) {
      case "item.completed": {
        const text = agentMessageText(event.item);
        if (text !== null) chunks.push(text);
        else items.push(event.item);
        break;
      }
      case "turn.completed": {
        status = "completed";
        error = undefined;
        usage = {
          inputTokens: event.usage.input_tokens,
          cachedInputTokens: event.usage.cached_input_tokens,
          outputTokens: event.usage.output_tokens,
          reasoningOutputTokens: event.usage.reasoning_output_tokens,
        };
        break;
      }
      case "turn.failed": {
        status = "failed";
        error = event.error.message;
        break;
      }
      case "error": {
        status = "failed";
        error = event.message;
        break;
      }
      default:
        // thread.started, turn.started, item.started, item.updated carry no
        // terminal information. Ignored rather than enumerated so a new SDK
        // event type does not break the build.
        break;
    }
  }

  return { threadId: threadId(), text: chunks.join(""), status, error, usage, items };
}

/**
 * One conversation with the user's Codex. Create per session; call `send` per
 * message. The first `send` creates the thread, later ones continue it.
 */
export class CodexRuntime {
  private readonly codex: Codex;
  private readonly options: CodexRuntimeOptions;
  private threadId: string | null = null;

  constructor(options: CodexRuntimeOptions) {
    this.options = options;
    this.codex = new Codex({
      codexPathOverride: options.codexPath,
      env: buildCodexEnv(),
      // No apiKey and no baseUrl on purpose. Setting apiKey would make the SDK
      // export CODEX_API_KEY and the turn would bill an API account instead of
      // the user's ChatGPT plan, which is the entire point of this adapter.
    });
  }

  /** The thread id, once the first turn has started. */
  get currentThreadId(): string | null {
    return this.threadId;
  }

  async send(prompt: string, signal?: AbortSignal): Promise<CodexTurnResult> {
    const threadOptions = {
      workingDirectory: this.options.workingDirectory,
      sandboxMode: this.options.sandboxMode ?? ("read-only" as const),
      approvalPolicy: NON_INTERACTIVE_APPROVAL,
      skipGitRepoCheck: this.options.skipGitRepoCheck ?? true,
      ...(this.options.model ? { model: this.options.model } : {}),
    };

    const thread = this.threadId
      ? this.codex.resumeThread(this.threadId, threadOptions)
      : this.codex.startThread(threadOptions);

    const { events } = await thread.runStreamed(prompt, { signal });
    const result = await collectTurn(events, () => thread.id);
    // Remember the id even on failure: a turn that failed mid-way still created
    // a thread, and dropping the id would start a fresh conversation on retry
    // and lose the context the user already paid for.
    if (result.threadId) this.threadId = result.threadId;
    return result;
  }
}
