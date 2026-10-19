/** @jsxImportSource react */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, icons } from "@redrob-labs/ui";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "../../../i18n";
import { ProjectItems } from "../composer/add-menu";
import { PROJECTS_QUERY_KEY } from "../projects/cowork-projects";
import { PREVIEW_QUERY_KEY } from "../preview/preview";
import { useCoworkConnection } from "../shell/cowork-connection";
import { CoworkDialog } from "../shell/cowork-dialog";
import { useFrameStore } from "../store/frame-store";
import { deleteChat, renameChat } from "./chat-actions";

const ICON = { width: 16, height: 16, "aria-hidden": true };
const STALE_MS = 30_000;

/** A chat a "..." menu acts on: its id, its title and the project (workspace) it is in. */
export type ChatRef = { id: string; title: string; workspaceId: string };

/** Flyout placement shared with the composer Add menu: a 4px gap, first rows lined up. */
const FLYOUT = { sideOffset: 13, alignOffset: -9 } as const;

/** After a chat or project changes: the menu's Recent list, History and the Projects screens. */
export function refreshChatLists(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["cowork-nav"] });
  void queryClient.invalidateQueries({ queryKey: [PREVIEW_QUERY_KEY] });
  void queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });
}

/**
 * Rename and delete for any chat, wherever its "..." menu is. Rename goes through the engine in
 * the chat's own folder (the server has no rename route); delete through the server. Deleting
 * the chat that is open goes to a new chat.
 */
export function useChatActions(openChatId?: string | null) {
  const client = useCoworkConnection((state) => state.client);
  const opencode = useCoworkConnection((state) => state.opencode);
  const showToast = useFrameStore((state) => state.showToast);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Each chat is renamed in its own project's folder, so History can rename a chat of any project.
  const workspaces = useQuery({
    queryKey: [PROJECTS_QUERY_KEY, "workspaces", Boolean(client)],
    enabled: Boolean(client),
    queryFn: async () => (await client?.listWorkspaces())?.items ?? [],
    staleTime: STALE_MS,
  });
  const directoryOf = (workspaceId: string) => workspaces.data?.find((entry) => entry.id === workspaceId)?.path?.trim() || null;

  return {
    rename: async (chat: ChatRef, value: string) => {
      const renamed = await renameChat(
        {
          rename: opencode
            ? ({ chatId, title, directory }) => opencode.session.update({ sessionID: chatId, title, directory: directory ?? undefined })
            : null,
          toast: showToast,
        },
        { chatId: chat.id, value, previous: chat.title, directory: directoryOf(chat.workspaceId) },
      );
      if (renamed) refreshChatLists(queryClient);
      return renamed;
    },
    remove: async (chat: ChatRef) => {
      const deleted = await deleteChat({ client, toast: showToast }, { workspaceId: chat.workspaceId, chatId: chat.id });
      if (!deleted) return false;
      refreshChatLists(queryClient);
      if (openChatId === chat.id) navigate("/chat");
      return true;
    },
  };
}

/** The chat "..." menu's rows: Rename, Add to project >, then Delete (danger, last). */
export function ChatMenuItems(props: { chat: ChatRef; onRename: () => void; onDelete: () => void }) {
  return (
    <>
      <DropdownMenuItem onClick={props.onRename}>
        {icons.edit(ICON)}
        <span className="cowork-add-menu__text">{t("cowork.chat_rename")}</span>
      </DropdownMenuItem>
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
  const [busy, setBusy] = useState(false);
  const confirm = () => {
    if (busy) return;
    setBusy(true);
    void props.onConfirm().finally(() => {
      setBusy(false);
      props.onClose();
    });
  };
  return (
    <CoworkDialog
      open
      title={props.title}
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
  const ref = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);
  const [value, setValue] = useState(props.value);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) props.onSave(value);
    else props.onCancel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
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
      onBlur={() => finish(true)}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
