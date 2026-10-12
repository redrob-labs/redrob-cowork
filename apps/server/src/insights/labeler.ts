/*
 * Cowork's labels, by @redrob-labs/work-labeller's rules (mode, outcome, craft flags, agent figures,
 * kind of work and family), under Cowork's tool, id prefix and labeler version.
 */
import {
  externalIdOf as externalIdFor,
  labelSession as labelSessionFor,
  type LabeledSession,
  type LabelingApp,
  type SessionTally,
} from "@redrob-labs/work-labeller";

export { modeOf } from "@redrob-labs/work-labeller";
export type { LabeledSession, SessionTally } from "@redrob-labs/work-labeller";

export const COWORK_LABELING: LabelingApp = { toolKey: "cowork", idPrefix: "cw_", labelerId: "cowork-structural", labelerVersion: "4" };

/**
 * The id the console knows a session by, and the value of x-redrob-session on its requests. A hash,
 * so the engine's own session id never leaves the machine; the same for the recorder and the plugin.
 */
export const externalIdOf = (rootSessionID: string): string => externalIdFor(COWORK_LABELING, rootSessionID);

export const labelSession = (t: SessionTally): LabeledSession => labelSessionFor(COWORK_LABELING, t);
