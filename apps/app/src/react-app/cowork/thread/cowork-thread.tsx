/** @jsxImportSource react */
import { useRef, useState } from "react";
import {
  AnswerReceipt,
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
import { useCoworkComposerStore } from "../composer/composer-state";
import { useCheckStore, type AnswerChecks } from "./check-store";
import type { ChallengeData, CoworkBlocks, FactCheckData, PlanDoc, PlanQuestionData } from "./cowork-blocks";
import { useCoworkThread } from "./cowork-thread-context";
import {
  answersSummary,
  answersToPrompt,
  planRunPrompt,
  planStatus,
  planToText,
  receiptItems,
  type ApprovalActions,
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
function CoworkPlan(props: { plan: PlanDoc; isLatest: boolean }) {
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
  const { questions, plan, check } = props.blocks;
  return (
    <>
      {questions ? <CoworkQuestions questions={questions} isLatest={props.isLatest} /> : null}
      {plan ? <CoworkPlan plan={plan} isLatest={props.isLatest} /> : null}
      {check?.fact ? <FactCheckReport {...factReportProps(check.fact)} /> : null}
      {check?.challenge ? <ChallengeReport {...challengeReportProps(check.challenge)} /> : null}
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

export function CoworkAnswerFooterView(props: { checks: AnswerChecks | undefined; model?: string; onRetry?: () => void }) {
  const { checks } = props;
  const result = checks?.result;
  return (
    <div className="flex w-full flex-col gap-3">
      <AnswerReceipt
        items={receiptItems({
          model: props.model,
          planned: checks?.planned ?? false,
          fact: checks?.fact ?? "off",
          challenge: checks?.challenge ?? "off",
          result,
        })}
      />
      {props.onRetry && canRetryChecks(checks) ? (
        <div>
          <Button size="sm" variant="ghost" onClick={props.onRetry}>
            {t("cowork.thread_check_retry")}
          </Button>
        </div>
      ) : null}
      {checks?.fact === "done" && result?.fact ? <FactCheckReport {...factReportProps(result.fact)} /> : null}
      {checks?.challenge === "done" && result?.challenge ? (
        <ChallengeReport {...challengeReportProps(result.challenge)} />
      ) : null}
    </div>
  );
}

/**
 * While a run works: what it is doing now. This is the Cowork frame's "assistant is thinking"
 * moment, so it carries the Redrob Liquid Loader (the brand mark melting through its three raked
 * bars) rather than the DS three-bar TaskStatus. Rendered at the brand's 96px animated-symbol
 * minimum with the live action label beside it. The loader follows reduced motion and pauses
 * while the document is hidden on its own.
 */
export function CoworkRunStatus(props: { label: string | null }) {
  const label = props.label ?? t("cowork.thread_working");
  return (
    <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
      <RedrobLiquidLoader size={96} label={label} />
      <span>{label}</span>
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
