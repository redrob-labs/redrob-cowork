/**
 * Builds the Cowork left-menu model from counts and the recent chats. Pure: it takes
 * everything it shows through its input and returns `AppShellNavItem[]`, so the shell
 * can render it the same whether the data is real or sample. Also the small time and
 * privacy-label formatters the menu rows need.
 */
import { createElement } from "react";
import { icons, type AppShellNavItem, type IconComponent } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { Chat, PrivacyLevel } from "../services/types";

/** The places in the Cowork menu. A chat in Recent is marked by `chatId`, not by one of these. */
export type CoworkNavId =
  | "chat"
  | "projects"
  | "skills"
  | "scheduled"
  | "history"
  | "guide"
  | "connectors"
  | "privacy"
  | "memory";

export type CoworkNavInput = {
  current?: CoworkNavId | null;
  chatId?: string | null;
  /** Any order; the five newest are shown. */
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

/** How many recent chats the menu shows under "Recent". */
export const RECENT_CHAT_COUNT = 5;

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

/** The privacy level as its menu-row label, in the person's language. */
export function privacyLevelLabel(level: PrivacyLevel): string {
  switch (level) {
    case "off":
      return t("cowork.privacy_off");
    case "standard":
      return t("cowork.privacy_standard");
    case "high":
      return t("cowork.privacy_high");
    case "strict":
      return t("cowork.privacy_strict");
  }
}

/** A count badge; a zero shows no meta (an empty "0" badge reads as noise). Null (still loading) and 0 both yield undefined. */
const countPositive = (value: number | null) => (value && value > 0 ? String(value) : undefined);

/** The Cowork menu, in the handoff's order. Pure: everything it shows comes in through `input`. */
export function buildCoworkNav(input: CoworkNavInput): AppShellNavItem[] {
  const toHref = input.toHref ?? hashHref;
  const place = (id: CoworkNavId, label: string, draw: IconComponent, meta?: string): AppShellNavItem => ({
    id,
    label,
    icon: icon(draw),
    meta,
    href: toHref(`/${id}`),
    current: input.current === id,
  });
  const recent = [...input.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_CHAT_COUNT);

  // A slim left menu: History is reached from Recent's "View all" (its route stays);
  // Privacy, Memory and Connectors live in Settings; Recent shows the latest
  // RECENT_CHAT_COUNT chats with no date/time meta.
  return [
    place("guide", t("cowork.nav_guide"), icons.chart),
    place("chat", t("cowork.nav_new_chat"), icons.plus),
    place("skills", t("cowork.nav_skills"), icons.sparkle),
    place("projects", t("cowork.nav_projects"), icons.folder),
    place("scheduled", t("cowork.nav_scheduled"), icons.calendarClock, countPositive(input.waiting)),
    { heading: t("cowork.nav_recent") },
    ...recent.map((chat) => ({
      id: `recent-${chat.id}`,
      label: chat.title.trim() || t("cowork.untitled_chat"),
      href: toHref(`/chat/${encodeURIComponent(chat.id)}`),
      current: input.chatId === chat.id,
    })),
    // "View all" under Recent opens the History page; shown only when there are recent chats.
    ...(recent.length
      ? [{
          id: "recent-view-all",
          // Styled label (not a plain string): matches the "Recent" heading's font size, but
          // bold and in a lighter/greyer tone than the heading. A span lets us style only this
          // item's text, since AppShellNavItem has no className hook. See .cowork-nav__view-all.
          label: createElement("span", { className: "cowork-nav__view-all" }, t("cowork.nav_recent_view_all")),
          href: toHref("/history"),
          current: input.current === "history",
        }]
      : []),
  ];
}
