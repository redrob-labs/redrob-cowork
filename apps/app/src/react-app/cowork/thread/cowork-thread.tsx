/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ApprovalStep,
  Button,
  ChallengeReport,
  FactCheckReport,
  Loader,
  ThreadNote,
  icons,
  type ChallengeReportProps,
  type FactCheckReportProps,
} from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { cn } from "../../../lib/utils";
import { useElapsed } from "../../../lib/use-elapsed";
import { useWorkingLine } from "../../../lib/working-lines";
import { CoworkQuestionsCard } from "./cowork-questions";
import { IDLE_PLAN_ACTIVITY, planStepStates, type PlanStepState } from "./plan-progress";
import { RedrobLiquidLoader } from "../../../components/ui/redrob-liquid-loader/RedrobLiquidLoader";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { useCoworkComposerStore } from "../composer/composer-state";
import { useCheckStore, type AnswerChecks } from "./check-store";
import type { ChallengeData, CoworkBlocks, FactCheckData, PlanDoc, PlanQuestionData } from "./cowork-blocks";
import { useCoworkThread } from "./cowork-thread-context";
import {
  answersToPrompt,
  challengeOutcome,
  factConfidence,
  planRunPrompt,
  planStatus,
  planToText,
  type ApprovalActions,
  type CheckVerdict,
  type PlanStage,
} from "./thread-logic";

/** The Fact check as the design system's report, in the app's language. */
export function factReportProps(fact: FactCheckData): FactCheckReportProps {
  return {
    title: t("cowork.thread_fact_title"),
    label: t("cowork.thread_fact_title"),
    summary: fact.summary,
    claims: fact.claims,
    missed: fact.missed,
    claimLabel: t("cowork.thread_fact_claim"),
    sourcesLabel: t("cowork.thread_fact_sources"),
    reasoningLabel: t("cowork.thread_fact_reasoning"),
    missedLabel: t("cowork.thread_fact_missed"),
    verdicts: {
      holds: ["success", t("cowork.thread_verdict_holds")],
      partly: ["warning", t("cowork.thread_verdict_partly")],
      wrong: ["danger", t("cowork.thread_verdict_wrong")],
      closed: ["neutral", t("cowork.thread_verdict_closed")],
      fixed: ["success", t("cowork.thread_verdict_fixed")],
    },
  };
}

/** The Challenge as the design system's report, finished, in the app's language. */
export function challengeReportProps(challenge: ChallengeData): ChallengeReportProps {
  return {
    title: t("cowork.thread_challenge_title"),
    label: t("cowork.thread_challenge_title"),
    claim: challenge.claim,
    rounds: challenge.rounds,
    verdict: challenge.verdict,
    unsettled: challenge.unsettled,
    state: "done",
    claimLabel: t("cowork.thread_challenge_claim"),
    forLabel: t("cowork.thread_challenge_for"),
    againstLabel: t("cowork.thread_challenge_against"),
    judgeLabel: t("cowork.thread_challenge_judge"),
    roundLabel: t("cowork.thread_challenge_round"),
    verdictLabel: t("cowork.thread_challenge_verdict"),
    unsettledLabel: t("cowork.thread_challenge_unsettled"),
    runningLabel: t("cowork.thread_challenge_running"),
    kindLabels: {
      broke: t("cowork.thread_kind_broke"),
      held: t("cowork.thread_kind_held"),
      changed: t("cowork.thread_kind_changed"),
    },
  };
}

/** Plan's questions; answering sends the choices as the person's reply, then folds. */
function CoworkQuestions(props: { questions: PlanQuestionData[]; isLatest: boolean; messageId?: string }) {
  const thread = useCoworkThread();
  const [answered, setAnswered] = useState(false);
  // Round 8 (M1): done means the person ANSWERED (here, or by any reply after this message), not
  // "this is no longer the last message" - the agent often keeps writing after it asks. Without the
  // thread's state (outside a session surface), fall back to the old position rule.
  const repliedLater = props.messageId && thread?.questions ? thread.questions.answered.has(props.messageId) : !props.isLatest;
  const done = answered || repliedLater;
  // Round 7 C1: once answered (or superseded by a later turn) the questions leave the thread
  // entirely. The plan that follows is the visible result of the answers.
  if (done) return null;
  // Round 9: the app's own card (typed answers per question, "Execute"), not the DS PlanQuestions.
  return (
    <CoworkQuestionsCard
      questions={props.questions}
      disabled={!thread}
      onSubmit={(value, custom) => {
        if (!thread) return;
        setAnswered(true);
        // The send path reports its own error; the questions open again so they can be re-sent.
        thread.sendText(answersToPrompt(props.questions, value, custom)).catch(() => setAnswered(false));
      }}
    />
  );
}

