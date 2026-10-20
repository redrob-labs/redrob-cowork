/** @jsxImportSource react */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, icons } from "@redrob-labs/ui";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "../../../i18n";
import { FLYOUT, ProjectItems, refreshChatLists } from "../composer/add-menu";
import { PROJECTS_QUERY_KEY } from "../projects/cowork-projects";
import { useCoworkConnection } from "../shell/cowork-connection";
import { CoworkDialog } from "../shell/cowork-dialog";
import { useFrameStore } from "../store/frame-store";
import { deleteChat, renameChat } from "./chat-actions";

// Menu row glyphs; decorative, each row's text is its label.
const ICON = { width: 16, height: 16, "aria-hidden": true };
// The workspaces list (for each chat's folder) is cached for 30s.
const STALE_MS = 30_000;

/** A chat a "..." menu acts on: its id, its title and the project (workspace) it is in. */
export type ChatRef = { id: string; title: string; workspaceId: string };

/**
 * Rename and delete for any chat, wherever its "..." menu is. Rename goes through the engine in
 * the chat's own folder (the server has no rename route); delete through the server. Deleting
 * the chat that is open goes to a new chat.
 */
export function useChatActions(openChatId?: string | null) {
  // The server (delete) and the engine (rename); either may be null before they connect.
  const client = useCoworkConnection((state) => state.client);
  const opencode = useCoworkConnection((state) => state.opencode);
  // Failures and deletes say so.
  const showToast = useFrameStore((state) => state.showToast);
  // Deleting the open chat leaves it.
  const navigate = useNavigate();
  // Every change refreshes the lists the chat appears in.
  const queryClient = useQueryClient();
  // Each chat is renamed in its own project's folder, so History can rename a chat of any project.
  const workspaces = useQuery({
    queryKey: [PROJECTS_QUERY_KEY, "workspaces", Boolean(client)],
    enabled: Boolean(client),
    queryFn: async () => (await client?.listWorkspaces())?.items ?? [],
    staleTime: STALE_MS,
  });
  // A workspace's folder once the list resolved; null means rename must fail closed.
  const directoryOf = (workspaceId: string) => {
    if (!workspaces.isSuccess) return null;
    return workspaces.data.find((entry) => entry.id === workspaceId)?.path?.trim() || null;
  };

  return {
    rename: async (chat: ChatRef, value: string) => {
      // Cross-project rename is unsafe without the target workspace's exact directory.
      const directory = directoryOf(chat.workspaceId);
      const renamed = await renameChat(
        {
          // Fail closed while workspace paths load or when the target path is unavailable.
          rename: opencode && directory
            ? ({ chatId, title }) => opencode.session.update({ sessionID: chatId, title, directory })
            : null,
          toast: showToast,
        },
        { chatId: chat.id, value, previous: chat.title, directory },
      );
      // Only a real change refreshes the lists.
      if (renamed) refreshChatLists(queryClient);
      return renamed;
    },
    remove: async (chat: ChatRef) => {
      const deleted = await deleteChat({ client, toast: showToast }, { workspaceId: chat.workspaceId, chatId: chat.id });
      // A failed delete already said so and changed nothing.
      if (!deleted) return false;
      refreshChatLists(queryClient);
      // The open chat is gone, so show a new one instead.
      if (openChatId === chat.id) navigate("/chat");
      return true;
    },
  };
}

/**
 * A list row's "..." button and its menu, for rows whose link cannot hold a button (History,
 * Projects). The button sits beside the link, never inside it, so it is its own control.
 */
export function RowMoreMenu(props: {
  /** The row's name, for the button's accessible label. */
  name: string;
  /** Controlled, so the row can stay highlighted while its menu is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The menu's rows. */
  children: ReactNode;
}) {
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      {/* The vertical three-dot button on the row's right edge. */}
      <DropdownMenuTrigger
        render={(
          <button type="button" className="cowork-row-more" aria-label={t("cowork.more_actions_label", { name: props.name })}>
            {icons.more(ICON)}
          </button>
        )}
      />
      {/* Aligned to the button's end edge, just under it. */}
      <DropdownMenuContent align="end" sideOffset={4} className="cowork-add-menu">
        {props.children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The chat "..." menu's rows: Rename, Add to project >, then Delete (danger, last). */
export function ChatMenuItems(props: { chat: ChatRef; onRename: () => void; onDelete: () => void }) {
  return (
    <>
      {/* Rename: the caller swaps the row for an inline box. */}
      <DropdownMenuItem onClick={props.onRename}>
        {icons.edit(ICON)}
        <span className="cowork-add-menu__text">{t("cowork.chat_rename")}</span>
      </DropdownMenuItem>
      {/* Add to project: the same flyout as the composer's, for this chat. */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          {icons.folder(ICON)}
          <span className="cowork-add-menu__text">{t("cowork.add_menu_project")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="cowork-add-menu cowork-add-menu--sub" {...FLYOUT}>
          <ProjectItems chat={{ id: props.chat.id, workspaceId: props.chat.workspaceId }} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      {/* Delete: last and in danger red; the caller asks before anything goes. */}
      <DropdownMenuItem variant="destructive" onClick={props.onDelete}>
        {icons.trash(ICON)}
        <span className="cowork-add-menu__text">{t("cowork.chat_delete")}</span>
      </DropdownMenuItem>
    </>
  );
}

/** Asks before something is deleted. Delete is the danger button; Escape and Cancel keep it. */
export function ConfirmDeleteDialog(props: {
  title: string;
  text: string;
  note?: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  // True while the delete runs; the dialog cannot be dismissed mid-delete.
  const [busy, setBusy] = useState(false);
  const confirm = () => {
    // A double press deletes once.
    if (busy) return;
    setBusy(true);
    // Closes either way: a failure has already said so in a toast.
    void props.onConfirm().finally(() => {
      setBusy(false);
      props.onClose();
    });
  };
  return (
    <CoworkDialog
      open
      title={props.title}
      // Escape and the backdrop do nothing while deleting.
      onClose={busy ? () => undefined : props.onClose}
      width={440}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={props.onClose}>
            {t("cowork.project_dialog_cancel")}
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            {busy ? t("cowork.deleting") : t("cowork.chat_delete")}
          </Button>
        </>
      }
    >
      {/* What goes, then (optionally) what stays. */}
      <p className="cowork-hint">{props.text}</p>
      {props.note ? <p className="cowork-hint">{props.note}</p> : null}
    </CoworkDialog>
  );
}

/**
 * The inline rename box: the name in place, selected. Enter or leaving the box saves, Escape
 * cancels. Saving an empty or unchanged name does nothing (see `nameToSave`).
 */
export function InlineRename(props: {
  value: string;
  label: string;
  className?: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  // The input, focused and selected on mount.
  const ref = useRef<HTMLInputElement | null>(null);
  // Set once Enter, Escape or blur has decided, so the blur after Enter does not save twice.
  const done = useRef(false);
  // The edited name, local until it is saved.
  const [value, setValue] = useState(props.value);
  useEffect(() => {
    // Ready to type over, as in a file manager.
    ref.current?.focus();
    ref.current?.select();
  }, []);
  // Saves or cancels, once.
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) props.onSave(value);
    else props.onCancel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // No form submit.
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      // Escape cancels the rename only, not the dialog or menu around it.
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  };
  return (
    <input
      ref={ref}
      className={["cowork-inline-rename", props.className].filter(Boolean).join(" ")}
      aria-label={props.label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      // Leaving the box saves, as Enter does.
      onBlur={() => finish(true)}
      // A click inside the box must not reach the row's link.
      onClick={(event) => event.stopPropagation()}
    />
  );
}
