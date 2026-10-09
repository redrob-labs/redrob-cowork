/*
 * Cowork's session recorder: @redrob-labs/work-labeller's, labeling under Cowork's tool. A subagent's
 * facts fold into the session that started it, so a run that started three subagents is one
 * orchestrated session, not four.
 */
import { SessionRecorder, type LabeledSession } from "@redrob-labs/work-labeller";

import { COWORK_LABELING } from "./labeler.js";

export class InsightsRecorder extends SessionRecorder {
  constructor(onFinished: (session: LabeledSession) => void | Promise<void>, closeAfterMs?: number) {
    super(COWORK_LABELING, onFinished, closeAfterMs);
  }
}
