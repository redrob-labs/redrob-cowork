import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Localization guard for `.ts` TEXT MODULES.
 *
 * `renderer-localization.test.ts` scans only `.tsx`, because its detector reads
 * JSX text nodes. That left every `.ts` file unguarded, and English accumulated
 * there until a user reported a Korean build full of English: tool activity
 * labels on every message, the first-launch splash, connection diagnostics,
 * error cards. 315 user-visible literals across 40 files.
 *
 * Scope is "files that import `t`". That is a self-maintaining signal -- a
 * module that pulls in the translator is a module that produces display text --
 * so this needs no hand-kept file list and it grows with the app. Protocol,
 * transport, and pure-logic modules never import `t` and are never scanned.
 *
 * A literal is reported when it looks like English PROSE. The allowlist below
 * records the strings this repo deliberately keeps in English, each with the
 * reason, so those decisions are written down rather than re-litigated.
 */
const SRC_DIR = join(import.meta.dir, "..", "src");

/**
 * Modules whose text only ever appears behind developer mode.
 *
 * Same rationale as `DEVELOPER_ONLY` in `renderer-localization.test.ts`: this
 * panel prints runtime internals for whoever is debugging the build, its
 * messages name Electron/Tauri migration mechanics, and translating them would
 * make them harder to match against the logs they describe.
 */
const DEVELOPER_ONLY = new Set<string>([
  "react-app/domains/settings/state/debug-view-model.ts",
]);

/** Strings that stay English on purpose. */
const ALLOWED = new Set<string>([
  // Text appended for the MODEL, telling it how to reach attachment bytes.
  // It is tool instruction, not UI copy, so it stays in the model's language.
  "Use these paths with Read/Bash/MCP/Docling when a tool needs the file bytes.",
  // Debug rows inside a technical-details expando. The label mirrors the wire
  // field it prints, so translating it breaks correlation with logs.
  "Error type: ",
  "Message: ",
  "Status: ",
  "Provider: ",
  "Code: ",
  "Cause code: ",
  "Retries: ",
  "Response: ",
  "Stage: ",
  "Tool: ",
  "Resource: ",
  "Sandbox origin: ",
  "Elapsed: ",
  "Document: ",
  "Checkpoints: ",
  // Prompt text sent to the MODEL, not shown to the user. Translating model
  // input would change behaviour, so it is deliberately not localized.
  "Continue the interrupted task from the current state.",
  "First inspect the conversation and workspace to verify which actions already completed.",
  "Preserve completed work, do not repeat side effects, and finish only what remains.",
  // HTTP reason phrases, which are protocol vocabulary rather than prose.
  "Bad Request",
  "Unauthorized",
  "Forbidden",
  "Not Found",
  "Request Timeout",
  "Payload Too Large",
  "Too Many Requests",
  "Internal Server Error",
  "Not Implemented",
  "Bad Gateway",
  "Service Unavailable",
  "Gateway Timeout",
  "Web Server Returned an Unknown Error",
  "Connection Timed Out",
  "A Timeout Occurred",
  // API-contract invariants. Both are thrown before any UI sees them: callers
  // supply a typed File and validate the workspace id first.
  "workspaceId is required",
  "file is required",
  // Model-facing text found by extending this guard to .tsx: MCP tool and
  // UI-control-action descriptions, their argument descriptions, prompts and
  // preview args handed to the model, dev-gated eval-hook fixtures, and the
  // {ok:false,error} results those hooks and control actions return. All of it
  // is schema or model input rather than copy: translating a tool description
  // changes which tool the model picks, and a localized eval fixture makes a
  // deterministic test locale-dependent.
  "Base64 encoded PCM16 mono audio.",
  "Built-in browser is not available.",
  "Close the Voice Mode right-side panel.",
  "Connect the Voice Mode panel to OpenAI Realtime and start listening.",
  "Create a deterministic markdown artifact and open it in the preview panel.",
  "Create a workspace at the given folder path without showing the file picker dialog, optionally labeling its project for analytics.",
  "Create many markdown artifacts and open them in the right-side artifact tab strip.",
  "Create or select a Redrob Work built-in browser tab, navigate it to a URL, and return the CDP handle for browser automation.",
  "Deterministic eval hook: add a transcript to Voice Mode and place it in the composer.",
  "Deterministic eval hook: send PCM16 audio through the active OpenAI Realtime input buffer.",
  "Dev-only eval hook that displays the selected session activity spinner.",
  "Dev-only eval hook that renders a deterministic transcript with capability calls, aggregated tools, thinking, links, and file chips.",
  "Dev-only eval hook that renders deterministic LaTeX math in the active conversation.",
  "Dev-only eval hook that renders deterministic Markdown in the active conversation.",
  "Dev-only eval hook that selects a missing model and returns an available model to recover with.",
  "Disconnect the active Voice Mode Realtime session.",
  "Focus a session already visible in either split-screen pane, or reuse its existing tab without opening a duplicate.",
  "Help me outline the next Redrob Work task.",
  "No available connected model found for eval recovery.",
  "No session is selected.",
  "Open the Redrob Work feedback surface from the status menu.",
  "Open the documentation from the status menu.",
  "Open the in-app command palette so the next choice is visible.",
  "Open the provider connection modal, optionally pre-filtered to a specific provider.",
  "Open the sticky Voice Mode right-side panel.",
  "Realtime channel is not open.",
  "Redrob Code client is not connected.",
  "Replace the current session draft and type the supplied text visibly.",
  "Return the Voice Mode runtime state for tests and agents.",
  "Return the current notification center entries.",
  "Return the last messages from the current session transcript as readable text, including the session ID, title, and message count.",
  "Return the latest visible message in the current session transcript.",
  "Save this to my memory bank: draft a crisp, self-contained memory of the key fact worth keeping from our conversation, show it to me to confirm or edit, then save it. Do not include any secrets, credentials, tokens, or personal data.",
  "Scroll the visible session transcript to the first messages.",
  "Scroll the visible session transcript to the newest messages and composer area.",
  "Send a deterministic text command through the active OpenAI Realtime voice session.",
  "Send the currently visible composer draft to the active session.",
  "Session id from the Redrob Work context resources or conversation tabs.",
  "Show the LaTeX math proof message.",
  "Show the Markdown primitive proof message.",
  "Stop the current streaming session run.",
  "Summarize the current Redrob Work session and put the next step in the composer.",
  "Text command to send through the Realtime model.",
  "The link could not be opened.",
  "The user declined the MCP App tool call.",
  "Toggle the microphone track without closing the Realtime session.",
  "Transcript text to inject.",
  "Use the status menu in the sidebar footer.",
  "What did we decide about pricing?",
  "Workspace client is not ready.",
  "Write a small valid PDF and open it as an artifact tab to verify inline PDF rendering.",
  // The English name of a language, which exists for English-facing surfaces.
  // Localized display goes through `localizedLanguageName()` instead.
  "English",
  "Korean",
]);

