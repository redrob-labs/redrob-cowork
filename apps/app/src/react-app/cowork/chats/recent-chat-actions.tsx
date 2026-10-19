/** @jsxImportSource react */
import { useCallback, useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { icons } from "@redrob-labs/ui";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { t } from "../../../i18n";
import { useCoworkConnection } from "../shell/cowork-connection";
import { ChatMenuItems, ConfirmDeleteDialog, InlineRename, useChatActions, type ChatRef } from "./chat-menu";

const MORE_ICON = { width: 16, height: 16, "aria-hidden": true };

/** The chat id a Recent link points at (`.../chat/<id>`), or null for any other menu link. */
export function recentChatIdFromHref(href: string | null): string | null {
  const match = href?.match(/\/chat\/([^/?#]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Where a Recent link sits inside the menu, for the overlay that follows it. */
type Spot = { chatId: string; top: number; left: number; width: number; height: number };

function spotOf(link: HTMLAnchorElement, chatId: string): Spot {
  return { chatId, top: link.offsetTop, left: link.offsetLeft, width: link.offsetWidth, height: link.offsetHeight };
}

/**
 * The "..." menu and inline rename for the Recent chats in the left menu.
 *
 * The DS AppShell draws each Recent chat as an `<a>` straight inside its `<nav>`, with no slot for
 * an action, and a button inside a link would be a control inside a control (and would open the
 * chat when pressed). So one overlay, portalled into the nav, follows the Recent link under the
 * pointer or keyboard focus and puts the "..." button on its right edge, as Claude does. A right
 * click, the context-menu key or Shift+F10 on a Recent link opens the same menu. Rename puts an
 * inline box over the link. Sample chats (no server yet) get no menu.
 */
export function RecentChatActions(props: {
  /** The shell's root element; the DS nav is found inside it. */
  rootRef: RefObject<HTMLElement | null>;
  chats: readonly { id: string; title: string }[];
  /** The open chat, so deleting it goes to a new chat. */
  openChatId?: string | null;
}) {
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const client = useCoworkConnection((state) => state.client);
  const actions = useChatActions(props.openChatId);
  const [nav, setNav] = useState<HTMLElement | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<Spot | null>(null);
  const [deleting, setDeleting] = useState<ChatRef | null>(null);
  const enabled = Boolean(client && workspaceId);

  // The DS renders the nav; find it once the shell has mounted (and again if it remounts).
  useEffect(() => {
    const found = props.rootRef.current?.querySelector<HTMLElement>(".rr-shell__nav") ?? null;
    setNav((current) => (current === found ? current : found));
  });

  const linkFor = useCallback(
    (target: EventTarget | null): { link: HTMLAnchorElement; chatId: string } | null => {
      const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || !nav?.contains(link)) return null;
      const chatId = recentChatIdFromHref(link.getAttribute("href"));
      return chatId && props.chats.some((chat) => chat.id === chatId) ? { link, chatId } : null;
    },
    [nav, props.chats],
  );

  useEffect(() => {
    if (!nav || !enabled) return;
    const follow = (event: Event) => {
      if (menuOpen) return;
      const hit = linkFor(event.target);
      if (hit) setSpot(spotOf(hit.link, hit.chatId));
      else if (!(event.target instanceof Element && event.target.closest(".cowork-recent-actions"))) setSpot(null);
    };
    const leave = () => {
      if (!menuOpen) setSpot(null);
    };
    const openFrom = (event: Event, hit: { link: HTMLAnchorElement; chatId: string }) => {
      event.preventDefault();
      setSpot(spotOf(hit.link, hit.chatId));
      setMenuOpen(true);
    };
    const onContextMenu = (event: MouseEvent) => {
      const hit = linkFor(event.target);
      if (hit) openFrom(event, hit);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
      const hit = linkFor(event.target);
      if (hit) openFrom(event, hit);
    };
    nav.addEventListener("pointerover", follow);
    nav.addEventListener("focusin", follow);
    nav.addEventListener("pointerleave", leave);
    nav.addEventListener("contextmenu", onContextMenu);
    nav.addEventListener("keydown", onKeyDown);
    return () => {
      nav.removeEventListener("pointerover", follow);
      nav.removeEventListener("focusin", follow);
      nav.removeEventListener("pointerleave", leave);
      nav.removeEventListener("contextmenu", onContextMenu);
      nav.removeEventListener("keydown", onKeyDown);
    };
  }, [nav, enabled, menuOpen, linkFor]);

  if (!nav || !enabled || !workspaceId) return null;
  const chatOf = (chatId: string): ChatRef => ({
    id: chatId,
    title: props.chats.find((chat) => chat.id === chatId)?.title ?? "",
    workspaceId,
  });

  return (
    <>
      {createPortal(
        <>
          {spot && !renaming ? (
            <div
              className="cowork-recent-actions"
              data-open={menuOpen || undefined}
              style={{ top: spot.top, height: spot.height, left: spot.left + spot.width }}
            >
              <DropdownMenu
                open={menuOpen}
                onOpenChange={(open) => {
                  setMenuOpen(open);
                  if (!open) setSpot(null);
                }}
              >
                <DropdownMenuTrigger
                  render={(
                    <button
                      type="button"
                      className="cowork-row-more cowork-recent-actions__more"
                      aria-label={t("cowork.more_actions_label", { name: chatOf(spot.chatId).title })}
                    >
                      {icons.more(MORE_ICON)}
                    </button>
                  )}
                />
                <DropdownMenuContent align="start" side="right" sideOffset={6} className="cowork-add-menu">
                  <ChatMenuItems
                    chat={chatOf(spot.chatId)}
                    onRename={() => setRenaming(spot)}
                    onDelete={() => setDeleting(chatOf(spot.chatId))}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {renaming ? (
            <div
              className="cowork-recent-rename"
              style={{ top: renaming.top, left: renaming.left, width: renaming.width, height: renaming.height }}
            >
              <InlineRename
                value={chatOf(renaming.chatId).title}
                label={t("cowork.chat_name_input")}
                onSave={(value) => {
                  const chat = chatOf(renaming.chatId);
                  setRenaming(null);
                  setSpot(null);
                  void actions.rename(chat, value);
                }}
                onCancel={() => {
                  setRenaming(null);
                  setSpot(null);
                }}
              />
            </div>
          ) : null}
        </>,
        nav,
      )}
      {deleting ? (
        <ConfirmDeleteDialog
          title={t("cowork.chat_delete_title")}
          text={t("cowork.chat_delete_text", { name: deleting.title })}
          onConfirm={() => actions.remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}
