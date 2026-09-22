# Running on the user's own Codex or Claude Code

A second way for Cowork to answer a turn: instead of calling our bundled engine
with our Console credential, drive the coding agent the user already installed
and signed in to, so their own ChatGPT or Claude plan pays.

This document exists because the obvious place to plug that in is the wrong place,
and because the two vendors permit it only in a narrow shape that constrains the
design. Both are worth writing down before anyone wires it up.

Status: `apps/server/src/codex-runtime.ts` is a working, tested adapter. Nothing
is wired into the engine pool. The decision in "Where it plugs in" is open.

## Why this is permitted at all

Our own "Sign in with Claude" or "Sign in with ChatGPT" button is not allowed and
would get users banned — Anthropic's compliance page forbids third parties
offering Claude.ai login or routing through plan credentials, and Anthropic began
rejecting third-party harness OAuth tokens server-side in April 2026, breaking
tools that did it. See redrob-code `docs/PROVIDER-AUTH.md` for the full survey.

Driving the vendor's own unmodified binary is the documented exception, and the
distinction is exactly one thing: **who holds the credential.**

- OpenAI publishes the integration surface — `codex exec`, `@openai/codex-sdk`,
  `codex app-server` ([Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform)).
  `codex exec` "reuses saved CLI authentication by default"
  ([non-interactive mode](https://developers.openai.com/codex/non-interactive-mode)),
  and the CLI's own `Sign in with ChatGPT` covers Plus, Pro, Business, Edu and
  Enterprise plans. Apache-2.0.
- Anthropic permits preinstalling or running Claude Code in a product under its
  Commercial Terms, on two conditions quoted verbatim in
  `docs/PROVIDER-AUTH.md`: the binary must not be modified and its built-in auth
  methods must not be removed or restricted, and we may not pay for, resell, or
  intermediate usage — each end user authenticates themselves. The same page
  states that nothing prevents "an end user from signing in to the unmodified
  Claude Code binary with their own Claude subscription, including where a
  platform hosts Claude Code".

Three rules fall out, and they are load-bearing rather than cautious:

1. **We never see a token.** No reading `~/.codex/auth.json`, no reading Claude
   Code's credential store, no proxying a login, no pre-seeding. If the binary is
   not signed in, we surface *its* instruction and stop.
2. **We never offer the vendor's login ourselves.** The remedy we may show is
   "run `codex login`", not a button that starts an OAuth flow.
3. **We never pay.** No API key of ours reaches the subprocess. The adapter
   deliberately leaves `CodexOptions.apiKey` unset, because setting it makes the
   SDK export `CODEX_API_KEY` and the turn bills an API account instead of the
   user's plan — which would be the intermediation both vendors prohibit.

Claude Code adds constraints Codex does not: it is **proprietary** (`LICENSE.md`
is one line reserving all rights) with no redistribution grant, so we cannot ship
the binary — only use one the user installed, or install it as published. Its
name and logo may not appear in our product, feature or company name; plain text
saying the product "runs Claude Code" is the entire permitted claim. And its Agent
SDK path is **API-key only** for a third party, so the subscription-eligible
interfaces are `claude -p` and the official ACP adapter, driven under the user's
own login.

## What the adapter does

`apps/server/src/codex-runtime.ts`, tested in `codex-runtime.test.ts` (15 tests).

`CodexRuntime` holds one conversation. `send()` starts a thread on the first call
and resumes it after that, streams `@openai/codex-sdk` events, and folds them into
one `CodexTurnResult` (`text`, `status`, `usage`, non-message `items`, `threadId`).
`collectTurn` is exported separately so the normalization is testable with no
process at all.

Four decisions in there are not obvious:

**`buildCodexEnv` allow-lists the environment.** `CodexOptions.env` *replaces*
`process.env` rather than merging — the SDK's own type says so. A hand-built env
that forgets `HOME` leaves the CLI unable to find `~/.codex/auth.json`, so a
signed-in user is reported as signed out: an auth bug that is really a spawn bug.
The variables that locate the credential cache are therefore named explicitly, and
everything else — including our `REDROB_API_KEY` — is dropped rather than handed
to a child that must not use it. An empty value is omitted too, because `HOME=""`
resolves to `/.codex/auth.json` at the filesystem root and reads as "not logged
in".

**Approval policy is pinned to `never`.** A GUI turn has no terminal for Codex to
prompt on, so an approval request would hang the turn forever. Note the SDK's
`ApprovalMode` type still lists `"untrusted"`, which the CLI **retired and now
rejects** — a test asserts we never send it.

**The sandbox defaults to `read-only`.** Write access is opted into, never
inherited, because the same adapter will be reachable from surfaces where an agent
editing the working tree is not expected.

**A stream that ends with no terminal event is a failure.** Returning
`{ status: "completed", text: "" }` there would render a blank assistant reply and
read as "the model had nothing to say" — the same class of bug as the unhandled
`provider-error` stream element in redrob-code's completions handler.

### What is verified and what is not

Verified on a host with no `codex` and no ChatGPT login: event normalization,
every failure mode, the environment construction, the argv we actually pass, and
the spawn path end to end against a fake binary that emits real JSONL
(`codexPathOverride` is the seam; the fake mirrors `writeFakeEngineBin` in
`engine-pool.test.ts:51-100`). The approval-policy assertion was reverse-verified:
removing the option makes it fail.

**Not verified:** that a real `codex` accepts these flags, and that a real
subscription pays for the turn. That needs a machine with the CLI installed and
signed in. Until then, treat the live path as unproven.

## Where it plugs in — the open decision

Cowork has **no backend seam**. The AI path is renderer `sendPrompt`
(`apps/app/src/react-app/domains/session/sync/actions-store.ts:471`) → `POST
/session/:id/prompt_async` (`apps/app/src/app/lib/opencode.ts:475-486`) →
`redrob-server` proxying verbatim (`apps/server/src/server.ts:1048,1339`) → the
bundled engine, which makes the model call. Cowork only *declares* the provider
(`apps/app/src/react-app/domains/settings/redrob-provider.ts:180-187`). No file
abstracts "AI backend".

The one injectable seam is `EnginePoolHooks.spawn`
(`apps/server/src/engine-pool.ts:65`), and its contract is the problem: it must
return a `ManagedOpencodeServer` (`managed-opencode.ts:18-25`) serving the **whole
OpenCode HTTP session API** on loopback with Basic auth — `/session/:id/prompt_async`,
`/session/status`, `/event`, `/permission`. `codex` serves none of that. Two
adjacent facts bind it further: `REDROB_CODE_BIN_NAME = "redrob"` is hardcoded
with a comment refusing any other binary (`managed-opencode.ts:111`), and
readiness is matched on the literal string `redrob server listening` (`:119`).

So there are two options, and they are genuinely different bets.

**A. A protocol shim.** Write something that speaks the OpenCode session API in
front of `codex`. It needs no changes anywhere else in Cowork — the proxy, the
renderer and the event stream all keep working. The cost is that the shim must
keep re-implementing a surface it does not own: sessions, the SSE event shape,
permissions, and whatever the engine adds next. It is the fast path to a demo and
the slow path forever after.

**B. A real backend seam.** Introduce the abstraction Cowork currently lacks, at
the point where the server decides where a prompt goes, and give it two
implementations: the engine proxy that exists today, and this adapter. More work
up front, in a repo that has no precedent for it, but it is the change that makes
"which backend answers this session" a first-class setting instead of a
substitution trick.

Recommendation: **B**, and not because it is cleaner in the abstract. A has to
emulate an event and permission protocol that redrob-code keeps evolving, and the
failure mode is silent drift — a shim that is subtly behind the engine produces
bugs that look like model bugs. B also generalizes to Claude Code, whose interface
is `claude -p` and not the OpenCode API either, so A would need a second shim.

Either way the tool problem stays: Codex runs its own agent loop with its own
tools, while Cowork's tools are OpenCode plugins loaded *by the engine*
(`apps/server/src/redrob-runtime-config.ts:125-133`). Under a Codex backend those
plugins do not exist. The two ways to give it our tools are MCP servers in
`~/.codex/config.toml` (or per-invocation `--config mcp_servers.…`), and
app-server's `dynamicTools`, which lets tools stay inside our process and answers
an `item/tool/call` request over JSON-RPC. `dynamicTools` is the better fit for
anything whose tools cannot be a standalone process — Office's document editing is
the clear case — but it is on `codex app-server`, which OpenAI labels experimental
and "not supported for production workloads". The SDK path used by this adapter has
no approval or tool callback channel at all.

## Settings

A "use my own Codex" toggle belongs in `apps/app/src/react-app/domains/settings/pages/ai-view.tsx`.
`ollama-config.tsx` and `computer-use-config.tsx` in the same directory are the
precedent for a locally-installed runtime with a detection state.

It needs three states, because the failure modes are distinct and a single
"unavailable" would strand the user: binary not found (tell them to install
Codex), found but not signed in (tell them to run `codex login` — never our own
button), and ready. Cowork already stores no provider credential itself — the
engine's `auth.json` is the single source of truth
(`apps/server/src/redrob-auth.ts:7-19`) — and this path continues that: the
credential belongs to Codex.

## Sequencing

1. Decide A or B. Everything else depends on it.
2. Wire this adapter behind that decision for Cowork chat only, read-only sandbox.
3. Verify on a host with `codex` installed and signed in — the step this machine
   cannot do.
4. Settings UI with the three states.
5. Only then consider Claude Code, via `claude -p`, and only after confirming the
   distribution and branding conditions above with someone who can accept the
   Commercial Terms.
6. `dynamicTools` on app-server is what Office would need. Do not start there:
   it is experimental, and Office's host-owned tools are a larger problem than
   the transport.
