/** @jsxImportSource react */
import { useCallback, useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { icons } from "@redrob-labs/ui";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { t } from "../../../i18n";
import { useCoworkConnection } from "../shell/cowork-connection";
import { ChatMenuItems, ConfirmDeleteDialog, InlineRename, useChatActions, type ChatRef } from "./chat-menu";

// The "..." glyph; decorative, the button carries the label.
const ICON = { width: 16, height: 16, "aria-hidden": true };

/** The chat id a Recent link points at (`.../chat/<id>`), or null for any other menu link. */
export function recentChatIdFromHref(href: string | null): string | null {
  // The id is the last path segment after `/chat/`, before any query or hash.
  const match = href?.match(/\/chat\/([^/?#]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Where a Recent link sits inside the menu, for the overlay that follows it. */
type Spot = { chatId: string; top: number; left: number; width: number; height: number };

// The link's box relative to the nav, which the overlay is portalled into.
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
  // Recent chats all belong to the open workspace.
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  // No server means sample chats, which get no menu.
  const client = useCoworkConnection((state) => state.client);
  const actions = useChatActions(props.openChatId);
  // The DS nav element, once found.
  const [nav, setNav] = useState<HTMLElement | null>(null);
  // The Recent link the overlay sits on, or null when none is hovered or focused.
  const [spot, setSpot] = useState<Spot | null>(null);
  // While the menu is open, the overlay stays put instead of following the pointer.
  const [menuOpen, setMenuOpen] = useState(false);
  // The link being renamed, kept so the box stays over it.
  const [renaming, setRenaming] = useState<Spot | null>(null);
  // The chat whose delete is being confirmed.
  const [deleting, setDeleting] = useState<ChatRef | null>(null);
  const enabled = Boolean(client && workspaceId);

  // The DS renders the nav; find it once the shell has mounted (and again if it remounts).
  useEffect(() => {
    const found = props.rootRef.current?.querySelector<HTMLElement>(".rr-shell__nav") ?? null;
    // Same element: keep the state as is, so this effect does not loop.
    setNav((current) => (current === found ? current : found));
  });

  // The Recent link an event came from, or null for any other part of the nav.
  const linkFor = useCallback(
    (target: EventTarget | null): { link: HTMLAnchorElement; chatId: string } | null => {
      const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || !nav?.contains(link)) return null;
      const chatId = recentChatIdFromHref(link.getAttribute("href"));
      // Only chats in the Recent list; the nav also links to History, Projects and the like.
      return chatId && props.chats.some((chat) => chat.id === chatId) ? { link, chatId } : null;
    },
    [nav, props.chats],
  );

  // Delegated listeners on the nav: one set for every Recent link, however the DS re-renders them.
  useEffect(() => {
    if (!nav || !enabled) return;
    // Pointer or focus on a Recent link moves the overlay there; elsewhere hides it.
    const follow = (event: Event) => {
      if (menuOpen) return;
      const hit = linkFor(event.target);
      if (hit) setSpot(spotOf(hit.link, hit.chatId));
      // Moving onto the overlay itself must not hide it.
      else if (!(event.target instanceof Element && event.target.closest(".cowork-recent-actions"))) setSpot(null);
    };
    // Leaving the nav hides the overlay, unless its menu is open.
    const leave = () => {
      if (!menuOpen) setSpot(null);
    };
    // Opens the menu on a link without the browser's own context menu.
    const openFrom = (event: Event, hit: { link: HTMLAnchorElement; chatId: string }) => {
      event.preventDefault();
      setSpot(spotOf(hit.link, hit.chatId));
      setMenuOpen(true);
    };
    // Right click.
    const onContextMenu = (event: MouseEvent) => {
      const hit = linkFor(event.target);
      if (hit) openFrom(event, hit);
    };
    // The context-menu key or Shift+F10, the keyboard's right click.
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
    // Removed on every re-subscribe, so a stale `menuOpen` is never read.
    return () => {
      nav.removeEventListener("pointerover", follow);
      nav.removeEventListener("focusin", follow);
      nav.removeEventListener("pointerleave", leave);
      nav.removeEventListener("contextmenu", onContextMenu);
      nav.removeEventListener("keydown", onKeyDown);
    };
  }, [nav, enabled, menuOpen, linkFor]);

  // Nothing to attach to, or nothing real to act on.
  if (!nav || !enabled || !workspaceId) return null;
  // The chat behind a spot, with its current title.
  const chatOf = (chatId: string): ChatRef => ({
    id: chatId,
    title: props.chats.find((chat) => chat.id === chatId)?.title ?? "",
    workspaceId,
  });

  return (
    <>
      {createPortal(
        <>
          {/* The "..." button, on the right edge of the link under the pointer or focus. */}
          {spot && !renaming ? (
            <div
              className="cowork-recent-actions"
              // Keeps the button visible while its menu is open.
              data-open={menuOpen || undefined}
              style={{ top: spot.top, height: spot.height, left: spot.left + spot.width }}
            >
              <DropdownMenu
                open={menuOpen}
                onOpenChange={(open) => {
                  setMenuOpen(open);
                  // Closing the menu lets the overlay follow the pointer again.
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
                      {icons.more(ICON)}
                    </button>
                  )}
                />
                {/* Opens to the right of the menu, beside the chat it acts on. */}
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
          {/* The rename box, laid exactly over the link it renames. */}
          {renaming ? (
            <div
              className="cowork-recent-actions__rename"
              style={{ top: renaming.top, left: renaming.left, width: renaming.width, height: renaming.height }}
            >
              <InlineRename
                value={chatOf(renaming.chatId).title}
                label={t("cowork.chat_name_input")}
                onSave={(value) => {
                  // Read before clearing the state it comes from.
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
      {/* The delete confirm, outside the nav so it is a proper modal. */}
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
