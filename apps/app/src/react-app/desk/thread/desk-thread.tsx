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
  TaskStatus,
  ThreadNote,
  type ChallengeReportProps,
  type FactCheckReportProps,
} from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { useDeskComposerStore } from "../composer/composer-state";
import { useCheckStore, type AnswerChecks } from "./check-store";
import { ItemsReview, itemLabel } from "../review/review-thread";
import type { ReviewItem } from "../review/review-logic";
import { claimIds, planStepIds, type ChallengeData, type DeskBlocks, type FactCheckData, type PlanDoc, type PlanQuestionData } from "./desk-blocks";
import { useDeskThread } from "./desk-thread-context";
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
    title: t("desk.thread_fact_title"),
    label: t("desk.thread_fact_title"),
    summary: fact.summary,
    claims: fact.claims,
    missed: fact.missed,
    claimLabel: t("desk.thread_fact_claim"),
    sourcesLabel: t("desk.thread_fact_sources"),
    reasoningLabel: t("desk.thread_fact_reasoning"),
    missedLabel: t("desk.thread_fact_missed"),
    verdicts: {
      holds: ["success", t("desk.thread_verdict_holds")],
      partly: ["warning", t("desk.thread_verdict_partly")],
      wrong: ["danger", t("desk.thread_verdict_wrong")],
      closed: ["neutral", t("desk.thread_verdict_closed")],
      fixed: ["success", t("desk.thread_verdict_fixed")],
    },
  };
}

/** The Challenge as the design system's report, finished, in the app's language. */
export function challengeReportProps(challenge: ChallengeData): ChallengeReportProps {
  return {
    title: t("desk.thread_challenge_title"),
    label: t("desk.thread_challenge_title"),
    claim: challenge.claim,
    rounds: challenge.rounds,
    verdict: challenge.verdict,
    unsettled: challenge.unsettled,
    state: "done",
    claimLabel: t("desk.thread_challenge_claim"),
    forLabel: t("desk.thread_challenge_for"),
    againstLabel: t("desk.thread_challenge_against"),
    judgeLabel: t("desk.thread_challenge_judge"),
    roundLabel: t("desk.thread_challenge_round"),
    verdictLabel: t("desk.thread_challenge_verdict"),
    unsettledLabel: t("desk.thread_challenge_unsettled"),
    runningLabel: t("desk.thread_challenge_running"),
    kindLabels: {
      broke: t("desk.thread_kind_broke"),
      held: t("desk.thread_kind_held"),
      changed: t("desk.thread_kind_changed"),
    },
  };
}

