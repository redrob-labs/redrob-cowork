import { icons, type AnswerReceiptItem, type PlanQuestionsProps } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { CheckResult, PlanDoc, PlanQuestionData } from "./desk-blocks";

/**
 * What the thread's actions say and send, kept pure so a test can read them: the answers to
 * Plan's questions as a reply, a plan as the prompt that runs it, the receipt under an answer,
 * the buttons on an approval, and the instruction that keeps memory out of a chat.
 */

const RECEIPT_ICON = { width: 14, height: 14, "aria-hidden": true };

/** The answers by question id, as PlanQuestions submits them. */
export type PlanAnswers = NonNullable<PlanQuestionsProps["value"]>;

function chosen(question: PlanQuestionData, value: PlanAnswers): string[] {
  const answer = value[question.id];
  const picked = Array.isArray(answer) ? answer : answer === null || answer === undefined ? [] : [answer];
  return picked.flatMap((index) => {
    const option = question.options[index];
    return option === undefined ? [] : [option];
  });
}

function sentence(text: string): string {
  return /[.!?。…]$/.test(text) ? text : `${text}.`;
}

/** The answers as the person's reply: one line per answered question, its question then its choices. */
export function answersToPrompt(questions: PlanQuestionData[], value: PlanAnswers): string {
  const lines = questions.flatMap((question) => {
    const picks = chosen(question, value);
    return picks.length ? [`${question.question} ${sentence(picks.join(", "))}`] : [];
  });
  return lines.length ? lines.join("\n") : t("desk.thread_no_preference");
}

/** The folded line once the questions are answered. */
export function answersSummary(questions: PlanQuestionData[], value: PlanAnswers): string {
  const picks = questions.flatMap((question) => chosen(question, value));
  return picks.length ? t("desk.thread_answered", { answers: picks.join(", ") }) : t("desk.thread_answered_none");
}

/** A plan as plain text, the way it goes back to the model. */
export function planToText(plan: PlanDoc): string {
  const lines: string[] = [];
  if (plan.title) lines.push(`# ${plan.title}`);
  if (plan.summary) lines.push(plan.summary);
  for (const section of plan.sections) {
    lines.push(`## ${section.heading}`);
    if (section.body) lines.push(section.body);
    (section.items ?? []).forEach((item, index) => {
      const bullet = section.ordered ? `${index + 1}.` : "-";
      const body = typeof item === "string" ? item : item.lead ? `${item.lead} ${item.text}` : item.text;
      lines.push(`${bullet} ${body}`);
    });
  }
  if (plan.todo.length) {
    lines.push(`## ${t("desk.thread_plan_todo")}`);
    for (const todo of plan.todo) lines.push(`- ${todo.label}${todo.who ? ` (${todo.who})` : ""}`);
  }
  if (plan.note) lines.push(plan.note);
  return lines.join("\n");
}

/** Run sends this, in Run mode, so the run agent gets the plan it is to follow. */
export function planRunPrompt(planText: string): string {
  return `${t("desk.thread_run_prompt")}\n\n${planText.trim()}`;
}

/** Whether a prompt is a plan being run, so its answer's receipt can say "Plan followed". */
export function isPlanRunPrompt(prompt: string): boolean {
  return prompt.trimStart().startsWith(t("desk.thread_run_prompt"));
}

export type PlanStage = "draft" | "kept" | "running" | "done";

/**
 * Where a plan stands. Run and Keep are the person's; a run that has started and is no longer
 * the latest turn, with the chat idle, is done.
 */
export function planStatus(input: { local: PlanStage; isLatest: boolean; busy: boolean }): PlanStage {
  if (input.local === "running" && !input.isLatest && !input.busy) return "done";
  return input.local;
}

export type CheckState = "off" | "running" | "done" | "failed";

export type ReceiptInput = {
  /** The model the gateway says answered, when it said. */
  model?: string;
  planned: boolean;
  fact: CheckState;
  challenge: CheckState;
  result?: CheckResult;
};

/** Claims that need a fix, and what the answer missed. */
export function factToFix(result: CheckResult | undefined): number {
  const fact = result?.fact;
  if (!fact) return 0;
  return fact.claims.filter((claim) => claim.verdict !== "holds").length + fact.missed.length;
}