/**
 * Looks like a sentence or a phrase a user would read: at least two
 * ASCII-letter words, and no characters that mark it as code.
 */
/**
 * Sentence-shaped English: an initial capital, at least three letter-words, and
 * terminal punctuation.
 *
 * Deliberately narrow. A title-case label ("Connect Computer Use MCP"), a model
 * display name ("Claude Sonnet 4") and a header ("Content-Type") are
 * indistinguishable from proper nouns without semantics, so flagging them would
 * mean a large allowlist and a guard nobody trusts. A full sentence in a text
 * module is unambiguous, and it is the shape of everything this sweep found
 * missing: descriptions, error messages, hints, setup instructions.
 */
const PROSE = new RegExp(
  "^(?=(?:.*?\\b[A-Za-z]{2,}\\b){3})[A-Z][A-Za-z0-9 .,'’\\-()\\/:;\"]*[.?!]\\s*$",
);
const CODEISH = /[{}<>$\\|=_]|\.\w|\/\/|::/;

/** Built from strings: these mix quotes and slashes that trip a regex literal. */
const KEY_ARG = new RegExp("\\bt\\(\\s*[\"'][^\"']*[\"']", "g");
const IMPORT_LINE = new RegExp("^\\s*import[\\s\\S]*?from\\s*[\"'][^\"']*[\"'];?$", "gm");
const LITERAL = new RegExp("\"([^\"\\\\\\n]{10,})\"|'([^'\\\\\\n]{10,})'", "g");
const IMPORTS_T = new RegExp("import\\s*\\{[^}]*\\bt\\b[^}]*\\}\\s*from\\s*[\"'][^\"']*i18n[\"']");

const sources: { name: string; code: string }[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "locales") continue; // the bundles are the translations
      walk(path);
      continue;
    }
    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue;
    if (path.endsWith(".d.ts")) continue;
    const raw = readFileSync(path, "utf8");
    // Only text modules: a file that imports the translator produces display text.
    if (!IMPORTS_T.test(raw)) continue;
    const name = relative(SRC_DIR, path);
    if (DEVELOPER_ONLY.has(name)) continue;
    sources.push({
      name,
      code: raw
        // Comments explain intent to developers and are never rendered.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        // Translation keys are arguments to t(), not display text.
        .replace(KEY_ARG, "t(KEY")
        // Import specifiers are paths.
        .replace(IMPORT_LINE, ""),
    });
  }
};
walk(SRC_DIR);

describe("ts text modules are localized", () => {
  test("the guard actually covers the modules that produce display text", () => {
    // Reverse-verification: if the import-based scope silently matched nothing,
    // every assertion below would pass vacuously.
    expect(sources.length).toBeGreaterThan(30);
  });

  test("no bare English prose literal outside t()", () => {
    const offenders: string[] = [];
    for (const { name, code } of sources) {
      for (const match of code.matchAll(LITERAL)) {
        const value = (match[1] ?? match[2])!;
        if (ALLOWED.has(value) || CODEISH.test(value) || !PROSE.test(value)) continue;
        offenders.push(`${name}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
