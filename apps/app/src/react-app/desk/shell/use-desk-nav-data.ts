import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";

import { currentLocale, subscribeToLocale } from "../../../i18n";
import { connectedCount, mcpStatusReader } from "../connectors/connectors";
import { createDeskServices } from "../services/real-services";
import { useFrameStore } from "../store/frame-store";
import { RECENT_CHAT_COUNT, type DeskNavInput } from "./nav";
import { useDeskConnection } from "./desk-connection";

export type DeskNavData = Omit<DeskNavInput, "current" | "chatId" | "toHref">;

const NAV_STALE_MS = 30_000;

/**
 * What the Desk menu shows: recent chats, runs waiting, connectors connected, the
 * privacy level and the number of notes. Real where the chat route has published a
 * server and workspace, sample data otherwise (see `createDeskServices`).
 */
export function useDeskNavData(): DeskNavData {
  const client = useDeskConnection((state) => state.client);
  const opencode = useDeskConnection((state) => state.opencode);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const workspaceRoot = useDeskConnection((state) => state.workspaceRoot);
  const chatsVersion = useDeskConnection((state) => state.chatsVersion);
  const developerMode = useFrameStore((state) => state.developerMode);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const services = useMemo(
    () => createDeskServices({ client, workspaceId, mcpStatus: mcpStatusReader(opencode, workspaceRoot) }),
    [client, opencode, workspaceId, workspaceRoot],
  );
  const scope = workspaceId ?? "preview";

  const chats = useQuery({
    queryKey: ["desk-nav", scope, "chats", chatsVersion],
    queryFn: async () => (await services.chats.list()).data.slice(0, RECENT_CHAT_COUNT),
    staleTime: NAV_STALE_MS,
    placeholderData: (previous) => previous,
  });
  const waiting = useQuery({
    queryKey: ["desk-nav", scope, "waiting"],
    queryFn: async () => (await services.schedules.list()).data.waiting.length,
    staleTime: NAV_STALE_MS,
  });
  const connected = useQuery({
    // The count the Connectors screen shows: the tools your team built only in Developer mode.
    queryKey: ["desk-nav", scope, "connected", developerMode],
    queryFn: async () => connectedCount((await services.connectors.list()).data, developerMode),
    staleTime: NAV_STALE_MS,
  });
  const privacy = useQuery({
    queryKey: ["desk-nav", scope, "privacy"],
    queryFn: async () => (await services.privacy.get()).data.level,
    staleTime: NAV_STALE_MS,
  });
  const notes = useQuery({
    queryKey: ["desk-nav", scope, "notes"],
    queryFn: async () => (await services.notes.list()).data.length,
    staleTime: NAV_STALE_MS,
  });

  return {
    chats: chats.data ?? [],
    waiting: waiting.data ?? null,
    connected: connected.data ?? null,
    privacy: privacy.data ?? null,
    notes: notes.data ?? null,
    now: Date.now(),
    locale,
  };
}
