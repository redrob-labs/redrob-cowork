/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { AgentTimeline, ApprovalStep, Button, EmptyState, TaskStatus } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { Playbook } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { useFrameStore } from "../store/frame-store";
import type { DeskTimers } from "../timers";
import { PreviewPage, PreviewState } from "./preview-note";
import {
  RUN_START,
  playRun,
  previewKey,
  runStatus,
  runSteps,
  stepState,
  usePreviewServices,
  type RunProgress,
} from "./preview";

/**
 * A sample run of one playbook: its steps tick over at the prototype's pace, stop at the
 * step that asks first, and finish. It calls no chat and sends nothing.
 */
export function RunPlayer(props: { playbook: Playbook; timers?: DeskTimers }) {
  const showToast = useFrameStore((state) => state.showToast);
  const steps = useMemo(() => runSteps(props.playbook), [props.playbook]);
  const [progress, setProgress] = useState<RunProgress>(RUN_START);
  // A new round restarts the timers from `from`: on Approve, and on Run again.
  const [round, setRound] = useState({ from: 0, count: 0 });

  useEffect(() => playRun(steps, round.from, setProgress, { timers: props.timers }), [steps, round, props.timers]);

  const playFrom = (from: number) => {
    setProgress({ done: from, phase: "running" });
    setRound((previous) => ({ from, count: previous.count + 1 }));
  };
  const approve = () => {
    playFrom(progress.done + 1);
    showToast(t("desk.preview_run_approved"), t("desk.preview_toast_text"));
  };
  const reject = () => {
    setProgress({ done: progress.done, phase: "stopped" });
    showToast(t("desk.preview_run_rejected"), t("desk.preview_toast_text"));
  };
  const status = runStatus(progress);
  const finished = progress.phase === "done" || progress.phase === "stopped";

  return (
    <>
      <div className="desk-preview__status">
        <TaskStatus state={status.state} label={status.label} />
        {finished ? (
          <Button size="sm" variant="secondary" onClick={() => playFrom(0)}>
            {t("desk.preview_run_again")}
          </Button>
        ) : null}
      </div>
      <AgentTimeline
        label={props.playbook.name}
        steps={steps.map((step, index) => ({
          id: step.id,
          label: step.label,
          detail: step.detail,
          state: stepState(index, progress),
          children:
            step.approval && progress.phase === "waiting" && index === progress.done ? (
              <ApprovalStep
                title={step.approval}
                description={t("desk.preview_run_approval_text")}
                approveLabel={t("desk.preview_approve")}
                rejectLabel={t("desk.preview_reject")}
                onApprove={approve}
                onReject={reject}
              />
            ) : undefined,
        }))}
      />
    </>
  );
}

/** `/run?playbook=<id>`: a sample run, the first playbook when none is named. */
export function RunScreen() {
  const [params] = useSearchParams();
  const { services, scope } = usePreviewServices();
  const query = useQuery({ queryKey: previewKey(scope, "playbooks"), queryFn: () => services.playbooks.list(), staleTime: Infinity });
  const list = query.data?.data;
  const playbook = list?.find((entry) => entry.id === params.get("playbook")) ?? list?.[0];

  return (
    <DeskShell current="playbooks" title={playbook?.name ?? t("desk.screen_run")} meta={playbook ? t("desk.screen_run") : undefined}>
      <PreviewPage note={t("desk.preview_run_note")}>
        <PreviewState query={query}>
          {() =>
            playbook ? (
              <RunPlayer key={playbook.id} playbook={playbook} />
            ) : (
              <EmptyState title={t("desk.preview_not_found_title")} description={t("desk.preview_not_found_text")} />
            )
          }
        </PreviewState>
      </PreviewPage>
    </DeskShell>
  );
}
