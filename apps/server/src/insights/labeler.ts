/*
 * Structural labels for one finished session: mode, outcome, craft flags that can be seen without
 * reading anything, and the agent figures. Pure, so every rule is a test away.
 *
 * The family of work (writing, a sheet, code, design) comes from the work classifier, which reads the
 * first message on this machine (work-classifier.ts); only the family is kept. What it cannot tell
 * yet is left out: the kind of work within a family, whether the first message said what done looks
 * like, and whether a session without a file was a draft or an answer. So a session that only wrote
 * text in the chat is labeled as an answer (Look up or Learn), which undercounts drafts; it never
 * overcounts them.
 */
import { createHash } from "node:crypto";

import type { WorkFamily } from "./work-classifier.js";

export const LABELER_ID = "cowork-structural";
export const LABELER_VERSION = "3";

/** What the recorder accumulated for a session and every subagent session under it. */
export type SessionTally = {
  rootSessionID: string;
  startedAt: number;
  lastActivityAt: number;
  userTurns: number;
  /** The first message attached a file or pointed at one. */
  firstAttachedSource: boolean;
  assistantMessages: number;
  toolCalls: number;
  artifacts: number;
  checks: number;
  sends: number;
  delegations: number;
  /** Most delegated subagents running at the same moment. */
  peakConcurrentAgents: number;
  /** Minutes subagents spent running, all added up. */
  subagentMinutes: number;
  /** Minutes the root agent spent running. */
  busyMinutes: number;
  /** Minutes between an answer and the person's next message, each gap capped. */
  attentionMinutes: number;
  permissionsAsked: number;
  permissionsAlways: number;
  aborted: number;
  /** A message from the person within two messages after an abort: the run was redirected. */
  redirected: number;
  /** Sends to the model that carried something sensitive, from the privacy gate. */
  sensitiveSends: number;
  /** Of those, sends where something sensitive went out unmasked at the chat's level. */
  unmaskedSends: number;
  /** The work classifier's family for the first message; absent when it named none or did not run. */
  family?: WorkFamily | null;
};

export type LabeledSession = {
  externalId: string;
  startedAt: string;
  toolKey: "cowork";
  mode: number;
  producedOutput: boolean;
  brief: boolean;
  context: boolean;
  checked: boolean;
  steerApplicable: boolean;
  steered: boolean;
  outward: boolean;
  sensitiveTouched: boolean;
  sensitiveOk: boolean;
  turns: number;
  familyKey?: WorkFamily;
  agent?: {
    actions: number;
    instructions: number;
    agentMinutes: number;
    attentionMinutes: number;
    autoApproved: boolean;
    interrupted: boolean;
    agentsAtOnce: number;
    humanEquivHours: number;
  };
  labelerId: string;
  labelerVersion: string;
};

/**
 * The id the console knows a session by, and the value of x-redrob-session on its requests. A hash,
 * so the engine's own session id never leaves the machine; the same for the recorder and the plugin.
 */
export function externalIdOf(rootSessionID: string): string {
  return `cw_${createHash("sha256").update(rootSessionID).digest("hex").slice(0, 32)}`;
}

/** Tool calls per message from the person above which the agent did the work, not the person. */
const DELEGATED_STEPS_PER_TURN = 6;

/**
 * The mode, by Crew's definitions:
 *   5 Orchestrate: two or more agents at once.
 *   4 Delegate: one agent did the whole task, either a delegated subagent or the agent taking many
 *     steps on its own for each message, ending in something produced.
 *   3 Iterate: something produced over three or more messages.
 *   2 Draft: something produced in one or two messages.
 *   1 Learn: nothing produced, but a back and forth.
 *   0 Look up: one question, nothing produced.
 */
export function modeOf(t: SessionTally): number {
  const produced = t.artifacts > 0 || t.sends > 0;
  if (t.peakConcurrentAgents >= 2) return 5;
  const autonomous = produced && t.userTurns > 0 && t.toolCalls / t.userTurns >= DELEGATED_STEPS_PER_TURN;
  if ((t.delegations > 0 && produced) || autonomous) return 4;
  if (produced) return t.userTurns >= 3 ? 3 : 2;
  return t.userTurns >= 2 ? 1 : 0;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function labelSession(t: SessionTally): LabeledSession {
  const mode = modeOf(t);
  const producedOutput = t.artifacts > 0 || t.sends > 0;
  const agent = mode >= 4;
  return {
    externalId: externalIdOf(t.rootSessionID),
    startedAt: new Date(t.startedAt).toISOString().replace(/\.\d+Z$/, "Z"),
    toolKey: "cowork",
    mode,
    producedOutput,
    // Needs the classifier, which reads the first message on this machine.
    brief: false,
    context: t.firstAttachedSource,
    checked: t.checks > 0,
    steerApplicable: t.aborted > 0 || (mode >= 3 && t.userTurns >= 3),
    steered: t.redirected > 0,
    outward: t.sends > 0,
    sensitiveTouched: t.sensitiveSends > 0,
    sensitiveOk: t.sensitiveSends > 0 && t.unmaskedSends === 0,
    turns: t.userTurns,
    ...(t.family ? { familyKey: t.family } : {}),
    ...(agent
      ? {
          agent: {
            actions: t.toolCalls,
            instructions: Math.max(1, t.userTurns),
            agentMinutes: round2(Math.min(100_000, t.subagentMinutes + t.busyMinutes)),
            attentionMinutes: round2(Math.min(100_000, t.attentionMinutes)),
            autoApproved: t.permissionsAsked === 0 || t.permissionsAlways > 0,
            interrupted: t.aborted > 0,
            agentsAtOnce: Math.min(64, Math.max(1, t.peakConcurrentAgents)),
            // Crew's "work done by agents" needs the kind of work's baseline; the console estimates it.
            humanEquivHours: 0,
          },
        }
      : {}),
    labelerId: LABELER_ID,
    labelerVersion: LABELER_VERSION,
  };
}
