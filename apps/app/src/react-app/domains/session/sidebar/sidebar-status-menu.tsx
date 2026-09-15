import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  MessageCircleMore,
  SparklesIcon,
  MoreHorizontal,
  Settings,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { usePlatform } from "../../../kernel/platform";
import { useControlAction, type RedrobControlAction } from "../../../shell/control/control-provider";
import { useShellConfig } from "../../../shell/shell-config";
import type { RedrobServerStatus } from "../../../../app/lib/redrob-server";

const DOCS_URL = "https://redrob.io/docs";
const BOOT_STARTED_AT = Date.now();
const INITIALIZING_MS = 15_000;

type StatusDotVariant = "connected" | "loading" | "partial" | "disconnected";

function StatusDot({ variant }: { variant: StatusDotVariant }) {
  return (
    <span className="relative flex size-2 shrink-0 items-center justify-center">
      {variant === "loading" ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning/35" />
      ) : null}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          variant === "connected" && "bg-success",
          variant === "loading" && "bg-warning",
          variant === "partial" && "bg-warning",
          variant === "disconnected" && "bg-destructive",
        )}
      />
    </span>
  );
}

export type RuntimeStatus = {
  variant: StatusDotVariant;
  label: string;
  detail: string | null;
};

type RuntimeStatusInput = {
  clientConnected: boolean;
  redrobServerStatus: RedrobServerStatus;
  loading?: boolean;
  initializing: boolean;
  reloadBusy?: boolean;
  reloadError?: string | null;
};

export function resolveRuntimeStatus(input: RuntimeStatusInput): RuntimeStatus {
  if (input.reloadBusy) {
    return {
      variant: "loading",
      label: t("status.reloading_config"),
      detail: t("config.reload_now_desc"),
    };
  }
  if (input.reloadError) {
    return { variant: "disconnected", label: t("system.reload_failed"), detail: input.reloadError };
  }
  if (input.loading || (input.redrobServerStatus === "disconnected" && input.initializing)) {
    return {
      variant: "loading",
      label: t("session.preparing_workspace"),
      detail: t("session.loading_detail"),
    };
  }
  if (input.clientConnected) {
    return { variant: "connected", label: t("status.ready_for_tasks"), detail: null };
  }
  if (input.redrobServerStatus === "limited") {
    return { variant: "partial", label: t("status.limited_mode"), detail: t("status.limited_hint") };
  }
  return {
    variant: "disconnected",
    label: t("status.disconnected_label"),
    detail: t("status.disconnected_hint"),
  };
}

export type SidebarStatusMenuProps = {
  clientConnected: boolean;
  redrobServerStatus: RedrobServerStatus;
  developerMode: boolean;
  /** Hidden until a workspace is selected, matching the old status bar. */
  showConnectionStatus: boolean;
  providerConnectedIds: string[];
  mcpConnectedCount: number;
  loading?: boolean;
  reloadBusy?: boolean;
  reloadError?: string | null;
  showSettingsButton?: boolean;
  onOpenAccountSettings?: () => void;
  onSendFeedback?: () => void;
};

/**
 * Sidebar footer control: the live runtime status the app used to show in a
 * full-width bottom status bar, plus the settings/docs/feedback entry points.
 *
 * This was the account menu. With no control plane there is no account to show,
 * so the avatar, the sign-in and handoff-paste flows, the log-out action, the
 * "Redrob Work Connect" status row and the Redrob Models upsell are all gone.
 */