/** Plan's questions; answering sends the choices as the person's reply, then folds. */
function DeskQuestions(props: { questions: PlanQuestionData[]; isLatest: boolean }) {
  const thread = useDeskThread();
  const [answered, setAnswered] = useState<PlanAnswers | null>(null);
  const done = answered !== null || !props.isLatest;
  return (
    <PlanQuestions
      questions={props.questions}
      done={done}
      summary={answered ? answersSummary(props.questions, answered) : t("desk.thread_answered_none")}
      label={t("desk.thread_questions_label")}
      submitLabel={t("desk.thread_questions_submit")}
      hint={t("desk.thread_questions_hint")}
      anyLabel={t("desk.thread_questions_any")}
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
function DeskPlan(props: { plan: PlanDoc; isLatest: boolean }) {
  const thread = useDeskThread();
  const setMode = useDeskComposerStore((state) => state.setMode);
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
        file={t("desk.thread_plan_file")}
        title={props.plan.title}
        summary={props.plan.summary}
        sections={props.plan.sections}
        todo={props.plan.todo}
        done={status === "done" ? props.plan.todo.length : undefined}
        note={props.plan.note}
        status={status}
        statusLabels={{
          draft: t("desk.thread_plan_draft"),
          edited: t("desk.thread_plan_edited"),
          running: t("desk.thread_plan_running"),
          done: t("desk.thread_plan_done"),
          kept: t("desk.thread_plan_kept"),
        }}
        label={t("desk.thread_plan_label")}
        todoLabel={t("desk.thread_plan_todo")}
        runLabel={t("desk.thread_plan_run")}
        keepLabel={t("desk.thread_plan_keep")}
        hint={t("desk.thread_plan_hint")}
        onRun={canRun ? run : undefined}
        onKeep={canRun && status === "draft" ? () => setStage("kept") : undefined}
        onEdit={() => {
          edited.current = true;
        }}
      />
    </div>
  );
}

/** A plan's steps as comment targets, in order, with their anchors. */
export function planReviewItems(plan: PlanDoc): ReviewItem[] {
  const ids = planStepIds(plan);
  return plan.todo.map((step, index) => ({ id: ids[index] ?? `idx-${index + 1}`, label: itemLabel(step.label) }));
}

/** A fact check's claims as comment targets. */
export function claimReviewItems(fact: FactCheckData): ReviewItem[] {
  const ids = claimIds(fact);
  return fact.claims.map((claim, index) => ({ id: ids[index] ?? `idx-${index + 1}`, label: itemLabel(claim.claim) }));
}

/** The blocks in an assistant answer, as the design system draws them. With `messageId`, they take comments. */
export function DeskBlocksView(props: { blocks: DeskBlocks; isLatest: boolean; messageId?: string }) {
  const thread = useDeskThread();
  const { questions, plan, check } = props.blocks;
  const reviewable = props.messageId && thread ? { sessionId: thread.sessionId, messageId: props.messageId } : null;
  return (
    <>
      {questions ? <DeskQuestions questions={questions} isLatest={props.isLatest} /> : null}
      {plan ? <DeskPlan plan={plan} isLatest={props.isLatest} /> : null}
      {plan && reviewable ? <ItemsReview {...reviewable} kind="plan-step" items={planReviewItems(plan)} /> : null}
      {check?.fact ? <FactCheckReport {...factReportProps(check.fact)} /> : null}
      {check?.fact && reviewable ? <ItemsReview {...reviewable} kind="claim" items={claimReviewItems(check.fact)} /> : null}
      {check?.challenge ? <ChallengeReport {...challengeReportProps(check.challenge)} /> : null}
    </>
  );
}

/** Under a finished answer: the receipt, then what the checks found. */
export function DeskAnswerFooter(props: { messageId: string; model?: string }) {
  const checks = useCheckStore((state) => state.answers[props.messageId]);
  const retry = useCheckStore((state) => state.retryHandler);
  const thread = useDeskThread();
  const fact = checks?.fact === "done" ? checks.result?.fact : undefined;
  return (
    <>
      <DeskAnswerFooterView checks={checks} model={props.model} onRetry={retry ? () => retry(props.messageId) : undefined} />
      {fact && thread ? (
        <ItemsReview sessionId={thread.sessionId} messageId={props.messageId} kind="claim" items={claimReviewItems(fact)} />
      ) : null}
    </>
  );
}

/** A check that failed can run again, when the cross-check is mounted and knows what was asked. */
export function canRetryChecks(checks: AnswerChecks | undefined): boolean {
  return Boolean(checks?.request) && (checks?.fact === "failed" || checks?.challenge === "failed");
}

export function DeskAnswerFooterView(props: { checks: AnswerChecks | undefined; model?: string; onRetry?: () => void }) {
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
            {t("desk.thread_check_retry")}
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

/** While a run works: what it is doing now. */
export function DeskRunStatus(props: { label: string | null }) {
  return <TaskStatus state="running" label={props.label ?? t("desk.thread_working")} />;
}

/** A note the run saved to memory. It can be removed from Memory, not from here. */
export function DeskMemoryNote(props: { text: string }) {
  return (
    <ThreadNote kind="memory" label={t("desk.thread_memory_saved")} note={t("desk.thread_memory_note")}>
      {props.text}
    </ThreadNote>
  );
}

/** A permission ask, as the design system's approval step. */
export function DeskApproval(props: { title: string; description: string; detail?: string; busy?: boolean } & ApprovalActions) {
  const idle = () => {};
  return (
    <ApprovalStep
      title={props.title}
      description={props.description}
      detail={props.detail}
      approveLabel={t("desk.thread_approve")}
      rejectLabel={t("desk.thread_reject")}
      alwaysLabel={t("desk.thread_always")}
      onApprove={props.busy ? idle : props.onApprove}
      onReject={props.busy ? idle : props.onReject}
      onAlways={props.onAlways ? (props.busy ? idle : props.onAlways) : undefined}
    />
  );
}
