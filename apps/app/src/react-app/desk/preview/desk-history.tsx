/** @jsxImportSource react */
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TaskStatus, type TableColumn } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
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

function historyColumns(locale: string): Array<TableColumn<HistoryEntry>> {
  return [
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
            {entry.sentOutside
              ? `${historyKindLabel(entry.kind)} - ${t("desk.preview_sent_outside")}`
              : historyKindLabel(entry.kind)}
          </span>
        </span>
      ),
    },
    { key: "projectId", header: t("desk.preview_history_project"), wrap: true, render: (entry) => sampleProjectName(entry.projectId) },
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
}

/** Everything Desk did and who approved it, newest first. */
export function HistoryView(props: { entries: HistoryEntry[]; locale: string }) {
  const rows = [...props.entries].sort((a, b) => b.at - a.at);
  return (
    <>
      <p className="desk-settings__lede">{t("desk.preview_history_lede")}</p>
      <Table caption={t("desk.preview_history_caption")} columns={historyColumns(props.locale)} rows={rows} />
    </>
  );
}

/** `/history`. Sample entries until runs are recorded. */
export function HistoryScreen() {
  const { services, scope } = usePreviewServices();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const query = useQuery({ queryKey: previewKey(scope, "history"), queryFn: () => services.history.list(), staleTime: Infinity });
  return (
    <DeskShell current="history" title={t("desk.nav_history")} meta={t("desk.preview_history_meta")}>
      <PreviewPage note={t("desk.preview_history_note")} wide>
        <PreviewState query={query}>{(entries) => <HistoryView entries={entries} locale={locale} />}</PreviewState>
      </PreviewPage>
    </DeskShell>
  );
}
