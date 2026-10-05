/** @jsxImportSource react */
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, Table, TaskStatus, type TableColumn } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { stepsDone } from "../history/history";
import type { HistoryEntry } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { PreviewPage, PreviewState } from "./preview-note";
import { formatWhen, previewKey, sampleProjectName, usePreviewServices } from "./preview";

export function historyKindLabel(kind: HistoryEntry["kind"]): string {
  switch (kind) {
    case "run":
      return t("desk.preview_kind_run");
    case "chat":
      return t("desk.preview_kind_chat");
    case "approval":
      return t("desk.preview_kind_approval");
    case "change":
      return t("desk.preview_kind_change");
  }
}

/** Who approved it, or that nobody needed to. */
export function historyApprover(entry: Pick<HistoryEntry, "approvedBy">): string {
  return entry.approvedBy ?? t("desk.preview_history_on_its_own");
}

function historyColumns(input: { locale: string; preview: boolean; projectName: (id: string) => string }): Array<TableColumn<HistoryEntry>> {
  const { locale } = input;
  const columns: Array<TableColumn<HistoryEntry>> = [
    {
      key: "at",
      header: t("desk.preview_history_when"),
      render: (entry) => <span className="desk-preview__figure">{formatWhen(entry.at, locale)}</span>,
    },
    {
      key: "what",
      header: t("desk.preview_history_what"),
      grow: true,
      wrap: true,
      render: (entry) => (
        <span className="desk-preview__what">
          <b>{entry.what}</b>
          <span>
            {[historyKindLabel(entry.kind), entry.sentOutside ? t("desk.preview_sent_outside") : null, stepsDone(entry.steps)]
              .filter(Boolean)
              .join(" - ")}
          </span>
        </span>
      ),
    },
    { key: "projectId", header: t("desk.preview_history_project"), wrap: true, render: (entry) => input.projectName(entry.projectId) },
    { key: "approvedBy", header: t("desk.preview_history_by"), render: historyApprover },
    {
      key: "took",
      header: t("desk.preview_history_took"),
      align: "right",
      render: (entry) => <span className="desk-preview__figure">{entry.took ?? ""}</span>,
    },
    {
      key: "state",
      header: t("desk.preview_history_result"),
      render: (entry) => <TaskStatus state={entry.state} label={entry.label} />,
    },
  ];
  // Who approved is not recorded for real chats, so the column would only ever say "on its own".
  return input.preview ? columns : columns.filter((column) => column.key !== "approvedBy");
}

/** Everything Desk did and who approved it, newest first. */
export function HistoryView(props: {
  entries: HistoryEntry[];
  locale: string;
  preview?: boolean;
  projectName?: (id: string) => string;
}) {
  const rows = [...props.entries].sort((a, b) => b.at - a.at);
  const preview = props.preview ?? true;
  if (!preview && !rows.length) {
    return <EmptyState title={t("desk.history_empty_title")} description={t("desk.history_empty_text")} />;
  }
  return (
    <>
      <p className="desk-settings__lede">{preview ? t("desk.preview_history_lede") : t("desk.history_lede")}</p>
      <Table
        caption={t("desk.preview_history_caption")}
        columns={historyColumns({ locale: props.locale, preview, projectName: props.projectName ?? sampleProjectName })}
        rows={rows}
      />
    </>
  );
}

/** `/history`: the chats and runs of every project, real where a server is connected. */
export function HistoryScreen() {
  const { services, scope } = usePreviewServices();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const query = useQuery({ queryKey: previewKey(scope, "history"), queryFn: () => services.history.list(), staleTime: 30_000 });
  const projects = useQuery({ queryKey: [...previewKey(scope, "history"), "projects"], queryFn: () => services.projects.list(), staleTime: 60_000 });
  const preview = query.data?.preview ?? true;
  const projectName = (id: string) =>
    preview ? sampleProjectName(id) : (projects.data?.data.find((project) => project.id === id)?.name ?? "");
  return (
    <DeskShell current="history" title={t("desk.nav_history")} meta={preview ? t("desk.preview_history_meta") : undefined}>
      <PreviewPage note={t("desk.preview_history_note")} wide preview={preview}>
        <PreviewState query={query}>
          {(entries) => <HistoryView entries={entries} locale={locale} preview={preview} projectName={projectName} />}
        </PreviewState>
      </PreviewPage>
    </DeskShell>
  );
}
