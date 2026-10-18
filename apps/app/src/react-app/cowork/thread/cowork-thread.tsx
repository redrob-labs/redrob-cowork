/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ApprovalStep,
  Button,
  ChallengeReport,
  FactCheckReport,
  PlanDocument,
  PlanQuestions,
  ThreadNote,
  type ChallengeReportProps,
  type FactCheckReportProps,
} from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { RedrobLiquidLoader } from "../../../components/ui/redrob-liquid-loader/RedrobLiquidLoader";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { useCoworkComposerStore } from "../composer/composer-state";
import { useCheckStore, type AnswerChecks } from "./check-store";
import type { ChallengeData, CoworkBlocks, FactCheckData, PlanDoc, PlanQuestionData } from "./cowork-blocks";
import { useCoworkThread } from "./cowork-thread-context";
import {
  answersSummary,
  answersToPrompt,
  challengeOutcome,
  factConfidence,
  planRunPrompt,
  planStatus,
  planToText,
  type ApprovalActions,
  type CheckVerdict,
  type PlanAnswers,
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
function CoworkQuestions(props: { questions: PlanQuestionData[]; isLatest: boolean }) {
  const thread = useCoworkThread();
  const [answered, setAnswered] = useState<PlanAnswers | null>(null);
  const done = answered !== null || !props.isLatest;
  return (
    <PlanQuestions
      questions={props.questions}
      done={done}
      summary={answered ? answersSummary(props.questions, answered) : t("cowork.thread_answered_none")}
      label={t("cowork.thread_questions_label")}
      submitLabel={t("cowork.thread_questions_submit")}
      hint={t("cowork.thread_questions_hint")}
      anyLabel={t("cowork.thread_questions_any")}
      onSubmit={(value) => {
        if (!thread) return;
        setAnswered(value);
        // The send path reports its own error; the questions open again so they can be re-sent.
        thread.sendText(answersToPrompt(props.questions, value)).catch(() => setAnswered(null));
      }}
    />
  );
}

/** The plan as the person changed it in place: the document without its header and buttons. */
function editedPlanText(root: HTMLElement | null): string | null {
  const article = root?.querySelector("article");
  if (!article) return null;
  const copy = article.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return null;
  copy.querySelectorAll("header, footer").forEach((node) => node.remove());
  const text = (copy.innerText || copy.textContent || "").trim();
  return text || null;
}

/** The plan: Run sends it to the run agent and switches the chat to Run; Keep keeps it here. */
function CoworkPlan(props: {
  plan: PlanDoc;
  isLatest: boolean;
  /** Whether the plan may run itself once drafted; false while open questions sit beside it. */
  autoRun: boolean;
}) {
  const thread = useCoworkThread();
  const setMode = useCoworkComposerStore((state) => state.setMode);
  const [stage, setStage] = useState<PlanStage>("draft");
  const edited = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const status = planStatus({ local: stage, isLatest: props.isLatest, busy: thread?.busy ?? false });
  const canRun = Boolean(thread) && (status === "draft" || status === "kept");

  const run = () => {
    if (!thread) return;
    const text = (edited.current ? editedPlanText(root.current) : null) ?? planToText(props.plan);
    setMode(thread.sessionId, "run");
    setStage("running");
    thread.sendText(planRunPrompt(text)).catch(() => setStage("draft"));
  };

  // Round 6: auto-run the plan once it is fully drafted, so a complex prompt flows plan -> execute
  // -> artifact without a manual Run click (Felix: "run till execution is complete automatically").
  // Fires exactly once per plan: only when this is the latest turn, still a draft, the thread is
  // idle (the plan finished streaming), and the user has not edited it (an edit means they want to
  // review first). autoRanRef guards against a second fire on re-render.
  // sawDraftingRef: the plan must have been drafted WHILE this view was mounted (the thread was
  // busy with it as the latest turn). Without it, reopening an old chat whose last turn is an
  // unrun or kept plan (Keep is local state, lost on remount) would silently run that plan.
  const autoRanRef = useRef(false);
  const sawDraftingRef = useRef(false);
  if (props.isLatest && thread?.busy) sawDraftingRef.current = true;
  useEffect(() => {
    if (autoRanRef.current || !props.autoRun || !sawDraftingRef.current) return;
    if (!thread || thread.busy) return;
    if (!props.isLatest || stage !== "draft" || edited.current) return;
    autoRanRef.current = true;
    run();
    // run/thread are stable enough for this one-shot; deps kept minimal intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoRun, props.isLatest, stage, thread?.busy]);

  return (
    <div ref={root}>
      <PlanDocument
        file={t("cowork.thread_plan_file")}
        title={props.plan.title}
        summary={props.plan.summary}
        sections={props.plan.sections}
        todo={props.plan.todo}
        done={status === "done" ? props.plan.todo.length : undefined}
        note={props.plan.note}
        status={status}
        statusLabels={{
          draft: t("cowork.thread_plan_draft"),
          edited: t("cowork.thread_plan_edited"),
          running: t("cowork.thread_plan_running"),
          done: t("cowork.thread_plan_done"),
          kept: t("cowork.thread_plan_kept"),
        }}
        label={t("cowork.thread_plan_label")}
        todoLabel={t("cowork.thread_plan_todo")}
        runLabel={t("cowork.thread_plan_run")}
        keepLabel={t("cowork.thread_plan_keep")}
        hint={t("cowork.thread_plan_hint")}
        onRun={canRun ? run : undefined}
        onKeep={canRun && status === "draft" ? () => setStage("kept") : undefined}
        onEdit={() => {
          edited.current = true;
        }}
      />
    </div>
  );
}

/** The blocks in an assistant answer, as the design system draws them. */
export function CoworkBlocksView(props: { blocks: CoworkBlocks; isLatest: boolean }) {
  const { questions, plan } = props.blocks;
  // Fact check + Challenge no longer render inline here; they appear as verdict CHIPS in the
  // answer footer (CoworkAnswerFooterView), and their full report opens in a popover on click.
  return (
    <>
      {questions ? <CoworkQuestions questions={questions} isLatest={props.isLatest} /> : null}
      {/* A plan with unanswered questions beside it waits for the answers instead of auto-running. */}
      {plan ? <CoworkPlan plan={plan} isLatest={props.isLatest} autoRun={!questions} /> : null}
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
  /** Optional leading glyph; the chips currently stay textual (the report carries the icon). */
  icon?: ReactNode;
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
        {/* Small inline loader on the LEFT while the check runs, so the chip reads as in-progress. */}
        {props.running ? <RedrobLiquidLoader size={14} label={props.name} /> : props.icon}
        <span>{props.name}</span>
      </span>
    );
  }
  return (
    <Popover>
      {/* The chip is the trigger; clicking opens the report popover, so no inline report is drawn. */}
      <PopoverTrigger className={`${chipBase} cursor-pointer text-dls-text transition-colors hover:bg-dls-surface-hover`}>
        {props.icon}
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
  // The model chip ("Redrob Auto") is intentionally dropped from the receipt row per round 5.
  return (
    <div className="flex w-full flex-col gap-3">
      {checks?.planned || showFact || showChallenge ? (
        <div className="flex flex-wrap items-center gap-2">
          {checks?.planned ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-dls-border bg-dls-surface px-3 py-1 text-xs text-dls-text-muted">
              {t("cowork.thread_receipt_plan")}
            </span>
          ) : null}
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
 * While a run works: what it is doing now. The Cowork frame's "assistant is thinking" moment.
 * It carries the Redrob Liquid Loader at a small inline size beside a label that is slightly
 * smaller than the chat text and grey (Claude-like), with a ChatGPT-style colour-sweep shimmer
 * over the text, and a mm:ss elapsed timer on the right counting since the run row appeared.
 */
export function CoworkRunStatus(props: { label: string | null }) {
  const label = props.label ?? t("cowork.thread_working");
  const elapsed = useElapsedClock();
  return (
    <div className="flex items-center gap-2 py-1">
      {/* Inline loader, a touch larger than before so it reads clearly beside the text. */}
      <RedrobLiquidLoader size={32} label={label} />
      {/* Grey label with a sweeping shimmer, at the chat body size. */}
      <span className="redrob-shimmer-text text-sm">{label}</span>
      {/* Elapsed time as '34s' / '1m 23s', tabular so the digits do not jitter as they tick. */}
      <span className="text-xs tabular-nums text-muted-foreground/70">{elapsed}</span>
    </div>
  );
}

/** Elapsed time since this hook first mounted, formatted '34s' or '1m 23s', ticking once a second. */
function useElapsedClock(): string {
  const startRef = useRef<number>(Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const totalSeconds = Math.max(0, Math.floor((now - startRef.current) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Under a minute: just seconds ("34s"). A minute or more: "1m 23s".
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
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
