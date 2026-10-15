/** @jsxImportSource react */
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { formatHistoryWhen } from "../history/history";
import type { HistoryEntry } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { PreviewPage, PreviewState } from "./preview-note";
import { previewKey, usePreviewServices } from "./preview";

/** Everything Desk did, newest first, as a flat clickable list (Claude-style):
 *  each row is the chat/run title with its relative time, linking to the chat. */
export function HistoryView(props: {
  entries: HistoryEntry[];
  locale: string;
  preview?: boolean;
  now?: number;
}) {
  const rows = [...props.entries].sort((a, b) => b.at - a.at);
  const preview = props.preview ?? true;
  const now = props.now ?? Date.now();
  if (!preview && !rows.length) {
    return <EmptyState title={t("desk.history_empty_title")} description={t("desk.history_empty_text")} />;
  }
  return (
    <ul className="desk-history" aria-label={t("desk.nav_history")}>
      {rows.map((entry) => (
        <li key={entry.id} className="desk-history__row">
          <a className="desk-history__link" href={`#/chat/${encodeURIComponent(entry.id)}`}>
            <span className="desk-history__what">{entry.what}</span>
            <span className="desk-history__when">{formatHistoryWhen(entry.at, now, props.locale)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** `/history`: the chats and runs of every project, real where a server is connected. */
export function HistoryScreen() {
  const { services, scope } = usePreviewServices();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const query = useQuery({ queryKey: previewKey(scope, "history"), queryFn: () => services.history.list(), staleTime: 30_000 });
  const preview = query.data?.preview ?? true;
  return (
    <DeskShell current="history" title={t("desk.nav_history")} meta={preview ? t("desk.preview_history_meta") : undefined}>
      <PreviewPage note={t("desk.preview_history_note")} wide preview={preview}>
        <PreviewState query={query}>
          {(entries) => <HistoryView entries={entries} locale={locale} preview={preview} />}
        </PreviewState>
      </PreviewPage>
    </DeskShell>
  );
}
