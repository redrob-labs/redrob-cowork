import { desktopNotificationShow } from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/utils";
import {
  DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE,
  isDesktopNotificationPreference,
  type DesktopNotificationPreference,
} from "@/react-app/kernel/desktop-notification-preferences";
import { LOCAL_PREFERENCES_KEY } from "@/react-app/kernel/local-preferences-storage";
import { t } from "@/i18n";

type DesktopNotificationImportance = "important" | "routine";
type WebNotificationHandler = (title: string, description?: string, href?: string) => Promise<void>;

export type DesktopNotificationEvent =
  | { type: "task.completed"; sessionId: string }
  | { type: "task.failed"; sessionId: string; errorText?: string }
  | { type: "permission.asked"; sessionId: string; detail?: string }
  | { type: "question.asked"; sessionId: string; question?: string };

type NotificationCopy = {
  title: string;
  body: string;
  importance: DesktopNotificationImportance;
};

let webNotificationHandler: WebNotificationHandler | null = null;

export function setWebNotificationHandler(handler: WebNotificationHandler | null): void {
  webNotificationHandler = handler;
}

function readDesktopNotificationPreference(): DesktopNotificationPreference {
  if (typeof window === "undefined") return DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE;
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFERENCES_KEY);
    if (!raw) return DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE;
    const parsed: unknown = JSON.parse(raw);
    const value = parsed && typeof parsed === "object"
      ? Reflect.get(parsed, "desktopNotifications")
      : undefined;
    return isDesktopNotificationPreference(value)
      ? value
      : DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE;
  } catch {
    return DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE;
  }
}

function shouldNotify(
  preference: DesktopNotificationPreference,
  importance: DesktopNotificationImportance,
) {
  if (preference === "off") return false;
  if (preference === "important") return importance === "important";
  return true;
}

function isAppInView() {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}

function copyForEvent(event: DesktopNotificationEvent): NotificationCopy {
  switch (event.type) {
    case "task.completed":
      return {
        title: t("notify.task_completed_title"),
        body: t("notify.task_completed_body"),
        importance: "routine",
      };
    case "task.failed":
      return {
        title: t("notify.task_failed_title"),
        body: event.errorText?.trim() || t("notify.task_failed_body"),
        importance: "important",
      };
    case "permission.asked":
      return {
        title: t("notify.permission_title"),
        body: event.detail?.trim() || t("notify.permission_body"),
        importance: "important",
      };
    case "question.asked":
      return {
        title: t("notify.question_title"),
        body: event.question?.trim() || t("notify.question_body"),
        importance: "important",
      };
  }
}

export function notifyDesktopEvent(event: DesktopNotificationEvent): void {
  const copy = copyForEvent(event);
  if (!shouldNotify(readDesktopNotificationPreference(), copy.importance)) return;
  if (isAppInView()) return;

  if (!isDesktopRuntime()) {
    void webNotificationHandler?.(copy.title, copy.body).catch(() => undefined);
    return;
  }

  void desktopNotificationShow({
    title: copy.title,
    body: copy.body,
  }).catch(() => undefined);
}
