/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, EmptyState, Playbook as PlaybookSteps, SchedulePicker, SectionMark, icons, type ScheduleValue } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { openExternal } from "../connectors/desk-connectors";
import type { Playbook } from "../services/types";
import { Row } from "../settings/desk-settings";
import { DeskDialog } from "../shell/desk-dialog";
import { DeskShell } from "../shell/desk-shell";
import { useDeskConnection } from "../shell/desk-connection";
import { useFrameStore } from "../store/frame-store";
import { useDeskStartStore, type PendingDeskChat } from "../playbooks/start-chat";
import { PreviewPage, PreviewState } from "./preview-note";
import {
  formatDay,
  initialScheduleValue,
  previewKey,
  projectForPlaybook,
  runPath,
  saveSchedule,
  scheduleFromPicker,
  usePreviewServices,
} from "./preview";

const ICON = { width: 14, height: 14, "aria-hidden": true };

export type PlaybookViewProps = {
  playbook: Playbook;
  locale: string;
  onRun: () => void;
  onOpenLink: (url: string) => void;
};

/** What a playbook is worth and where that figure comes from, what it does, and its steps. */
export function PlaybookView(props: PlaybookViewProps) {
  const { playbook } = props;
  return (
    <>
      <Link className="desk-settings__action" to="/playbooks">
        {icons.arrowLeft(ICON)}
        {t("desk.nav_playbooks")}
      </Link>
      {playbook.impact.figure || playbook.stake ? (
        <div className="desk-preview__worth">
          {playbook.impact.figure ? (
            <p className="desk-preview__impact">
              <b>{playbook.impact.figure}</b>
              <span>{playbook.impact.label}</span>
            </p>
          ) : null}
          <p className="desk-settings__description">
            {playbook.highStakes ? (
              <Badge tone="brand" size="sm">
                {t("desk.preview_high_impact")}
              </Badge>
            ) : null}{" "}
            {playbook.stake}
          </p>
        </div>
      ) : null}
      {/* A playbook saved in Desk carries only what it does; the rest shows when there is something to say. */}
      <div className="desk-settings__rows">
        {playbook.summary ? <Row title={t("desk.preview_does")} description={playbook.summary} /> : null}
        {playbook.gets ? <Row title={t("desk.preview_gets")} description={playbook.gets} /> : null}
        {playbook.needs ? <Row title={t("desk.preview_needs")} description={playbook.needs} /> : null}
      </div>
      {playbook.sources.length ? (
        <section className="desk-settings__group">
          <SectionMark label={t("desk.preview_sources")} as="heading" level={2} />
          <ul className="desk-preview__sources">
            {playbook.sources.map((source) => (
              <li key={source.url}>
                <a
                  className="desk-settings__action"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    props.onOpenLink(source.url);
                  }}
                >
                  {source.label}
                  {icons.external({ width: 12, height: 12, "aria-hidden": true })}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <PlaybookSteps
        name={t("desk.preview_steps")}
        purpose={playbook.purpose}
        steps={playbook.steps.map((step, index) => ({
          id: index,
          label: step.label,
          detail: step.detail,
          approval: Boolean(step.approval),
          approvalLabel: step.approval,
        }))}
        owner={playbook.owner || undefined}
        runs={playbook.runCount ? t("desk.preview_runs", { count: playbook.runCount }) : undefined}
        lastRun={playbook.lastRunAt ? formatDay(playbook.lastRunAt, props.locale) : undefined}
        runLabel={t("desk.preview_run_now")}
        onRun={props.onRun}
      />
    </>
  );
}

/** Schedule a playbook. Saving changes only the sample schedules. */
export function ScheduleDialog(props: { open: boolean; playbook: Playbook; onClose: () => void; now?: Date }) {
  const { services, scope } = usePreviewServices();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const [now] = useState(() => props.now ?? new Date());
  const [value, setValue] = useState<ScheduleValue>(() => initialScheduleValue(props.playbook, now));
  const project = projectForPlaybook(props.playbook.id);

  const save = async () => {
    if (!project) return;
    await saveSchedule(
      { schedules: services.schedules, queryClient, scope, showToast },
      scheduleFromPicker(props.playbook.id, project, value, now),
    );
    props.onClose();
  };

  return (
    <DeskDialog
      open={props.open}
      title={t("desk.preview_schedule_title", { name: props.playbook.name })}
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("desk.preview_cancel")}
          </Button>
          <Button variant="primary" disabled={!project} onClick={() => void save()}>
            {t("desk.preview_schedule_save")}
          </Button>
        </>
      }
    >
      <SchedulePicker
        value={value}
        onChange={setValue}
        now={now}
        where={project?.name}
        weekStart={1}
        label={t("desk.preview_schedule_label")}
        modes={[
          ["once", t("desk.preview_schedule_mode_once")],
          ["repeat", t("desk.preview_schedule_mode_repeat")],
          ["event", t("desk.preview_schedule_mode_event")],
        ]}
        dateLabel={t("desk.preview_schedule_date")}
        repeatLabel={t("desk.preview_schedule_repeat")}
        timeLabel={t("desk.preview_schedule_time")}
        zoneLabel={t("desk.preview_schedule_zone")}
        startLabel={t("desk.preview_schedule_start")}
      />
    </DeskDialog>
  );
}

/**
 * Run with a saved prompt: a new chat in Plan, so the person sees the plan before anything
 * runs. A sample playbook has no prompt and opens the sample run.
 */
export function runPlaybook(
  deps: { workspaceId: string | null; request: (chat: PendingDeskChat) => void; navigate: (path: string) => void },
  playbook: Pick<Playbook, "id" | "prompt">,
) {
  if (playbook.prompt && deps.workspaceId) {
    deps.request({ workspaceId: deps.workspaceId, prompt: playbook.prompt, mode: "plan" });
    deps.navigate("/chat");
    return;
  }
  deps.navigate(runPath(playbook.id));
}

/** `/playbook/:playbookId`. Run starts a chat in Plan; sample playbooks open a sample run. */
export function PlaybookScreen() {
  const { playbookId } = useParams<{ playbookId: string }>();
  const { services, scope } = usePreviewServices();
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const request = useDeskStartStore((state) => state.request);
  const openModal = useFrameStore((state) => state.openModal);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const [scheduling, setScheduling] = useState(false);
  const query = useQuery({ queryKey: previewKey(scope, "playbooks"), queryFn: () => services.playbooks.list(), staleTime: 30_000 });
  const playbook = query.data?.data.find((entry) => entry.id === playbookId);
  const preview = query.data?.preview ?? true;
  const remove = async (id: string) => {
    try {
      await services.playbooks.remove(id);
      await queryClient.invalidateQueries({ queryKey: previewKey(scope, "playbooks") });
      showToast(t("desk.playbook_deleted"));
      navigate("/playbooks");
    } catch {
      showToast(t("desk.playbook_delete_failed"), t("desk.settings_try_again"), "danger");
    }
  };

  return (
    <DeskShell
      current="playbooks"
      title={playbook?.name ?? t("desk.screen_playbook")}
      meta={playbook?.team ? t("desk.preview_playbook_meta") : undefined}
      actions={
        playbook ? (
          <>
            {preview ? null : (
              <>
                <Button size="sm" variant="ghost" onClick={() => openModal({ kind: "playbook", playbookId: playbook.id })}>
                  {t("desk.playbook_edit")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(playbook.id)}>
                  {t("desk.playbook_delete")}
                </Button>
              </>
            )}
            <Button size="sm" variant="secondary" iconLeft={icons.calendarClock(ICON)} onClick={() => setScheduling(true)}>
              {t("desk.preview_schedule")}
            </Button>
          </>
        ) : null
      }
    >
      <PreviewPage note={t("desk.preview_playbooks_note")} preview={preview}>
        <PreviewState query={query}>
          {() =>
            playbook ? (
              <PlaybookView
                playbook={playbook}
                locale={locale}
                onRun={() => runPlaybook({ workspaceId, request, navigate }, playbook)}
                onOpenLink={openExternal}
              />
            ) : (
              <EmptyState title={t("desk.preview_not_found_title")} description={t("desk.preview_not_found_text")} />
            )
          }
        </PreviewState>
      </PreviewPage>
      {playbook && scheduling ? <ScheduleDialog open playbook={playbook} onClose={() => setScheduling(false)} /> : null}
    </DeskShell>
  );
}
