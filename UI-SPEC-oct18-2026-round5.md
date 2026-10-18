# Redrob Cowork - UI/UX refresh round 5 (2026-10-18)

Branch: `uiux-refresh-oct-18-2026` (local). Frontend UI/UX only (`apps/app/src`). Never touch
backend/engine/infra. No em/en dashes - short hyphens only.

## Felix's three asks

### A. Cross-check chips (fact / challenge) + drop the model chip
- Remove the "Redrob Auto" model chip from the answer receipt row.
- Fact check + Challenged: do NOT render their detail report inline in the chat. Instead:
  - the CHIP shows a verdict word computed from the result (e.g. Fact check -> "Highly confident"
    / "Mostly correct" / "Low confidence"; Challenge -> a word for how the conclusion held);
  - clicking the chip opens the full report as a POPUP (popover/modal), not inline.

GROUNDING (all frontend, data already present):
- `receiptItems()` (thread-logic.ts) builds the chip row; `factToFix()` counts non-"holds" claims +
  missed; `challengeChanges()` counts verdicts whose kind !== "held".
- Detail reports are `FactCheckReport` / `ChallengeReport` (from @redrob-labs/ui), rendered inline
  by `CoworkAnswerFooterView` and `CoworkBlocksView`.
- Verdict raw material: fact has `claims[].verdict` ("holds" | ...) + `missed[]`; challenge has
  `verdict[].kind` ("broke" | "held" | "changed").
- PLAN: compute a confidence band from fact (ratio of holds to total claims) and a held/changed/
  broke summary from challenge. Copy to confirm with Felix (see questions).

### B. Simple vs complex mode: plan in chat, result as an artifact (Claude-style)
RESOLVED - FULLY FRONTEND (Felix was right; no server changes). The app ALREADY does the two
calls Felix described:
- Two client-selected agents exist: `COWORK_PLAN_AGENT="redrob-plan"`, `COWORK_RUN_AGENT=
  "redrob-run"`, chosen by a composer `ChatMode = "plan" | "run"` toggle (mode_plan / mode_run).
  `agentForMode()` maps mode -> agent name on the CLIENT; no server edit.
- Plan mode -> model emits a `<redrob-plan>` block -> `CoworkPlan` renders it in chat with a Run
  button -> Run calls `thread.sendText(planRunPrompt(text))`, a SECOND client call to the run
  agent. That is exactly "call 1 = plan, call 2 = ingest + execute", already wired via the
  client-side `thread.sendText`.
- The run prompt is a FRONTEND i18n string: `cowork.thread_run_prompt = "Run this plan."` -
  editable without touching the server to also ask for the deliverable to be written to a file (so
  it becomes a collectible artifact).
- Artifacts are derived from messages (`deriveOpenTargets` / `resolveArtifacts` ->
  `transcriptArtifactTargets`) and listed in the panel Artifacts tab; `openPanel("artifacts")`
  opens the panel on that tab. All client.

FRONTEND BUILD (no server):
- Keep reasoning/comments + the plan in the main chat (already there).
- When a plan's Run produces an artifact, AUTO-OPEN the right panel on Artifacts and surface it.
- Strengthen the `thread_run_prompt` string so the run writes its final output as a file artifact
  (frontend string only), so the result lands in the panel like Claude.
- The session Artifacts tab already shows ALL artifacts for the chat.

### C. Replace the storm avatar with the globe-32 asset
- New asset: `C:\Users\felix\Downloads\secure-connection-globe32\secure-connection-globe32\`.
- SAME packaging as current: a `secure-connection-avatar.js` custom element, same `<secure-
  connection-avatar>` tag. DESIGNED FOR 32px (660 larger grains, particles within 326/768 radius -
  leaves mask room, so it also fixes the clipping/gap issue).
- Drop-in: replace the vendored `.js`, re-apply the `redrob-always-animate` reduced-motion patch,
  keep the wrapper. Pure asset swap.

## Build order (small commits, each gated)
1. C (avatar swap) - lowest risk, self-contained.
2. A (chips verdict + popover, drop model chip) - frontend-only, data present.
3. B (frontend slice: auto-open artifact panel) - after confirming scope with Felix.

## Gates (every commit)
tsc 0; bun fail-set == baseline (2 pre-existing); i18n/brand/syntax 0; vite build 0. No dashes.
