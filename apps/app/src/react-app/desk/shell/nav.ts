/**
 * Builds the Desk left-menu model from counts and the recent chats. Pure: it takes
 * everything it shows through its input and returns `AppShellNavItem[]`, so the shell
 * can render it the same whether the data is real or sample. Also the small time and
 * privacy-label formatters the menu rows need.
 */
import { icons, type AppShellNavItem, type IconComponent } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { Chat, PrivacyLevel } from "../services/types";

/** The places in the Desk menu. A chat in Recent is marked by `chatId`, not by one of these. */
export type DeskNavId =
  | "chat"
  | "projects"
  | "skills"
  | "scheduled"
  | "history"
  | "guide"
  | "connectors"
  | "privacy"
  | "memory";

export type DeskNavInput = {
  current?: DeskNavId | null;
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
      return t("desk.privacy_off");
    case "standard":
      return t("desk.privacy_standard");
    case "high":
      return t("desk.privacy_high");
    case "strict":
      return t("desk.privacy_strict");
  }
}

/** Round 38 (item 1): a count badge, but a zero shows NO meta (an empty "0" badge
 *  beside Scheduled read as noise). Null (still loading) and 0 both yield undefined. */
const countPositive = (value: number | null) => (value && value > 0 ? String(value) : undefined);

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

  // Round 37: left-menu slimmed. Item 6: History row removed from the menu (route
  // still exists). Item 5: the "Your Cowork" group (nav_how_it_works heading +
  // Privacy/Memory/Connectors) is removed from the left menu -- all three remain
  // reachable in Settings (Memory -> memory tab, Connectors -> ai tab, Privacy ->
  // Preferences). Item 7: Recent shows the latest 5 (RECENT_CHAT_COUNT) with NO
  // date/time meta on the right.
  return [
    place("guide", t("desk.nav_guide"), icons.chart),
    place("chat", t("desk.nav_new_chat"), icons.plus),
    place("skills", t("desk.nav_skills"), icons.sparkle),
    place("projects", t("desk.nav_projects"), icons.folder),
    place("scheduled", t("desk.nav_scheduled"), icons.calendarClock, countPositive(input.waiting)),
    { heading: t("desk.nav_recent") },
    ...recent.map((chat) => ({
      id: `recent-${chat.id}`,
      label: chat.title.trim() || t("desk.untitled_chat"),
      href: toHref(`/chat/${encodeURIComponent(chat.id)}`),
      current: input.chatId === chat.id,
    })),
    // Round 39 (item): "View all" under Recent routes to the History page, which left the
    // left menu in round 37 (item 6) but is still a live route. Shown only when there are
    // recent chats -- with an empty Recent there is nothing to view all of.
    ...(recent.length
      ? [{
          id: "recent-view-all",
          label: t("desk.nav_recent_view_all"),
          href: toHref("/history"),
          current: input.current === "history",
        }]
      : []),
  ];
}
