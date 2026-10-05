import { icons, type AppShellNavItem, type IconComponent } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { Chat, PrivacyLevel } from "../services/types";

/** The places in the Desk menu. A chat in Recent is marked by `chatId`, not by one of these. */
export type DeskNavId =
  | "chat"
  | "projects"
  | "playbooks"
  | "scheduled"
  | "history"
  | "guide"
  | "connectors"
  | "privacy"
  | "memory";

export type DeskNavInput = {
  current?: DeskNavId | null;
  chatId?: string | null;
  /** Any order; the four newest are shown. */
  chats: readonly Chat[];
  /** Null while a count is still loading: the row shows no meta rather than a wrong one. */
  waiting: number | null;
  connected: number | null;
  privacy: PrivacyLevel | null;
  notes: number | null;
  now: number;
  locale: string;
  /** Turns a router path into an href. HashRouter by default. */
  toHref?: (path: string) => string;
};

export const RECENT_CHAT_COUNT = 4;

const hashHref = (path: string) => `#${path}`;

const icon = (draw: IconComponent) => draw({ width: 16, height: 16, "aria-hidden": true });

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a chat was last active, as short as the menu allows: the time today, the
 * weekday within the past week, otherwise the day and month. In the person's language.
 */
export function formatNavTime(at: number, now: number, locale: string): string {
  const when = new Date(at);
  const today = new Date(now);
  if (sameDay(when, today)) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(when);
  }
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (at < startOfToday && at >= startOfToday - 6 * DAY_MS) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(when);
  }
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(when);
}

export function privacyLevelLabel(level: PrivacyLevel): string {
  switch (level) {
    case "off":
      return t("desk.privacy_off");
    case "standard":
      return t("desk.privacy_standard");
    case "high":
      return t("desk.privacy_high");
  }
}

const count = (value: number | null) => (value === null ? undefined : String(value));

/** The Desk menu, in the handoff's order. Pure: everything it shows comes in through `input`. */
export function buildDeskNav(input: DeskNavInput): AppShellNavItem[] {
  const toHref = input.toHref ?? hashHref;
  const place = (id: DeskNavId, label: string, draw: IconComponent, meta?: string): AppShellNavItem => ({
    id,
    label,
    icon: icon(draw),
    meta,
    href: toHref(`/${id}`),
    current: input.current === id,
  });
  const recent = [...input.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_CHAT_COUNT);

  return [
    place("chat", t("desk.nav_new_chat"), icons.plus),
    place("projects", t("desk.nav_projects"), icons.folder),
    place("playbooks", t("desk.nav_playbooks"), icons.checklist),
    place("scheduled", t("desk.nav_scheduled"), icons.calendarClock, count(input.waiting)),
    place("history", t("desk.nav_history"), icons.history),
    { heading: t("desk.nav_recent") },
    ...recent.map((chat) => ({
      id: `recent-${chat.id}`,
      label: chat.title.trim() || t("desk.untitled_chat"),
      meta: formatNavTime(chat.updatedAt, input.now, input.locale),
      href: toHref(`/chat/${encodeURIComponent(chat.id)}`),
      current: input.chatId === chat.id,
    })),
    { heading: t("desk.nav_how_it_works") },
    place("guide", t("desk.nav_guide"), icons.chart, t("desk.nav_auto")),
    place("connectors", t("desk.nav_connectors"), icons.plug, count(input.connected)),
    place("privacy", t("desk.nav_privacy"), icons.shieldCheck, input.privacy ? privacyLevelLabel(input.privacy) : undefined),
    place("memory", t("desk.nav_memory"), icons.bookOpen, count(input.notes)),
  ];
}
