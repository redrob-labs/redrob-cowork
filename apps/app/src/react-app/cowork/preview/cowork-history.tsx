/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, icons } from "@redrob-labs/ui";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { ChatMenuItems, ConfirmDeleteDialog, InlineRename, useChatActions, type ChatRef } from "../chats/chat-menu";
import { formatHistoryWhen } from "../history/history";
import type { HistoryEntry } from "../services/types";
import { CoworkShell } from "../shell/cowork-shell";
import { PreviewPage, PreviewState } from "./preview-note";
import { previewKey, usePreviewServices } from "./preview";

const MORE_ICON = { width: 16, height: 16, "aria-hidden": true };

export type HistoryViewActions = {
  onRename: (chat: ChatRef, value: string) => void;
  onDelete: (chat: ChatRef) => void;
};

/**
 * Everything Cowork did, newest first, as a flat clickable list (Claude-style): each row is the
 * chat/run title with its relative time, linking to the chat. With `actions` (real data only),
 * each row also has a "..." menu on hover or focus: Rename (inline), Add to project and Delete.
 * The button is the link's sibling, never inside it, so it is its own control.
 */
export function HistoryView(props: {
  entries: HistoryEntry[];
  locale: string;
  preview?: boolean;
  now?: number;
  actions?: HistoryViewActions;
}) {
  const rows = [...props.entries].sort((a, b) => b.at - a.at);
  const preview = props.preview ?? true;
  const now = props.now ?? Date.now();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  if (!preview && !rows.length) {
    return <EmptyState title={t("cowork.history_empty_title")} description={t("cowork.history_empty_text")} />;
  }
  return (
    <ul className="cowork-history" aria-label={t("cowork.nav_history")}>
      {rows.map((entry) => {
        const chat: ChatRef = { id: entry.id, title: entry.what, workspaceId: entry.projectId };
        const actions = props.actions;
        return (
          <li key={entry.id} className="cowork-history__row" data-menu-open={menuFor === entry.id || undefined}>
            {renaming === entry.id && actions ? (
              <div className="cowork-history__link">
                <InlineRename
                  value={entry.what}
                  label={t("cowork.chat_name_input")}
                  className="cowork-history__rename"
                  onSave={(value) => {
                    setRenaming(null);
                    actions.onRename(chat, value);
                  }}
                  onCancel={() => setRenaming(null)}
                />
              </div>
            ) : (
              <a className="cowork-history__link" href={`#/chat/${encodeURIComponent(entry.id)}`}>
                <span className="cowork-history__what">{entry.what}</span>
                <span className="cowork-history__when">{formatHistoryWhen(entry.at, now, props.locale)}</span>
              </a>
            )}
            {actions && renaming !== entry.id ? (
              <DropdownMenu open={menuFor === entry.id} onOpenChange={(open) => setMenuFor(open ? entry.id : null)}>
                <DropdownMenuTrigger
                  render={(
                    <button
                      type="button"
                      className="cowork-row-more"
                      aria-label={t("cowork.more_actions_label", { name: entry.what })}
                    >
                      {icons.more(MORE_ICON)}
                    </button>
                  )}
                />
                <DropdownMenuContent align="end" sideOffset={4} className="cowork-add-menu">
                  <ChatMenuItems chat={chat} onRename={() => setRenaming(entry.id)} onDelete={() => actions.onDelete(chat)} />
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** `/history`: the chats and runs of every project, real where a server is connected. */
export function HistoryScreen() {
  const { services, scope } = usePreviewServices();
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const query = useQuery({ queryKey: previewKey(scope, "history"), queryFn: () => services.history.list(), staleTime: 30_000 });
  const preview = query.data?.preview ?? true;
  const chatActions = useChatActions();
  const [deleting, setDeleting] = useState<ChatRef | null>(null);
  return (
    <CoworkShell current="history" title={t("cowork.nav_history")} meta={preview ? t("cowork.preview_history_meta") : undefined}>
      <PreviewPage note={t("cowork.preview_history_note")} wide preview={preview}>
        <PreviewState query={query}>
          {(entries) => (
            <HistoryView
              entries={entries}
              locale={locale}
              preview={preview}
              // Sample history cannot be renamed or deleted, so the menus appear on real data only.
              actions={preview ? undefined : { onRename: (chat, value) => void chatActions.rename(chat, value), onDelete: setDeleting }}
            />
          )}
        </PreviewState>
      </PreviewPage>
      {deleting ? (
        <ConfirmDeleteDialog
          title={t("cowork.chat_delete_title")}
          text={t("cowork.chat_delete_text", { name: deleting.title })}
          onConfirm={() => chatActions.remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </CoworkShell>
  );
}