/** Points where the challenge broke or changed the answer. */
export function challengeChanges(result: CheckResult | undefined): number {
  return (result?.challenge?.verdict ?? []).filter((verdict) => verdict.kind !== "held").length;
}

/**
 * The receipt under a finished answer: who answered, whether it followed a plan, and what the
 * checks found. An answer no check ran on says so: "Not checked, a quick answer".
 */
export function receiptItems(input: ReceiptInput): AnswerReceiptItem[] {
  const items: AnswerReceiptItem[] = [
    input.model
      ? { id: "model", icon: icons.sparkle(RECEIPT_ICON), label: input.model, sub: t("desk.thread_receipt_by_auto") }
      : { id: "model", icon: icons.sparkle(RECEIPT_ICON), label: t("desk.thread_receipt_auto") },
  ];
  if (input.planned) items.push({ id: "plan", icon: icons.route(RECEIPT_ICON), label: t("desk.thread_receipt_plan") });

  if (input.fact === "running") items.push({ id: "fact", busy: true, label: t("desk.thread_receipt_fact_running") });
  else if (input.fact === "done") {
    const fix = factToFix(input.result);
    items.push({
      id: "fact",
      icon: icons.scan(RECEIPT_ICON),
      tone: fix ? "differ" : "agree",
      label: fix ? t("desk.thread_receipt_fact_fix", { count: fix }) : t("desk.thread_receipt_fact_holds"),
    });
  } else if (input.fact === "failed") {
    items.push({ id: "fact", icon: icons.scan(RECEIPT_ICON), label: t("desk.thread_receipt_fact_failed") });
  }

  if (input.challenge === "running") {
    items.push({ id: "challenge", busy: true, label: t("desk.thread_receipt_challenge_running") });
  } else if (input.challenge === "done") {
    const changes = challengeChanges(input.result);
    items.push({
      id: "challenge",
      icon: icons.scales(RECEIPT_ICON),
      tone: changes ? "differ" : "agree",
      label: t("desk.thread_receipt_challenged"),
      sub: changes ? t("desk.thread_receipt_changes", { count: changes }) : t("desk.thread_receipt_held"),
    });
  } else if (input.challenge === "failed") {
    items.push({ id: "challenge", icon: icons.scales(RECEIPT_ICON), label: t("desk.thread_receipt_challenge_failed") });
  }

  if (input.fact === "off" && input.challenge === "off") {
    items.push({
      id: "unchecked",
      icon: icons.compare(RECEIPT_ICON),
      label: t("desk.thread_receipt_unchecked"),
      sub: t("desk.thread_receipt_quick"),
    });
  }
  return items;
}

export type PermissionReply = "once" | "always" | "reject";

export type ApprovalActions = {
  onApprove: () => void;
  onReject: () => void;
  onAlways?: () => void;
};

/**
 * An approval's buttons: Approve answers once and Reject rejects. Always widens permission
 * for the rest of the session, so only Developer mode offers it.
 */
export function approvalActions(
  requestId: string,
  respond: (requestId: string, reply: PermissionReply) => void,
  developerMode: boolean,
): ApprovalActions {
  const actions: ApprovalActions = {
    onApprove: () => respond(requestId, "once"),
    onReject: () => respond(requestId, "reject"),
  };
  if (developerMode) actions.onAlways = () => respond(requestId, "always");
  return actions;
}

type ToolPartLike = { type: string; toolName?: unknown; state?: unknown; input?: unknown };

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value));
  if (typeof value !== "string") return null;
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

const MEMORY_SAVE = /(^|[._:/-])postmemory$/i;

/**
 * What a finished tool call saved to memory, or null. The agent saves a note by executing the
 * `postMemory` capability with a body of `{ content }`; nothing else in a transcript says a
 * note was kept.
 */
export function memorySavedFrom(part: ToolPartLike): string | null {
  if (part.state !== "output-available" || typeof part.toolName !== "string") return null;
  if (!/(execute_capability|redrob_execute)$/.test(part.toolName)) return null;
  const input = record(part.input);
  const name = input?.name ?? input?.id;
  if (typeof name !== "string" || !MEMORY_SAVE.test(name.trim())) return null;
  const content = record(input?.body)?.content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}
