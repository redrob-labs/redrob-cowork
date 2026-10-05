import { create } from "zustand";

import type { DeskServerClient } from "../services/real-services";

export type DeskConnection = {
  client: DeskServerClient | null;
  /** The server-side id of the workspace the chat route has open. */
  workspaceId: string | null;
  /** Changes when that workspace's chats are added or renamed, so the menu refetches. */
  chatsVersion: string;
};

/**
 * The server and workspace the chat route is using, published by `SessionRoute` so the
 * Desk menu reads the same chats without a second connection. Empty until a chat route
 * has mounted; the menu shows sample data until then.
 */
export const useDeskConnection = create<DeskConnection>()(() => ({
  client: null,
  workspaceId: null,
  chatsVersion: "",
}));

export function publishDeskConnection(next: DeskConnection) {
  const current = useDeskConnection.getState();
  if (
    current.client === next.client &&
    current.workspaceId === next.workspaceId &&
    current.chatsVersion === next.chatsVersion
  ) {
    return;
  }
  useDeskConnection.setState(next);
}