export function SidebarStatusMenu(props: SidebarStatusMenuProps) {
  const platform = usePlatform();
  const { config: shellConfig, hasHiddenFeatures, revealAdvanced } = useShellConfig();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [initializing, setInitializing] = useState(
    () => Date.now() - BOOT_STARTED_AT < INITIALIZING_MS,
  );

  useEffect(() => {
    if (!initializing) return;
    const remaining = Math.max(0, INITIALIZING_MS - (Date.now() - BOOT_STARTED_AT));
    const timeout = window.setTimeout(() => setInitializing(false), remaining);
    return () => window.clearTimeout(timeout);
  }, [initializing]);

  const openSettings = props.onOpenAccountSettings;
  const openDocs = useCallback(() => platform.openLink(DOCS_URL), [platform]);

  const docsControlAction = useMemo<RedrobControlAction>(() => ({
    id: "status.docs.open",
    label: "Open Redrob Work docs",
    description: "Open the documentation from the status menu.",
    sideEffect: "external",
    targetRef: triggerRef,
    execute: openDocs,
  }), [openDocs]);
  useControlAction(docsControlAction);

  const feedbackControlAction = useMemo<RedrobControlAction>(() => ({
    id: "status.feedback.open",
    label: "Send feedback",
    description: "Open the Redrob Work feedback surface from the status menu.",
    sideEffect: "external",
    disabled: !props.onSendFeedback,
    targetRef: triggerRef,
    execute: () => props.onSendFeedback?.(),
  }), [props.onSendFeedback]);
  useControlAction(feedbackControlAction);

  const settingsControlAction = useMemo<RedrobControlAction>(() => ({
    id: "status.settings.open",
    label: "Open settings from the status menu",
    description: "Use the status menu in the sidebar footer.",
    sideEffect: "navigation",
    disabled: props.showSettingsButton === false || !openSettings,
    targetRef: triggerRef,
    execute: () => openSettings?.(),
  }), [openSettings, props.showSettingsButton]);
  useControlAction(settingsControlAction);

  const runtimeStatus = props.showConnectionStatus
    ? resolveRuntimeStatus({
      clientConnected: props.clientConnected,
      redrobServerStatus: props.redrobServerStatus,
      loading: props.loading,
      initializing,
      reloadBusy: props.reloadBusy,
      reloadError: props.reloadError,
    })
    : null;
  const showStatus = shellConfig.statusBar && runtimeStatus !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            ref={triggerRef}
            type="button"
            data-testid="sidebar-status-menu"
            data-runtime-state={runtimeStatus?.variant}
            className="flex w-full items-center gap-2 rounded-lg ps-1.5 pe-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent max-lg:min-h-11"
            aria-label={t("sidebar.status_and_settings")}
            title={runtimeStatus?.label}
          >
            {runtimeStatus ? (
              <span className="flex size-6 shrink-0 items-center justify-center">
                <StatusDot variant={runtimeStatus.variant} />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-sidebar-foreground">
                {runtimeStatus?.label ?? t("status.settings")}
              </span>
              {runtimeStatus?.detail ? (
                <span className="block truncate text-[10.5px] leading-tight text-muted-foreground">
                  {runtimeStatus.detail}
                </span>
              ) : null}
            </span>
            <MoreHorizontal size={14} className="shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent side="top" align="start" className="w-72">
        {showStatus && runtimeStatus ? (
          <div className="mx-1 mb-1 flex flex-col gap-2 rounded-lg bg-muted/50 p-2">
            <div data-testid="runtime-status" className="flex items-start gap-2">
              <span className="mt-1">
                <StatusDot variant={runtimeStatus.variant} />
              </span>
              <div className="min-w-0">
                <div className="text-[11.5px] font-medium text-foreground">{runtimeStatus.label}</div>
                {runtimeStatus.detail ? (
                  <div className="text-[10.5px] leading-tight text-muted-foreground">
                    {runtimeStatus.detail}
                  </div>
                ) : null}
              </div>
            </div>
            {props.showConnectionStatus && props.developerMode ? (
              <div className="text-[10.5px] leading-tight text-muted-foreground">
                {t("account.providers_connected", { count: props.providerConnectedIds.length })}
                {" · "}
                {t("account.mcp_connected", { count: props.mcpConnectedCount })}
                {` · ${t("status.developer_mode")}`}
              </div>
            ) : null}
          </div>
        ) : null}

        {props.showSettingsButton !== false ? (
          <DropdownMenuItem onClick={openSettings}>
            <Settings className="size-3.5" />
            {t("status.settings")}
          </DropdownMenuItem>
        ) : null}
        {shellConfig.docsButton ? (
          <DropdownMenuItem onClick={openDocs}>
            <BookOpen className="size-3.5" />
            {t("status.docs")}
          </DropdownMenuItem>
        ) : null}
        {shellConfig.feedbackButton && props.onSendFeedback ? (
          <DropdownMenuItem onClick={props.onSendFeedback}>
            <MessageCircleMore className="size-3.5" />
            {t("status.feedback")}
          </DropdownMenuItem>
        ) : null}
        {/* Progressive disclosure has held something back. Offer it rather than
            making the user wait out the session count to find it. */}
        {hasHiddenFeatures ? (
          <DropdownMenuItem onClick={revealAdvanced} data-testid="reveal-advanced-features">
            <SparklesIcon className="size-3.5" />
            {t("status.reveal_advanced")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