/** A checklist step's marker: a ring to do, a brand ring with a dot while active, a filled tick when done. */
function StepMarker(props: { state: PlanStepState }) {
  return (
    <span className="cowork-planx__marker" data-state={props.state} aria-hidden="true">
      {props.state === "done" ? icons.check({ width: 10, height: 10, strokeWidth: 3 }) : null}
    </span>
  );
}

/**
 * Round 9: the plan inside the chat, not a bordered document. A Redrob Blue accent rail on the
 * left, a small "Research plan" label with the run's progress, the summary, then the checklist as
 * a stepper with custom circle markers: the step the run is on shimmers, finished steps tick, and
 * the rest wait. Progress is guessed from the run's activity (plan-progress.ts). The DS
 * PlanDocument it replaces drew a frame, a file header and in-place editing; none of those stay.
 */
function CoworkPlan(props: {
  plan: PlanDoc;
  isLatest: boolean;
  /** The message the plan came in, to find its run's activity. */
  messageId?: string;
  /** Whether the plan may run itself once drafted; false while open questions sit beside it. */
  autoRun: boolean;
}) {
  const thread = useCoworkThread();
  const setMode = useCoworkComposerStore((state) => state.setMode);
  const [stage, setStage] = useState<PlanStage>("draft");
  const activity = (props.messageId ? thread?.plans?.get(props.messageId) : undefined) ?? IDLE_PLAN_ACTIVITY;
  const ran = stage === "running" || activity.started;
  const status = activity.finished ? "done" : ran ? "running" : planStatus({ local: stage, isLatest: props.isLatest, busy: thread?.busy ?? false });
  const canRun = Boolean(thread) && !ran && status === "draft" && !(thread?.busy ?? false);
  const labels = props.plan.todo.map((todo) => todo.label);
  // Before the run's send lands in the transcript, the step it starts on is already active.
  const steps = planStepStates(labels, ran && !activity.started ? { ...activity, started: true } : activity);
  const doneCount = steps.filter((state) => state === "done").length;

  const run = () => {
    if (!thread) return;
    setMode(thread.sessionId, "run");
    setStage("running");
    thread.sendText(planRunPrompt(planToText(props.plan))).catch(() => setStage("draft"));
  };

  // Round 6: auto-run the plan once it is fully drafted, so a complex prompt flows plan -> execute
  // -> artifact without a manual Run click. Fires exactly once per plan: only when this is the
  // latest turn, still a draft, and the thread is idle (the plan finished streaming).
  // sawDraftingRef: the plan must belong to a chat that was live while it was open here (the
  // session went busy during this surface's life, or the plan saw the busy state itself), so
  // reopening an old chat whose last turn is an unrun plan never silently runs it; that plan shows
  // a Run button instead. Round 9: the plan view alone missed the busy state when the plan block
  // completed in the same moment the run went idle, and the plan stopped with a Run button.
  const autoRanRef = useRef(false);
  const sawDraftingRef = useRef(false);
  if (props.isLatest && (thread?.busy || thread?.liveHere)) sawDraftingRef.current = true;
  useEffect(() => {
    if (autoRanRef.current || !props.autoRun || !sawDraftingRef.current) return;
    if (!thread || thread.busy) return;
    if (!props.isLatest || stage !== "draft" || activity.started) return;
    autoRanRef.current = true;
    run();
    // run/thread are stable enough for this one-shot; deps kept minimal intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoRun, props.isLatest, stage, thread?.busy, thread?.liveHere, activity.started]);

  const progress =
    status === "done"
      ? t("cowork.thread_plan_progress_done")
      : status === "running" && labels.length > 0
        ? t("cowork.thread_plan_progress", { done: doneCount, total: labels.length })
        : null;

  return (
    <section className="cowork-planx" aria-label={t("cowork.thread_plan_research_title")} data-status={status}>
      <header className="cowork-planx__head">
        <span className="cowork-planx__label">{t("cowork.thread_plan_research_title")}</span>
        {progress ? <span className="cowork-planx__progress">{progress}</span> : null}
      </header>
      {props.plan.summary ? <p className="cowork-planx__summary">{props.plan.summary}</p> : null}
      {labels.length > 0 ? (
        <ol className="cowork-planx__steps" aria-label={t("cowork.thread_plan_todo")}>
          {props.plan.todo.map((todo, index) => {
            const state = steps[index] ?? "todo";
            return (
              <li key={index} className="cowork-planx__step" data-state={state} aria-current={state === "active" ? "step" : undefined}>
                <StepMarker state={state} />
                <span className={cn("cowork-planx__task", state === "active" && "redrob-shimmer-text")}>{todo.label}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {props.plan.note ? <p className="cowork-planx__note">{props.plan.note}</p> : null}
      {canRun ? (
        <div>
          <Button size="sm" onClick={run}>
            {t("cowork.thread_plan_run")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** The blocks in an assistant answer, as the design system draws them. */
export function CoworkBlocksView(props: { blocks: CoworkBlocks; isLatest: boolean; /** The message the blocks came in (round 8 M1). */ messageId?: string }) {
  const { questions, plan } = props.blocks;
  const thread = useCoworkThread();
  // Round 8 (M1): a plan drafted in the same turn as questions waits for the answers - it is not
  // shown and never runs; the answers produce a new plan that runs on its own.
  const held = Boolean(questions) || Boolean(props.messageId && thread?.questions?.heldPlans.has(props.messageId));
  // Fact check + Challenge no longer render inline here; they appear as verdict CHIPS in the
  // answer footer (CoworkAnswerFooterView), and their full report opens in a popover on click.
  return (
    <>
      {questions ? <CoworkQuestions questions={questions} isLatest={props.isLatest} messageId={props.messageId} /> : null}
      {plan && !held ? <CoworkPlan plan={plan} isLatest={props.isLatest} messageId={props.messageId} autoRun /> : null}
    </>
  );
}

/** Under a finished answer: the receipt, then what the checks found. */
export function CoworkAnswerFooter(props: { messageId: string; model?: string }) {
  const checks = useCheckStore((state) => state.answers[props.messageId]);
  const retry = useCheckStore((state) => state.retryHandler);
  return <CoworkAnswerFooterView checks={checks} model={props.model} onRetry={retry ? () => retry(props.messageId) : undefined} />;
}

/** A check that failed can run again, when the cross-check is mounted and knows what was asked. */
export function canRetryChecks(checks: AnswerChecks | undefined): boolean {
  return Boolean(checks?.request) && (checks?.fact === "failed" || checks?.challenge === "failed");
}

/** The tone classes for a verdict chip: agree (green), mild (amber), differ (muted/strong). */
function verdictToneClass(tone: CheckVerdict["tone"]): string {
  // Each pairs a text colour with the matching icon; backgrounds come from the chip base below.
  if (tone === "agree") return "text-[color:var(--ds-success,#1a7f52)]";
  if (tone === "mild") return "text-[color:var(--ds-warning,#9a6b00)]";
  return "text-[color:var(--ds-danger,#a1432b)]"; // differ
}

/**
 * A finished cross-check as a single CHIP: an icon, the check's name, and the one-word verdict in
 * its tone colour. Clicking opens the full report in a popover (not inline in the chat). While a
 * check is still running it shows a muted "running" chip with no popover.
 */
function CheckChip(props: {
  /** The check's name, e.g. "Fact check". */
  name: string;
  /** True while the check runs: a muted chip with a small loader and no popover. */
  running: boolean;
  /** The one-word verdict and its tone, once the check is done. */
  verdict: CheckVerdict | null;
  /** The full report the chip's popover shows, once the check is done. */
  report: ReactNode | null;
}) {
  // Base chip styling shared by the running and finished states (pill, border, hover).
  const chipBase =
    "inline-flex items-center gap-1.5 rounded-full border border-dls-border bg-dls-surface px-3 py-1 text-xs";
  if (props.running || !props.verdict || !props.report) {
    return (
      <span className={`${chipBase} text-dls-text-muted`}>
        {/* Small inline loader on the LEFT while the check runs, so the chip reads as in-progress.
            Item 6: the simple DS three-bar Loader (not the morphing liquid loader); live=false
            because several chips can run at once and each announcing itself would be noise. */}
        {props.running ? <Loader size="sm" tone="neutral" label={props.name} live={false} /> : null}
        <span>{props.name}</span>
      </span>
    );
  }
  return (
    <Popover>
      {/* The chip is the trigger; clicking opens the report popover, so no inline report is drawn. */}
      <PopoverTrigger className={`${chipBase} cursor-pointer text-dls-text transition-colors hover:bg-dls-surface-hover`}>
        <span>{props.name}</span>
        {/* The verdict word, coloured by tone - this is the "result in the chip itself". */}
        <span className={verdictToneClass(props.verdict.tone)}>{props.verdict.label}</span>
      </PopoverTrigger>
      {/* The full report, wide enough for the claims list / debate, scrollable if long. */}
      <PopoverContent className="max-h-[70vh] w-[min(32rem,90vw)] overflow-y-auto p-3">
        {props.report}
      </PopoverContent>
    </Popover>
  );
}

export function CoworkAnswerFooterView(props: { checks: AnswerChecks | undefined; model?: string; onRetry?: () => void }) {
  const { checks } = props;
  const result = checks?.result;
  const factState = checks?.fact ?? "off";
  const challengeState = checks?.challenge ?? "off";
  const showFact = factState === "running" || (factState === "done" && Boolean(result?.fact));
  const showChallenge = challengeState === "running" || (challengeState === "done" && Boolean(result?.challenge));
  // The model chip ("Redrob Auto") is intentionally dropped from the receipt row per round 5, and
  // round 8 drops the "Plan followed" chip too: only the checks' verdicts remain.
  return (
    <div className="flex w-full flex-col gap-3">
      {showFact || showChallenge ? (
        <div className="flex flex-wrap items-center gap-2">
          {showFact ? (
            <CheckChip
              name={t("cowork.thread_fact_title")}
              running={factState === "running"}
              verdict={factState === "done" && result?.fact ? factConfidence(result.fact) : null}
              report={factState === "done" && result?.fact ? <FactCheckReport {...factReportProps(result.fact)} /> : null}
            />
          ) : null}
          {showChallenge ? (
            <CheckChip
              name={t("cowork.thread_challenge_title")}
              running={challengeState === "running"}
              verdict={challengeState === "done" && result?.challenge ? challengeOutcome(result.challenge) : null}
              report={
                challengeState === "done" && result?.challenge ? (
                  <ChallengeReport {...challengeReportProps(result.challenge)} />
                ) : null
              }
            />
          ) : null}
        </div>
      ) : null}
      {props.onRetry && canRetryChecks(checks) ? (
        <div>
          <Button size="sm" variant="ghost" onClick={props.onRetry}>
            {t("cowork.thread_check_retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * While a run works and no inline activity row is up yet: what it is doing now. The liquid loader
 * (or a globe for a web step) beside a grey shimmering label, and the time since the run started.
 */
export function CoworkRunStatus(props: {
  label: string | null;
  /** A web search or page read is in flight: a static globe stands in for the loader. */
  web?: boolean;
  /** When the run started (ms, the user message's server time), so the timer matches the inline row's. */
  startedAt?: number | null;
}) {
  // With no specific step to show, a friendly line rotates (fades in each time).
  const working = useWorkingLine(props.label === null);
  const label = props.label ?? working.text;
  const elapsed = useElapsed(true, props.startedAt);
  return (
    <div className="flex items-center gap-2 py-1">
      {props.web ? (
        /* Reading or searching the web shows a static globe, like the web research rows. */
        <span className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
          {icons.globe({ width: 16, height: 16 })}
        </span>
      ) : (
        /* Inline loader, a touch larger than before so it reads clearly beside the text. */
        <RedrobLiquidLoader size={32} label={label} />
      )}
      {/* Grey label with a sweeping shimmer, at the chat body size. */}
      <span
        key={props.label === null ? `working-${working.index}` : "label"}
        className={cn("redrob-shimmer-text text-sm", props.label === null && "cowork-working-line")}
      >
        {label}
      </span>
      {/* Elapsed time as '34s' / '1m 23s', tabular so the digits do not jitter as they tick. */}
      <span className="text-xs tabular-nums text-muted-foreground/70">{elapsed}</span>
    </div>
  );
}

/** A note the run saved to memory. It can be removed from Memory, not from here. */
export function CoworkMemoryNote(props: { text: string }) {
  return (
    <ThreadNote kind="memory" label={t("cowork.thread_memory_saved")} note={t("cowork.thread_memory_note")}>
      {props.text}
    </ThreadNote>
  );
}

/** A permission ask, as the design system's approval step. */
export function CoworkApproval(props: { title: string; description: string; detail?: string; busy?: boolean } & ApprovalActions) {
  const idle = () => {};
  return (
    <ApprovalStep
      title={props.title}
      description={props.description}
      detail={props.detail}
      approveLabel={t("cowork.thread_approve")}
      rejectLabel={t("cowork.thread_reject")}
      alwaysLabel={t("cowork.thread_always")}
      onApprove={props.busy ? idle : props.onApprove}
      onReject={props.busy ? idle : props.onReject}
      onAlways={props.onAlways ? (props.busy ? idle : props.onAlways) : undefined}
    />
  );
}
