/** @jsxImportSource react */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "@/components/ui/sonner";
import type {
  AgentPartInput,
  FilePartInput,
  ProviderListResponse,
  TextPartInput,
} from "@redrob-labs/sdk/v2/client";

import { captureAnalyticsEvent, markTaskRunStart } from "@/app/lib/analytics";
import { buildDiagnosticsBundleJson } from "@/app/lib/diagnostics-bundle";
import { downloadTextAsFile } from "@/app/lib/download";
import { createClient, unwrap } from "@/app/lib/opencode";
import { abortSessionSafe, forkSession, listCommands, revertSession, setSessionArchived, shellInSession, unrevertSession } from "@/app/lib/opencode-session";
import { useSessionManagementStore as sessionManagementStore } from "@/react-app/domains/session/sidebar/session-management-store";
import {
  buildRedrobWorkspaceBaseUrl,
  readRedrobServerSettings,
} from "@/app/lib/redrob-server";
import {
  workspaceServerId,
  type ResolvedWorkspaceEndpoint,
} from "@/app/lib/workspace-endpoint";
import { buildRedrobEnvRuntimeKey } from "@/app/lib/redrob-env-runtime";
import {
  getDesktopHomeDir,
  joinDesktopPath,
  revealDesktopItemInDir,
  pickDirectory,
  resolveWorkspaceListSelectedId,
  workspaceBootstrap,
  workspaceForget,
  workspaceSetRuntimeActive,
  workspaceSetSelected,
  type RedrobServerInfo,
  type WorkspaceInfo,
  type WorkspaceList,
} from "@/app/lib/desktop";
import type {
  ComposerAttachment,
  ComposerDraft,
  ComposerPart,
  ModelOption,
  ModelRef,
  SlashCommandOption,
  WorkspacePreset,
  WorkspaceConnectionState,
  Client,
  ProviderListItem,
  WorkspaceDisplay,
  WorkspaceSessionGroup,
} from "@/app/types";
import { buildFeedbackUrl } from "@/app/lib/feedback";
import {
  getWorkspaceTaskLoadErrorDisplay,
  isDesktopRuntime,
  isSandboxWorkspace,
  normalizeDirectoryPath,
  normalizeSessionStatus,
  resolveModelDisplayName,
  safeStringify,
} from "@/app/utils";
import { t } from "@/i18n";
import {
  type RouteWorkspace,
  type RouteSession,
  describeRouteError,
  describeWorkspaceCreateError,
  downloadWorkspaceJson,
  folderNameFromPath,
  getSessionStatus,
  isActiveSessionStatus,
  isTransientStartupError,
  mapDesktopWorkspace,
  mergeRouteWorkspaces,
  orderRouteWorkspaces,
  toSessionGroups,
  workspaceExportFilename,
  workspaceLabel,
} from "@/react-app/shell/route-workspaces";
import { useLocal } from "@/react-app/kernel/local-provider";
import { usePlatform } from "@/react-app/kernel/platform";
import { SessionPage, type OpenSessionTab } from "@/react-app/domains/session/chat/session-page";
import type { NewTaskComposerContext } from "@/react-app/domains/session/chat/new-task-composer";
import { ReactSessionRuntime } from "@/react-app/domains/session/sync/runtime-sync";
import { useSessionActivityStore } from "@/react-app/domains/session/status/session-activity-store";
import { buildRedrobEnvSystemContext } from "@/react-app/domains/session/sync/env-context";
import {
  applySessionRevert,
  applySessionUnrevert,
} from "@/react-app/domains/session/sync/session-sync";
import { firstLineLocalFileParts, joinWorkspaceRelativePath, toFileUrl } from "@/react-app/domains/session/sync/prompt-file-parts";
import { composerAttachmentsToWorkspaceFileParts } from "@/react-app/domains/session/sync/attachment-file-part";
import { useSessionInteractions } from "@/react-app/domains/session/sync/use-session-interactions";
import { useModelBehavior } from "@/react-app/domains/session/surface/use-model-behavior";
import { useSessionFindStore } from "@/react-app/domains/session/surface/find-store";
import type { SessionSendResult } from "@/react-app/domains/session/surface/session-surface";
import { useModelPicker } from "@/react-app/domains/session/modals/use-model-picker";
import { getSessionModelSelection, useSessionModelStore } from "@/react-app/domains/session/surface/session-model-store";
import {
  compareSlots,
  resolveParaphraseSlots,
  type FanOutCommand,
  type FanOutModel,
} from "@/react-app/domains/session/model-fanout";
import {
  discardedSessions,
  finishedAssistantText,
  partialAssistantText,
  buildParaphrasePrompt,
  runSettled,
  startingRun,
  withVariant,
  type VariantRun,
} from "@/react-app/domains/session/variant-run";
import { openModelPickerEvent, openProviderAuthEvent } from "@/react-app/shell/new-providers-listener";
import { appMentionInstruction } from "@/react-app/domains/session/surface/composer/app-mentions";
import { decodeComposerMentionValue } from "@/react-app/domains/session/surface/composer/mention-encoding";
import { markComposerAutoSend } from "@/react-app/domains/session/surface/composer-auto-send";
import { sendWithRevertRollback } from "@/react-app/domains/session/surface/safe-edit-resend";
import { CreateWorkspaceModal } from "@/react-app/domains/workspace/create-workspace-modal";
import type { CreateWorkspaceOptions } from "@/react-app/domains/workspace/types";
import { useSessionProviderAuth } from "@/react-app/domains/connections/provider-auth/use-session-provider-auth";
import {
  disabledProvidersFromConfig,
  updateManagedDisabledProviders,
} from "@/react-app/domains/connections/managed-engine-config";
import { useMcpConnectedCount } from "@/react-app/domains/connections/use-mcp-connected-count";
import { useRemoteAccessRestart } from "@/react-app/domains/workspace/remote-access-restart";
import { RenameWorkspaceModal } from "@/react-app/domains/workspace/rename-workspace-modal";
import {
  diagnoseRemoteWorkspaceTaskLoadFailure,
  getRemoteWorkspaceConnectionKey,
  testRemoteWorkspaceConnection,
} from "@/react-app/domains/workspace/remote-workspace-diagnostics";
import { useShareWorkspaceState } from "@/react-app/domains/workspace/share-workspace-state";
import { ModelPickerModal, MODEL_PICKER_UNAVAILABLE_SUBTITLE } from "@/react-app/domains/session/modals/model-picker-modal";
import { CommandPalette, type PaletteItem, type SessionGroupOption } from "./command-palette";
import { buildCommandPaletteSessions } from "./command-palette-sessions";
import { SessionSearchDialog } from "./session-search-dialog";
import type { SessionMessageFetcher } from "@/react-app/domains/session/search/session-search";
import { useBootState } from "./boot-state";
import {
  forgetWorkspaceMemory,
  readLastSessionFor,
  readWorkspaceOrderIds,
  writeActiveWorkspaceId,
  writeLastSessionFor,
  writeWorkspaceProjectDimension,
  writeWorkspaceOrderIds,
} from "./session-memory";
import {
  publishInspectorSlice,
  recordInspectorEvent,
} from "../../app/lib/app-inspector";
import { saveSessionDraft } from "@/react-app/domains/session/sync/draft-store";
import { useComposerStateStore } from "@/react-app/domains/session/surface/composer-state-store";
import { useControlAction, type RedrobControlAction } from "./control/control-provider";
import { useReactRenderWatchdog } from "./react-render-watchdog";
import { useBootOverlayVisible } from "./boot-state";

import { filterProviderList } from "@/app/utils/providers";
import { ensureDesktopLocalRedrobConnection } from "./desktop-local-redrob";
import { resolveRedrobConnection } from "./redrob-connection";
import { useReloadCoordinator } from "./reload-coordinator";
import { useShellConfig } from "./shell-config";
import { useShellShortcuts } from "./use-shell-shortcuts";
import { useEngineReload } from "./use-engine-reload";
import { useSessionGroupSync } from "./use-session-group-sync";
import { useWorkspaceRouteState } from "./use-workspace-route-state";
import { getReactQueryClient } from "@/react-app/infra/query-client";
import { useSessionControlActions } from "@/react-app/domains/session/control/session-control-actions";
import { openComposerConfigure, isLibraryAgent, type ComposerSettingsSection } from "@/react-app/domains/settings/library";
import {
  globalExtensionsRoute,
  legacySessionRoute,
  workspaceExtensionsRoute,
  workspaceSessionRoute,
  workspaceSettingsRoute,
} from "./workspace-routes";
import { WorkspaceProvider } from "./workspace-provider";
import type { OpenTarget } from "@/react-app/domains/session/artifacts/open-target";
import { SettingsSurface } from "./settings-route";
import {
  ensureProviderListQuery,
  getConnectedProviderItems,
  isModelAvailableInConnectedProviders,
  refreshProviderListQueries,
  useProviderListQuery,
} from "@/react-app/infra/provider-list-query";

/**
 * Serialize an SDK error value into a string that parseSessionError can parse.
 * Preserves the original shape (name, data, message) as JSON when possible,
 * so the session surface can detect ProviderModelNotFoundError and offer
 * recovery actions like "Change model".
 */
function serializeSDKError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      const msg = (error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : String(error);
    }
  }
  return String(error);
}

function describeTaskCreateError(error: unknown) {
  const message = describeRouteError(error);
  let serializedCode: unknown = null;
  try {
    const payload: unknown = JSON.parse(message);
    serializedCode = typeof payload === "object" && payload !== null
      ? Reflect.get(payload, "code")
      : null;
  } catch {
    // The normal error path is plain text, not a wire payload.
  }
  const directCode = typeof error === "object" && error !== null
    ? Reflect.get(error, "code")
    : null;
  const code = typeof directCode === "string" ? directCode : serializedCode;
  if (code === "opencode_unconfigured") {
    return t("session.task_create_choose_model");
  }
  const lower = message.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("connection") ||
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("connection lost") ||
    lower.includes("internal_error") ||
    lower.includes("unexpected server error")
  ) {
    return t("session.task_create_redrob_code_unavailable");
  }
  return message;
}

function taskCreateUnavailableToastId(workspaceId: string) {
  return `opencode-unavailable:${workspaceId}`;
}

function focusPromptSoon() {
  if (typeof window === "undefined") return;
  const focus = () => window.dispatchEvent(new Event("redrob:focusPrompt"));
  [0, 80, 240, 600].forEach((delay) => window.setTimeout(focus, delay));
}

const EVAL_UNAVAILABLE_PROVIDER_ID = "eval-unavailable-provider";

function nextEvalUnavailableModel(current: ModelRef | null | undefined) {
  return {
    providerID: EVAL_UNAVAILABLE_PROVIDER_ID,
    modelID: current?.providerID === EVAL_UNAVAILABLE_PROVIDER_ID && current.modelID === "eval-unavailable-model-a"
      ? "eval-unavailable-model-b"
      : "eval-unavailable-model-a",
  } satisfies ModelRef;
}

// All workspace-scoped server URLs/clients/tokens come from
// `resolveWorkspaceEndpoint` in apps/app/src/app/lib/workspace-endpoint.ts.
// Don't compose `<baseUrl>/workspace/<id>` here.

async function draftToParts(
  draft: ComposerDraft,
  workspaceRoot: string,
  sessionId: string,
  endpoint: ResolvedWorkspaceEndpoint | null,
) {
  const parts: Array<TextPartInput | FilePartInput | AgentPartInput> = [];
  const root = workspaceRoot.trim();

  const toAbsolutePath = (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("/")) return trimmed;
    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return trimmed;
    if (!root) return "";
    return joinWorkspaceRelativePath(root, trimmed);
  };

  const filenameFromPath = (path: string) => {
    const normalized = path.replace(/\\/g, "/");
    const segments = normalized.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "file";
  };

  const attachmentFileById = new Map<string, FilePartInput>();
  if (draft.attachments.length > 0) {
    if (!endpoint) {
      throw new Error(t("composer.workspace_endpoint_unavailable"));
    }
    const uploaded = await composerAttachmentsToWorkspaceFileParts({
      attachments: draft.attachments,
      endpoint,
      sessionId,
      workspaceRoot: root,
    });
    for (const part of uploaded) {
      if (part.type === "text") {
        parts.push(part);
        continue;
      }
    }
    const fileParts = uploaded.filter((part): part is FilePartInput => part.type === "file");
    for (const [index, attachment] of draft.attachments.entries()) {
      const filePart = fileParts[index];
      if (filePart) attachmentFileById.set(attachment.id, filePart);
    }
  }

  // Prefer draft.text token order so attachment chips stay inline with surrounding text
  // (same positions as the composer), instead of dumping every file part at the end.
  const hasAttachmentTokens = /\[attachment [^\]]+\]/.test(draft.text);
  if (hasAttachmentTokens || attachmentFileById.size > 0) {
    const pasteByLabel = new Map(
      draft.parts
        .filter((part): part is Extract<ComposerPart, { type: "paste" }> => part.type === "paste")
        .map((part) => [part.label, part.text] as const),
    );
    for (const segment of draft.text.split(/(\[attachment [^\]]+\]|\[pasted text [^\]]+\]|\[skill [^\]]+\]|@[^\s@]+)/)) {
      if (!segment) continue;
      const attachmentMatch = segment.match(/^\[attachment (.+)\]$/);
      if (attachmentMatch?.[1]) {
        const filePart = attachmentFileById.get(attachmentMatch[1]);
        if (filePart) {
          parts.push(filePart);
          attachmentFileById.delete(attachmentMatch[1]);
        }
        continue;
      }
      const pasteMatch = segment.match(/^\[pasted text (.+)\]$/);
      if (pasteMatch?.[1]) {
        const pasted = pasteByLabel.get(pasteMatch[1]);
        if (pasted) parts.push({ type: "text", text: pasted });
        continue;
      }
      const skillMatch = segment.match(/^\[skill (.+)\]$/);
      if (skillMatch?.[1]) {
        parts.push({ type: "text", text: `Load [skill ${skillMatch[1]}] and follow its instructions.` });
        continue;
      }
      if (segment.startsWith("@")) {
        const value = decodeComposerMentionValue(segment.slice(1));
        const mentionPart = draft.parts.find((part) =>
          (part.type === "agent" && part.name === value)
          || (part.type === "app" && part.name === value)
          || (part.type === "file" && part.path === value),
        );
        if (mentionPart?.type === "agent") {
          parts.push({ type: "agent", name: mentionPart.name });
          continue;
        }
        if (mentionPart?.type === "app") {
          parts.push({ type: "text", text: appMentionInstruction(mentionPart.name) });
          continue;
        }
        if (mentionPart?.type === "file") {
          const absolute = toAbsolutePath(mentionPart.path);
          if (!absolute) continue;
          parts.push({
            type: "file",
            mime: "text/plain",
            url: toFileUrl(absolute),
            filename: filenameFromPath(mentionPart.path),
          });
          continue;
        }
      }
      parts.push({ type: "text", text: segment });
    }
    for (const filePart of attachmentFileById.values()) {
      parts.push(filePart);
    }
  } else {
    for (const part of draft.parts) {
      if (part.type === "text") {
        parts.push({ type: "text", text: part.text });
        continue;
      }
      if (part.type === "paste") {
        parts.push({ type: "text", text: part.text });
        continue;
      }
      if (part.type === "agent") {
        parts.push({ type: "agent", name: part.name });
        continue;
      }
      if (part.type === "skill") {
        parts.push({ type: "text", text: `Load [skill ${part.name}] and follow its instructions.` });
        continue;
      }
      if (part.type === "app") {
        parts.push({ type: "text", text: appMentionInstruction(part.name) });
        continue;
      }
      if (part.type === "file") {
        const absolute = toAbsolutePath(part.path);
        if (!absolute) continue;
        parts.push({
          type: "file",
          mime: "text/plain",
          url: toFileUrl(absolute),
          filename: filenameFromPath(part.path),
        });
      }
    }
  }

  parts.push(...firstLineLocalFileParts(draft.resolvedText ?? draft.text, root));

  return parts;
}

function singlePickedDirectory(selection: string | string[] | null) {
  return typeof selection === "string"
    ? selection
    : Array.isArray(selection)
      ? selection[0] ?? null
      : null;
}

export function SessionRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const platform = usePlatform();
  const { config: shellConfig, recordSessionOpened } = useShellConfig();
  const local = useLocal();
  const reloadCoordinator = useReloadCoordinator();
  const [redrobServerHostInfoState, setRedrobServerHostInfoState] = useState<RedrobServerInfo | null>(null);
  const [redrobServerSettingsVersion, setRedrobServerSettingsVersion] = useState(0);

  const [developerMode, setDeveloperMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("redrob.developerMode") === "1";
  });

  // Progressive disclosure: a first-run user starts without the status menu and
  // the notification bell, and they appear once the user has opened a few
  // sessions. Counted once per mount rather than per render.
  useEffect(() => {
    recordSessionOpened();
  }, [recordSessionOpened]);
  const [variantRun, setVariantRun] = useState<VariantRun | null>(null);
  /** The run the poll belongs to, so a discarded run's poll stops instead of running to its deadline. */
  const variantRunRef = useRef<VariantRun | null>(null);

  const {
    navigateToWorkspaceSession,
    routeWorkspaceId,
    selectedSessionId,
    loading,
    effectiveLoading,
    client,
    baseUrl,
    token,
    workspaces,
    setWorkspaces,
    workspacesRef,
    workspaceOrderIds,
    setWorkspaceOrderIds,
    workspaceOrderIdsRef,
    sessionsByWorkspaceId,
    setSessionsByWorkspaceId,
    sessionsByWorkspaceIdRef,
    errorsByWorkspaceId,
    setErrorsByWorkspaceId,
    workspaceConnectionOverrides,
    routeError,
    setRouteError,
    legacySelectedWorkspaceId,
    setLegacySelectedWorkspaceId,
    retryingWorkspaceIds,
    setRetryingWorkspaceIds,
    startupRetryTimerRef,
    selectedWorkspaceId,
    selectedWorkspace,
    selectedWorkspaceRoot,
    selectedWorkspaceEndpoint,
    selectedWorkspaceServerToken,
    opencodeBaseUrl,
    opencodeClient,
    selectedWorkspaceIsLoading,
    selectedWorkspaceError,
    routeNotFoundMessage,
    endpointForWorkspace,
    refreshRouteState,
    rememberPendingCreatedSession,
    handleRuntimeSessionCreated,
    handleRuntimeSessionUpdated,
    handleRuntimeSessionDeleted,
    runRemoteWorkspaceConnectionCheck,
  } = useWorkspaceRouteState({
    developerMode,
    onServerSettingsChanged: () => setRedrobServerSettingsVersion((value) => value + 1),
    onHostInfo: setRedrobServerHostInfoState,
  });
  const bootOverlayVisible = useBootOverlayVisible();
  // Agent selection is persisted in local prefs (like the model variant) so
  // it survives reloads instead of silently falling back to "build" (#2101).
  const selectedAgent = local.prefs.selectedAgent;
  const setSelectedAgent = useCallback(
    (agent: string | null) => {
      local.setPrefs((previous) => ({ ...previous, selectedAgent: agent }));
    },
    [local.setPrefs],
  );
  // One-way latch for "a refreshRouteState is currently running"; prevents
  // overlapping route refreshes from queueing up when the user clicks fast.
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [createWorkspaceBusy, setCreateWorkspaceBusy] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [renameWorkspaceId, setRenameWorkspaceId] = useState<string | null>(null);
  const [renameWorkspaceTitle, setRenameWorkspaceTitle] = useState("");
  const [renameWorkspaceBusy, setRenameWorkspaceBusy] = useState(false);
  const [paletteAccessibleTargets, setPaletteAccessibleTargets] = useState<OpenTarget[]>([]);
  const [providers, setProviders] = useState<ProviderListItem[]>([]);
  const [providerDefaults, setProviderDefaults] = useState<Record<string, string>>({});
  const [providerConnectedIds, setProviderConnectedIds] = useState<string[]>([]);
  const [disabledProviderIds, setDisabledProviderIds] = useState<string[]>([]);

  // Provider IDs that were just added — used to highlight them as
  useEffect(() => {
    setPaletteAccessibleTargets([]);
  }, [selectedSessionId, selectedWorkspaceId]);

  // Provider catalog cache. Used to compute the reasoning/thinking variant
  // options for whichever model is currently selected so the composer's
  // behavior pill actually shows its options (bug: was empty before).

  const redrobServerSettings = useMemo(
    () => readRedrobServerSettings(),
    [redrobServerSettingsVersion],
  );

  const activeReloadBlockingSessions = useMemo(
    () =>
      Object.values(sessionsByWorkspaceId)
        .flat()
        .flatMap((session) => {
          if (!isActiveSessionStatus(getSessionStatus(session))) return [];
          const id = String(session?.id ?? "");
          if (!id) return [];
          return [{
            id,
            title:
              String(session?.title ?? session?.slug ?? session?.id ?? "").trim() ||
              t("session.untitled"),
          }];
        }),
    [sessionsByWorkspaceId],
  );
  const activeSelectedWorkspaceSessionIds = useMemo(
    () =>
      (sessionsByWorkspaceId[selectedWorkspaceId] ?? []).flatMap((session) => {
        if (!isActiveSessionStatus(getSessionStatus(session))) return [];
        const id = String(session?.id ?? "").trim();
        return id ? [id] : [];
      }),
    [selectedWorkspaceId, sessionsByWorkspaceId],
  );
  const remoteAccessRestart = useRemoteAccessRestart({
    isEnabled: () => redrobServerSettings.remoteAccessEnabled === true,
    onHostInfo: setRedrobServerHostInfoState,
    onSettingsChanged: () => setRedrobServerSettingsVersion((value) => value + 1),
  });

  const { engineReloadVersion, routeEngineInfo, reloadWorkspaceEngineFromUi } = useEngineReload({
    client,
    workspaceId: selectedWorkspaceId,
    workspace: selectedWorkspace,
    endpointForWorkspace,
    activeReloadBlockingSessions,
    onError: setRouteError,
    refreshRouteState,
  });

  const environmentRuntimeKey = useMemo(
    () => buildRedrobEnvRuntimeKey({
      baseUrl: client?.baseUrl ?? null,
      pid: redrobServerHostInfoState?.pid ?? null,
      port: redrobServerHostInfoState?.port ?? null,
    }),
    [client?.baseUrl, redrobServerHostInfoState?.pid, redrobServerHostInfoState?.port],
  );

  const handleApplyEnvironmentChanges = useCallback(async () => {
    if (!isDesktopRuntime()) {
      throw new Error(t("settings.environment.apply_unavailable"));
    }
    if (activeReloadBlockingSessions.length > 0) {
      throw new Error(t("settings.environment.apply_blocked_active_tasks"));
    }
    if (!selectedWorkspaceRoot) {
      throw new Error(t("settings.environment.apply_no_local_workspace"));
    }
    const reloaded = await reloadWorkspaceEngineFromUi();
    if (!reloaded) {
      throw new Error(t("app.error_connect_first"));
    }
  }, [activeReloadBlockingSessions.length, reloadWorkspaceEngineFromUi, selectedWorkspaceRoot]);

  const shareWorkspaceState = useShareWorkspaceState({
    workspaces,
    redrobServerHostInfo: redrobServerHostInfoState,
    redrobServerSettings,
    engineInfo: routeEngineInfo,
    exportWorkspaceBusy: false,
    openLink: (url) => platform.openLink(url),
    workspaceLabel,
  });


  const workspaceSessionGroups = useMemo(
    () => {
      /*
        The forks a variant run is using are hidden while the choice is open. They are real sessions, so
        the server lists them and a refresh puts them in the sidebar, which is how three rows appeared for
        one turn. A fork that exists for the length of one choice is not a session the user has to manage;
        the one they keep stops being hidden the moment it becomes the session.
      */
      const running = new Set(
        (variantRun?.variants ?? []).flatMap((variant) => (variant.sessionID ? [variant.sessionID] : [])),
      );
      const visible = running.size
        ? Object.fromEntries(
            Object.entries(sessionsByWorkspaceId).map(([id, list]) => [
              id,
              (list ?? []).filter((session) => !running.has(session.id)),
            ]),
          )
        : sessionsByWorkspaceId;
      return toSessionGroups(workspaces, visible, errorsByWorkspaceId, new Set(retryingWorkspaceIds));
    },
    [errorsByWorkspaceId, retryingWorkspaceIds, sessionsByWorkspaceId, workspaces],
  );
  useSessionGroupSync({ workspaces, endpointForWorkspace });
  const selectedWorkspaceGroupState = sessionManagementStore((state) => (
    selectedWorkspaceId ? state.groupsByWorkspace[selectedWorkspaceId] : undefined
  ));
  const assignSessionToGroup = sessionManagementStore((state) => state.assignGroup);
  const seedWorkspaceActivitySessions = useSessionActivityStore((state) => state.seedWorkspaceSessions);
  const sessionActivityByWorkspaceId = useSessionActivityStore((state) => state.statusesByWorkspaceId);

  useEffect(() => {
    for (const group of workspaceSessionGroups) {
      seedWorkspaceActivitySessions(group.workspace.id, group.sessions);
      const serverId = workspaceServerId(group.workspace);
      if (serverId && serverId !== group.workspace.id) {
        seedWorkspaceActivitySessions(serverId, group.sessions);
      }
    }
  }, [seedWorkspaceActivitySessions, workspaceSessionGroups]);

  const sidebarSessionStatusById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const group of workspaceSessionGroups) {
      const serverId = workspaceServerId(group.workspace);
      const workspaceStatuses = {
        ...(sessionActivityByWorkspaceId[group.workspace.id] ?? {}),
        ...(serverId ? sessionActivityByWorkspaceId[serverId] ?? {} : {}),
      };
      for (const session of group.sessions) {
        const status = workspaceStatuses[session.id];
        if (status) next[session.id] = status;
      }
    }
    return next;
  }, [sessionActivityByWorkspaceId, workspaceSessionGroups]);

  const sidebarActiveWorkspaceId = useMemo(() => {
    const sessionId = selectedSessionId?.trim() ?? "";
    if (sessionId) {
      const owner = workspaceSessionGroups.find((group) =>
        group.sessions.some((session) => session?.id === sessionId),
      );
      if (owner?.workspace.id) return owner.workspace.id;
    }
    return selectedWorkspaceId;
  }, [selectedSessionId, selectedWorkspaceId, workspaceSessionGroups]);

  const workspaceConnectionStateById = useMemo(() => {
    const next: Record<string, WorkspaceConnectionState> = { ...workspaceConnectionOverrides };
    for (const workspace of workspaces) {
      if (workspace.workspaceType !== "remote") continue;
      const error = errorsByWorkspaceId[workspace.id]?.trim();
      if (!error || next[workspace.id]?.status === "connecting") continue;
      next[workspace.id] ??= {
        status: "error",
        message: getWorkspaceTaskLoadErrorDisplay(workspace, error).message || error,
        checkedAt: null,
      };
    }
    return next;
  }, [errorsByWorkspaceId, workspaceConnectionOverrides, workspaces]);

  const mcpConnectedCount = useMcpConnectedCount(opencodeClient, selectedWorkspaceRoot);
  const providerListQuery = useProviderListQuery({
    client: opencodeClient,
    baseUrl: opencodeBaseUrl,
    directory: selectedWorkspaceRoot || undefined,
  });
  const { providerCatalog, modelVariantLabel, modelBehaviorOptions, modelVariantValue } =
    useModelBehavior({
      providerList: providerListQuery.data,
      defaultModel: local.prefs.defaultModel,
      modelVariant: local.prefs.modelVariant ?? null,
    });
  const {
    store: sessionProviderAuthStore,
    snapshot: sessionProviderAuthSnapshot,
  } = useSessionProviderAuth({
    opencodeClient,
    opencodeBaseUrl,
    providers,
    providerDefaults,
    providerConnectedIds,
    disabledProviderIds,
    selectedWorkspace,
    selectedWorkspaceEndpoint,
    selectedWorkspaceRoot,
    selectedWorkspaceId,
    setProviders,
    setProviderDefaults,
    setProviderConnectedIds,
    setDisabledProviderIds,
  });
  const modelPicker = useModelPicker({
    client: opencodeClient,
    baseUrl: opencodeBaseUrl,
    workspaceRoot: selectedWorkspaceRoot,
  });
  // Which session the open model picker targets. Selecting a model while a
  // session is targeted remembers it for that conversation only; null means
  // the picker edits the global default (e.g. opened from the new-providers
  // toast). Composer "All models" carries the session id on the open event.
  const [modelPickerSessionId, setModelPickerSessionId] = useState<string | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string }>).detail;
      setModelPickerSessionId(typeof detail?.sessionId === "string" ? detail.sessionId : null);
    };
    window.addEventListener(openModelPickerEvent, handler);
    return () => window.removeEventListener(openModelPickerEvent, handler);
  }, []);
  const selectedModelUnavailable = Boolean(
    selectedWorkspaceId &&
      opencodeClient &&
      !loading &&
      local.prefs.defaultModel &&
      providerListQuery.data &&
      !isModelAvailableInConnectedProviders(providerListQuery.data, local.prefs.defaultModel),
  );
  const selectedModelUnavailableKey = selectedModelUnavailable && local.prefs.defaultModel
    ? `${local.prefs.defaultModel.providerID}:${local.prefs.defaultModel.modelID}`
    : null;
  const autoOpenedUnavailableModelRef = useRef<string | null>(null);

  // Offer the picker once per unavailable selection instead of leaving the
  // composer wedged on a model this workspace cannot run.
  useEffect(() => {
    if (!selectedModelUnavailableKey) {
      autoOpenedUnavailableModelRef.current = null;
      return;
    }
    if (autoOpenedUnavailableModelRef.current === selectedModelUnavailableKey) return;

    autoOpenedUnavailableModelRef.current = selectedModelUnavailableKey;
    modelPicker.setQuery("");
    modelPicker.setRecentProviderIds(new Set());
    modelPicker.setCompactOpen(false);
    modelPicker.setOpen(true);
  }, [modelPicker.setCompactOpen, modelPicker.setOpen, modelPicker.setQuery, modelPicker.setRecentProviderIds, selectedModelUnavailableKey]);

  const hasUsableModel = Boolean(
    local.prefs.defaultModel && !selectedModelUnavailable,
  );
  const canCreateTask = Boolean(
    opencodeClient &&
      selectedWorkspaceId &&
      !loading &&
      !selectedWorkspaceError &&
      !selectedModelUnavailable,
  );

  const {
    activePermission,
    permissionReplyBusy,
    respondPermission,
    activeQuestion,
    questionReplyBusy,
    respondQuestion,
    todos,
  } = useSessionInteractions({
    client: opencodeClient,
    workspaceId: selectedWorkspaceId,
    sessionId: selectedSessionId,
    workspaceRoot: selectedWorkspaceRoot,
  });
  const modelUnavailableMessage = selectedModelUnavailable
    ? t("models.model_unavailable_short")
    : null;
  const showPreparingStatus =
    effectiveLoading ||
    (!canCreateTask && !routeError && !selectedWorkspaceError);

  useEffect(() => {
    if (!opencodeClient) {
      setProviders([]);
      setProviderDefaults({});
      setProviderConnectedIds([]);
      return;
    }

    let cancelled = false;

    const applyProviderState = (value: ProviderListResponse) => {
      if (cancelled) return;
      setProviders((value.all ?? []) as ProviderListItem[]);
      setProviderConnectedIds(value.connected ?? []);
      // New-provider detection is handled globally by the provider auth
      // store's applyProviderListState, which fires dispatchNewProviders.
    };

    void (async () => {
      let disabledProviders: string[] = [];
      try {
        const config = unwrap(
          await opencodeClient.config.get({
            directory: selectedWorkspaceRoot || undefined,
          }),
        );
        disabledProviders = disabledProvidersFromConfig(config);
        if (!cancelled) setDisabledProviderIds(disabledProviders);
      } catch {
        // ignore config read failures and continue with provider discovery
      }

      try {
        applyProviderState(
          filterProviderList(
            await ensureProviderListQuery(getReactQueryClient(), {
              client: opencodeClient,
              baseUrl: opencodeBaseUrl,
              directory: selectedWorkspaceRoot || undefined,
            }),
            disabledProviders,
          ),
        );
      } catch {
        if (cancelled) return;
        setProviders([]);
        setProviderDefaults({});
        setProviderConnectedIds([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opencodeBaseUrl, opencodeClient, selectedWorkspaceRoot]);

  const modelLabel = local.prefs.defaultModel
    ? resolveModelDisplayName(local.prefs.defaultModel.modelID)
    : t("session.default_model");

  const listSlashCommands = useCallback(async (): Promise<SlashCommandOption[]> => {
    // engineReloadVersion is included so the callback identity changes after
    // an engine reload, which invalidates the composer's command list cache
    // and causes it to re-fetch (picking up newly created skills).
    void engineReloadVersion;
    if (!opencodeClient) return [];
    return listCommands(opencodeClient, selectedWorkspaceRoot || undefined);
  }, [engineReloadVersion, opencodeClient, selectedWorkspaceRoot]);

  // Shared by the composer (plug menu, @ mentions) and the command palette.
  // Hidden and subagent-only entries are excluded — those are task-tool
  // delegation targets, not agents the user can run a session as.
  const listAgents = useCallback(async () => {
    // Include engineReloadVersion so the composer refetches after newly added
    // agent files become available, even when the inline picker is hidden.
    void engineReloadVersion;
    if (!opencodeClient) return [];
    const list = unwrap(await opencodeClient.app.agents());
    return list.filter(isLibraryAgent);
  }, [engineReloadVersion, opencodeClient]);

  const handleOpenSettings = useCallback((route = "/settings/general", workspaceId = sidebarActiveWorkspaceId) => {
    const sessionId = workspaceId === sidebarActiveWorkspaceId ? selectedSessionId : null;
    const tab = route.replace(/^\/settings\/?/, "").replace(/^\/+|\/+$/g, "") || "general";
    const target = workspaceId ? workspaceSettingsRoute(workspaceId, tab) : route;
    writeActiveWorkspaceId(workspaceId || null);
    navigate(target, { state: { workspaceId, sessionId } });
  }, [navigate, selectedSessionId, sidebarActiveWorkspaceId]);

  const handleOpenExtensions = useCallback((path = "", workspaceId = sidebarActiveWorkspaceId) => {
    const sessionId = workspaceId === sidebarActiveWorkspaceId ? selectedSessionId : null;
    const extensionPath = path
      .replace(/^\/settings\/extensions\/?/, "")
      .replace(/^\/extensions\/?/, "")
      .replace(/^\/+|\/+$/g, "")
      .replace(/^mcp$/, "mcps");
    const target = workspaceId
      ? workspaceExtensionsRoute(workspaceId, extensionPath)
      : globalExtensionsRoute(extensionPath);
    writeActiveWorkspaceId(workspaceId || null);
    navigate(target, { state: { workspaceId, sessionId } });
  }, [navigate, selectedSessionId, sidebarActiveWorkspaceId]);

  const extensionsMainOpen = /^\/(?:workspace\/[^/]+\/)?extensions(?:\/|$)/.test(location.pathname);

  const surfaceProps = useMemo(() => {
    if (!client || !selectedWorkspaceId || !selectedSessionId || !opencodeBaseUrl || !token || !opencodeClient) {
      return null;
    }

    // Transient-safety: when the user switches workspaces the URL-driven
    // selectedSessionId may still point at a session from the old workspace
    // for one render tick. Only block rendering when we KNOW the session
    // belongs to a different workspace (i.e., it exists in another
    // workspace's list). A brand-new session that hasn't been refreshed
    // into any list yet must still render so "New task" feels instant.
    let sessionOwnedByOtherWorkspace = false;
    for (const [workspaceId, sessions] of Object.entries(sessionsByWorkspaceId)) {
      if (workspaceId === selectedWorkspaceId) continue;
      if ((sessions ?? []).some((session) => session?.id === selectedSessionId)) {
        sessionOwnedByOtherWorkspace = true;
        break;
      }
    }
    if (sessionOwnedByOtherWorkspace) {
      return null;
    }

    // Note: do NOT include `client`, `workspaceId`, `sessionId`,
    // `opencodeBaseUrl`, or `redrobToken` here. SessionPage forwards those
    // explicitly to SessionSurface from the per-workspace endpoint resolved
    // by `resolveWorkspaceEndpoint`. If we leak them in here, the spread of
    // `surfaceProps` in SessionPage overrides those correct values with the
    // local server's, and remote workspaces silently end up calling the
    // local server with the local `rem_*` id.
    return {
      workspaceRoot: selectedWorkspaceRoot,
      developerMode: false,
      modelLabel,
      onModelClick: (sessionId?: string) => {
        setModelPickerSessionId(sessionId ?? null);
        modelPicker.setQuery("");
        modelPicker.setOpen(true);
      },
      providerCatalog,
      /*
        `/compare` and `/shuffle`, resolved against the catalogue the picker already shows so the two
        cannot disagree about which models exist. Compare matches the ids the user typed; anything it
        cannot find is dropped by the resolver rather than guessed at, since running a different model
        than the one asked for would make the comparison quietly wrong.
      */
      modelPickerOpen: modelPicker.compactOpen,
      modelUnavailable: selectedModelUnavailable,
      modelUnavailableMessage,
      selectedModel: local.prefs.defaultModel ?? { providerID: "", modelID: "" },
      onModelPickerOpenChange: (open: boolean) => {
        modelPicker.setCompactOpen(open);
      },
      onModelChange: (model: ModelRef, variant?: string | null) => {
        local.setPrefs((previous) => ({
          ...previous,
          defaultModel: model,
          modelVariant: variant !== undefined
            ? variant
            : previous.defaultModel?.providerID === model.providerID && previous.defaultModel.modelID === model.modelID
              ? previous.modelVariant
              : null,
        }));
        modelPicker.setCompactOpen(false);
      },
      providerConnectedCount: hasUsableModel ? 1 : providerConnectedIds.length,
      onOpenSettingsSection: (section: ComposerSettingsSection) => {
        openComposerConfigure(section, {
          openLibrary: handleOpenExtensions,
          openSettings: handleOpenSettings,
        });
      },
      onSendDraft: async (draft: ComposerDraft, sessionId: string): Promise<SessionSendResult> => {
        const targetSessionId = sessionId.trim() || selectedSessionId;
        if (!targetSessionId) return { outcome: "cancelled", reason: "context_changed" };
        const text = (draft.resolvedText ?? draft.text).trim();
        if (!text && draft.attachments.length === 0) {
          return { outcome: "cancelled", reason: "context_changed" };
        }
        // Per-conversation model memory: a session that picked its own model
        // sends with it (and its variant) instead of the global default.
        const sessionModelSelection = getSessionModelSelection(targetSessionId);
        const sendModel = sessionModelSelection?.model ?? local.prefs.defaultModel;
        const sendVariant = sessionModelSelection ? sessionModelSelection.variant : modelVariantValue;
        if (!sessionModelSelection && selectedModelUnavailable) throw new Error(t("composer.selected_model_unavailable"));

        await sendWithRevertRollback({
          revertMessageId: draft.revertMessageId,
          abort: () => abortSessionSafe(opencodeClient, targetSessionId, selectedWorkspaceRoot || undefined, {
            source: "session.edit_resend.before_revert",
            initiator: "user",
            reason: "abort active run before replacing a reverted message",
          }),
          revert: async (messageId) => {
            const reverted = await revertSession(opencodeClient, targetSessionId, messageId);
            applySessionRevert(selectedWorkspaceId, reverted);
          },
          prompt: async () => {
            captureAnalyticsEvent("task_message_sent", {
              mode: draft.mode ?? "prompt",
              is_command: Boolean(draft.command),
              attachment_count: draft.attachments.length,
              text_length: text.length,
              workspace_type: selectedWorkspace?.workspaceType ?? "unknown",
              provider_id: sendModel?.providerID ?? null,
              model_id: sendModel?.modelID ?? null,
            });
            markTaskRunStart(targetSessionId);

            if (draft.mode === "shell") {
              await shellInSession(opencodeClient, targetSessionId, text);
              return;
            }

            if (draft.command) {
              const result = await opencodeClient.session.command({
                sessionID: targetSessionId,
                command: draft.command.name,
                arguments: draft.command.arguments,
              });
              if (result.error) {
                throw new Error(serializeSDKError(result.error));
              }
              return;
            }

            const parts = await draftToParts(draft, selectedWorkspaceRoot, targetSessionId, selectedWorkspaceEndpoint);
            const envSystemContext = await buildRedrobEnvSystemContext(client, {
              cacheKey: targetSessionId,
              runtimeKey: environmentRuntimeKey,
            });
            const result = await opencodeClient.session.promptAsync({
              sessionID: targetSessionId,
              parts,
              model: sendModel ?? undefined,
              agent: selectedAgent ?? undefined,
              ...(sendVariant ? { variant: sendVariant } : {}),
              ...(envSystemContext ? { system: envSystemContext } : {}),
            });
            if (result.error) {
              throw new Error(serializeSDKError(result.error));
            }
            // Remember what this conversation used last so returning to it
            // (or splitting it beside another session) keeps its own model.
            if (sendModel) {
              useSessionModelStore.getState().setModel(targetSessionId, sendModel, sendVariant ?? null);
            }
          },
          unrevert: async () => {
            try {
              await unrevertSession(opencodeClient, targetSessionId);
            } finally {
              applySessionUnrevert(selectedWorkspaceId, targetSessionId);
            }
          },
          onUnrevertError: (error) => console.warn("[edit-resend] rollback failed", error),
        });
        return { outcome: "sent" };
      },
      onOpenConnect: () => handleOpenExtensions(),
      onDraftChange: () => {
        // Draft persistence will be wired once the full React shell owns session state.
      },
      attachmentsEnabled: true,
      attachmentsDisabledReason: null,
      modelVariantLabel,
      modelVariant: modelVariantValue,
      modelBehaviorOptions,
      onModelVariantChange: (value: string | null) => {
        local.setPrefs((previous) => ({ ...previous, modelVariant: value }));
      },
      agentLabel: selectedAgent ? selectedAgent.charAt(0).toUpperCase() + selectedAgent.slice(1) : t("session.default_agent"),
      selectedAgent,
      listAgents,
      onSelectAgent: (agent: string | null) => setSelectedAgent(agent),
      listCommands: listSlashCommands,
      recentFiles: [],
      searchFiles: async (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return [];
        const result = unwrap(
          await opencodeClient.find.files({
            query: trimmed,
            dirs: "true",
            limit: 50,
            directory: selectedWorkspaceRoot || undefined,
          }),
        );
        return result;
      },
      isRemoteWorkspace: selectedWorkspace?.workspaceType === "remote",
      isSandboxWorkspace: selectedWorkspace ? isSandboxWorkspace(selectedWorkspace) : false,
      onRevertToMessage: async (messageId: string, sessionId: string) => {
        const targetSessionId = sessionId.trim() || selectedSessionId;
        if (!targetSessionId) return false;
        try {
          // Abort any running generation first; OpenCode rejects revert on busy sessions.
          await abortSessionSafe(opencodeClient, targetSessionId, selectedWorkspaceRoot || undefined, {
            source: "session.revert_to_message.before_revert",
            initiator: "user",
            reason: "abort active run before reverting transcript",
          });
          const reverted = await revertSession(opencodeClient, targetSessionId, messageId);
          // Stamp the revert cursor into the local caches so the transcript
          // rewinds immediately instead of waiting for a full reload.
          applySessionRevert(selectedWorkspaceId, reverted);
          return true;
        } catch (error) {
          console.warn("[revert] failed", error);
          toast.error(t("session.revert_failed"));
          return false;
        }
      },
      onRestoreRevertedSession: async (sessionId: string) => {
        const targetSessionId = sessionId.trim() || selectedSessionId;
        if (!targetSessionId) return false;
        try {
          await unrevertSession(opencodeClient, targetSessionId);
          applySessionUnrevert(selectedWorkspaceId, targetSessionId);
          return true;
        } catch (error) {
          console.warn("[unrevert] failed", error);
          toast.error(t("session.restore_failed"));
          return false;
        }
      },
      onForkAtMessage: (messageId: string | null, sessionId: string) => {
        void (async () => {
          const targetSessionId = sessionId.trim() || selectedSessionId;
          if (!targetSessionId) return;
          try {
            const forked = await forkSession(opencodeClient, targetSessionId, messageId ?? undefined);
            writeLastSessionFor(selectedWorkspaceId, forked.id);
            rememberPendingCreatedSession(selectedWorkspaceId, forked.id);
            setSessionsByWorkspaceId((current) => ({
              ...current,
              [selectedWorkspaceId]: [forked, ...(current[selectedWorkspaceId] ?? [])],
            }));
            navigateToWorkspaceSession(selectedWorkspaceId, forked.id);
            void refreshRouteState();
          } catch (error) {
            console.warn("[fork] failed", error);
            toast.error(t("session.branch_failed"));
          }
        })();
      },
      onChangeModel: (model: { providerID: string; modelID: string }) => {
        local.setPrefs((previous) => ({
          ...previous,
          defaultModel: model,
          modelVariant: previous.defaultModel?.providerID === model.providerID && previous.defaultModel.modelID === model.modelID
            ? previous.modelVariant
            : null,
        }));
      },
      environmentRuntimeKey,
      onApplyEnvironmentChanges: isDesktopRuntime() && selectedWorkspace?.workspaceType !== "remote"
        ? handleApplyEnvironmentChanges
        : undefined,
    };
  }, [
    client,
    modelPicker.compactOpen,
    handleOpenExtensions,
    handleOpenSettings,
    hasUsableModel,
    handleApplyEnvironmentChanges,
    environmentRuntimeKey,
    local,
    listAgents,
    listSlashCommands,
    modelBehaviorOptions,
    modelLabel,
    modelUnavailableMessage,
    modelVariantLabel,
    modelVariantValue,
    navigate,
    providerCatalog,
    opencodeBaseUrl,
    opencodeClient,
    providerConnectedIds,
    selectedAgent,
    selectedSessionId,
    selectedModelUnavailable,
    selectedWorkspace,
    selectedWorkspaceId,
    selectedWorkspaceRoot,
    sessionsByWorkspaceId,
    token,
  ]);

  // Workspace-scoped wiring for the empty-state hero's full composer. Unlike
  // `surfaceProps` this exists without a selected session, so the hero offers
  // the same skills/commands/agent/model controls before the session is
  // created. Model and agent choices land in the same route-level state the
  // session composer reads, so they carry into the created session.
  const newTaskComposerContext = useMemo<NewTaskComposerContext | null>(() => {
    return {
      client,
      workspaceId: selectedWorkspaceId || null,
      selectedModel: local.prefs.defaultModel ?? { providerID: "", modelID: "" },
      modelOptions: modelPicker.options,
      modelUnavailable: selectedModelUnavailable,
      modelUnavailableMessage,
      modelPickerOpen: modelPicker.compactOpen,
      onModelPickerOpenChange: (open: boolean) => {
        modelPicker.setCompactOpen(open);
      },
      onModelChange: (model: ModelRef, variant?: string | null) => {
        local.setPrefs((previous) => ({
          ...previous,
          defaultModel: model,
          modelVariant: variant !== undefined
            ? variant
            : previous.defaultModel?.providerID === model.providerID && previous.defaultModel.modelID === model.modelID
              ? previous.modelVariant
              : null,
        }));
        modelPicker.setCompactOpen(false);
      },
      modelVariantLabel,
      modelVariant: modelVariantValue,
      modelBehaviorOptions,
      onModelVariantChange: (value: string | null) => {
        local.setPrefs((previous) => ({ ...previous, modelVariant: value }));
      },
      agentLabel: selectedAgent ? selectedAgent.charAt(0).toUpperCase() + selectedAgent.slice(1) : t("session.default_agent"),
      selectedAgent,
      listAgents,
      onSelectAgent: (agent: string | null) => setSelectedAgent(agent),
      listCommands: listSlashCommands,
      searchFiles: async (query: string) => {
        const trimmed = query.trim();
        if (!trimmed || !opencodeClient) return [];
        const result = unwrap(
          await opencodeClient.find.files({
            query: trimmed,
            dirs: "true",
            limit: 50,
            directory: selectedWorkspaceRoot || undefined,
          }),
        );
        return result;
      },
      isRemoteWorkspace: selectedWorkspace?.workspaceType === "remote",
      isSandboxWorkspace: selectedWorkspace ? isSandboxWorkspace(selectedWorkspace) : false,
      onOpenSettingsSection: (section: ComposerSettingsSection) => {
        openComposerConfigure(section, {
          openLibrary: handleOpenExtensions,
          openSettings: handleOpenSettings,
        });
      },
    };
  }, [
    client,
    handleOpenExtensions,
    handleOpenSettings,
    listAgents,
    listSlashCommands,
    local,
    modelUnavailableMessage,
    modelBehaviorOptions,
    modelPicker,
    modelVariantLabel,
    modelVariantValue,
    opencodeClient,
    selectedAgent,
    selectedModelUnavailable,
    selectedWorkspace,
    selectedWorkspaceId,
    selectedWorkspaceRoot,
    setSelectedAgent,
  ]);

  const handleOpenCreateWorkspace = useCallback(() => {
    setCreateWorkspaceOpen(true);
  }, []);

  const handleOpenRenameWorkspace = useCallback((workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    setRenameWorkspaceId(workspaceId);
    setRenameWorkspaceTitle(
      workspace.displayName?.trim() ||
        workspace.name?.trim() ||
        workspace.path?.trim() ||
        "",
    );
  }, [workspaces]);

  const handleSaveRenameWorkspace = useCallback(async () => {
    if (!renameWorkspaceId) return;
    const trimmed = renameWorkspaceTitle.trim();
    if (!trimmed) return;
    setRenameWorkspaceBusy(true);
    try {
      if (!client) {
        toast.error(t("workspace.server_unavailable_rename"));
        return;
      }
      await client.updateWorkspaceDisplayName(renameWorkspaceId, trimmed);
      setRenameWorkspaceId(null);
      setRenameWorkspaceTitle("");
      await refreshRouteState();
    } catch (error) {
      toast.error("Workspace rename failed", {
        description: describeRouteError(error),
      });
    } finally {
      setRenameWorkspaceBusy(false);
    }
  }, [client, refreshRouteState, renameWorkspaceId, renameWorkspaceTitle]);

  const handleRevealWorkspace = useCallback(async (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const path = workspace?.path?.trim();
    if (!path || !isDesktopRuntime()) return;
    try {
      await revealDesktopItemInDir(path);
    } catch {
      // ignore
    }
  }, [workspaces]);

  const handleShareWorkspace = useCallback((workspaceId: string) => {
    shareWorkspaceState.openShareWorkspace(workspaceId);
  }, [shareWorkspaceState]);

  const handleSaveShareRemoteAccess = useCallback(
    async (enabled: boolean) => {
      if (!isDesktopRuntime()) return;
      await remoteAccessRestart.save(enabled);
    },
    [remoteAccessRestart],
  );

  const handleExportWorkspaceConfig = useCallback(
    async (workspaceId: string) => {
      const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;
      if (!workspace) return;
      const endpoint = endpointForWorkspace(workspace);
      if (endpoint) {
        const payload = await endpoint.client.exportWorkspace(endpoint.workspaceId);
        downloadWorkspaceJson(workspaceExportFilename(workspace), payload);
        return;
      }
      throw new Error(t("workspace.server_unavailable_export"));
    },
    [endpointForWorkspace, workspaces],
  );

  const handleForgetWorkspace = useCallback(
    async (workspaceId: string) => {
      if (typeof window !== "undefined") {
        if (!window.confirm(t("workspace_list.remove_confirm"))) return;
      }
      // Remove from both stores so the next refresh can't resurrect the row
      // from whichever list wins the merge.
      if (client) {
        await client.deleteWorkspace(workspaceId).catch(() => undefined);
      }
      if (isDesktopRuntime()) {
        await workspaceForget(workspaceId).catch(() => undefined);
      }
      if (selectedWorkspaceId === workspaceId) {
        setLegacySelectedWorkspaceId("");
        writeActiveWorkspaceId(null);
        navigate(legacySessionRoute());
      }
      forgetWorkspaceMemory(workspaceId);
      sessionManagementStore.getState().forgetWorkspace(workspaceId);
      await refreshRouteState();
    },
    [client, navigate, refreshRouteState, selectedWorkspaceId],
  );


  const applyLastUsedModelToSession = useCallback((sessionId: string) => {
    const previous = selectedSessionId ? getSessionModelSelection(selectedSessionId) : null;
    const model = previous?.model ?? local.prefs.defaultModel;
    if (!model?.providerID || !model.modelID) return;
    const variant = previous ? previous.variant : (local.prefs.modelVariant ?? null);
    useSessionModelStore.getState().setModel(sessionId, model, variant);
    local.setPrefs((current) => {
      if (
        current.defaultModel?.providerID === model.providerID
        && current.defaultModel.modelID === model.modelID
        && (current.modelVariant ?? null) === variant
      ) {
        return current;
      }
      return { ...current, defaultModel: model, modelVariant: variant };
    });
  }, [local, selectedSessionId]);

  const handleCreateTaskInWorkspace = useCallback(async (workspaceId: string): Promise<string | null> => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (
      !workspace ||
      loading ||
      retryingWorkspaceIds.includes(workspaceId)
    ) {
      return null;
    }
    const endpoint = endpointForWorkspace(workspace);
    if (!endpoint || !endpoint.token) {
      return null;
    }
    const workspaceClient = createClient(
      endpoint.opencodeBaseUrl,
      workspace.path?.trim() || undefined,
      { token: endpoint.token, mode: "redrob" },
    );
    try {
      setErrorsByWorkspaceId((current) => ({ ...current, [workspaceId]: null }));
      setRouteError(null);
      const session = unwrap(
        await workspaceClient.session.create({ directory: workspace.path?.trim() || undefined }),
      );
      captureAnalyticsEvent("task_created", {
        source: "new_task",
        workspace_type: workspace.workspaceType ?? "unknown",
      });
      toast.dismiss(taskCreateUnavailableToastId(workspaceId));
      toast.dismiss();
      setLegacySelectedWorkspaceId(workspaceId);
      writeActiveWorkspaceId(workspaceId || null);
      writeLastSessionFor(workspaceId, session.id);
      rememberPendingCreatedSession(workspaceId, session.id);
      applyLastUsedModelToSession(session.id);
      setSessionsByWorkspaceId((current) => {
        const next = {
          ...current,
          [workspaceId]: [session, ...(current[workspaceId] ?? [])],
        };
        sessionsByWorkspaceIdRef.current = next;
        return next;
      });
      navigateToWorkspaceSession(workspaceId, session.id);
      focusPromptSoon();
      void refreshRouteState();
      return session.id;
    } catch (error) {
      const message = describeTaskCreateError(error);
      setRouteError(message);
      setErrorsByWorkspaceId((current) => ({ ...current, [workspaceId]: message }));
      toast.error("Redrob Code unavailable", {
        id: taskCreateUnavailableToastId(workspaceId),
        description: message,
        action: {
          label: "Retry",
          onClick: () => void handleCreateTaskInWorkspace(workspaceId),
        },
        duration: Infinity,
      });
      if (isTransientStartupError(message)) {
        setRetryingWorkspaceIds((current) => Array.from(new Set([...current, workspaceId])));
        if (startupRetryTimerRef.current === null) {
          startupRetryTimerRef.current = window.setTimeout(() => {
            startupRetryTimerRef.current = null;
            void refreshRouteState({ supersede: true });
          }, 1_000);
        }
      }
      return null;
    }
  }, [applyLastUsedModelToSession, endpointForWorkspace, loading, navigateToWorkspaceSession, refreshRouteState, rememberPendingCreatedSession, retryingWorkspaceIds, selectedWorkspaceId, workspaces]);

  /**
   * Run one prompt several ways, each in a FORK of this session, and keep the answer the user picks.
   *
   * Forks rather than replies in one transcript, because the engine gives a user message exactly one
   * assistant message and that history is the next turn's input: two answers in one session would each
   * read the other as their own earlier turn. Forks rather than fresh sessions, because a variant has to
   * start from the SAME conversation to be an answer to this turn rather than to a blank one.
   *
   * Answers are polled. The app subscribes to events for the session on screen and these forks are
   * deliberately not on screen, so polling is the honest way to watch them rather than pretending a second
   * subscription exists. Nothing is added to the sidebar: a fork that exists for the length of one choice
   * is not a session the user has to manage.
   */
  const handleVariantRun = useCallback(async (
    command:
      | FanOutCommand
      | { kind: "compare" | "paraphrase"; prompt: string; models: readonly FanOutModel[] },
  ): Promise<number> => {
    const workspaceId = selectedWorkspaceId;
    const sessionId = selectedSessionId;
    if (!workspaceId || !sessionId) return 0;
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace || loading) return 0;
    /*
      The app's own configured client, not one built here.

      A freshly constructed client looked equivalent and was not: the fork request never reached the
      server at all, with no error and no log line, while the panel sat at "working" forever. Whatever that
      client was missing, the client the rest of the session already uses has it - the app's own fork
      button goes through this one.
    */
    const client = opencodeClient;
    if (!client) return 0;

    const catalogue: FanOutModel[] = Object.entries(providerCatalog ?? {}).flatMap(
      ([providerID, models]) => Object.keys(models ?? {}).map((modelID) => ({ providerID, modelID })),
    );
    const current = getSessionModelSelection(sessionId)?.model ?? local.prefs.defaultModel;
    const explicit = "models" in command ? command.models : null;
    const slots = explicit
      ? explicit.map((model, index) => ({ index, model, label: model.modelID }))
      : command.kind === "compare"
        ? compareSlots(
            (command as { modelIDs: string[] }).modelIDs.flatMap((id: string) => {
              const wanted = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
              const found = catalogue.find((entry) => entry.modelID === wanted);
              return found ? [found] : [];
            }),
          )
      : resolveParaphraseSlots({
            model: current?.providerID && current.modelID
              ? { providerID: current.providerID, modelID: current.modelID }
              : null,
            count: (command as { count?: number }).count,
          });
    if (slots.length === 0) return 0;

    /*
      What each variant is actually sent. Compare re-asks the question; paraphrase is handed the answer with
      an instruction to rewrite it and keep every fact.
    */
    const requestText =
      command.kind === "paraphrase" ? buildParaphrasePrompt(command.prompt) : command.prompt;
    let run = startingRun({ kind: command.kind, prompt: command.prompt, slots });
    variantRunRef.current = run;
    setVariantRun(run);
    const publish = (next: VariantRun) => {
      run = next;
      variantRunRef.current = next;
      setVariantRun(next);
    };

    await Promise.all(
      slots.map(async (slot) => {
        try {
          /*
            Compare FORKS the session and re-asks the question, so each model answers it independently.
            Paraphrase opens a FRESH session and hands over the answer to rewrite: a rewrite needs the text
            and nothing else, and re-asking the question would produce a different answer, which is not a
            paraphrase of the first one.
          */
          const target =
            command.kind === "paraphrase"
              ? (unwrap(await client.session.create({})) as { id: string })
              : (unwrap(await client.session.fork({ sessionID: sessionId })) as { id: string });
          publish(withVariant(run, slot.index, { sessionID: target.id, status: "running" }));
          // Not awaited: each variant answers at its own pace, and the poll below is what notices.
          void client.session.promptAsync({
            sessionID: target.id,
            model: { providerID: slot.model.providerID, modelID: slot.model.modelID },
            variant: slot.model.variant ?? undefined,
            parts: [{ type: "text", text: requestText }],
          });
        } catch (error) {
          publish(
            withVariant(run, slot.index, {
              status: "failed",
              error: error instanceof Error ? error.message : undefined,
            }),
          );
        }
      }),
    );

    /*
     * Poll until every variant is settled, with a ceiling. A run that never finishes must still stop
     * asking: the panel then shows what did arrive, which is more useful than a spinner with no end.
     */
    /*
      The poll also stops when this run is no longer the current one. Without that check a discarded run
      kept asking for its forks for the full five minutes, and once the user deleted those sessions the
      log filled with 404s from a run nobody was looking at any more.
    */
    const deadline = Date.now() + 5 * 60_000;
    while (!runSettled(run) && Date.now() < deadline && variantRunRef.current === run) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      for (const variant of run.variants) {
        if (variant.status !== "running" || !variant.sessionID) continue;
        try {
          const messages = unwrap(
            await client.session.messages({ sessionID: variant.sessionID, limit: 20 }),
          ) as never[];
          const text = finishedAssistantText(messages);
          if (text) {
            publish(withVariant(run, variant.index, { status: "done", text }));
          } else {
            /*
              Show the answer as it is written. A column that says "working" for forty seconds and then
              dumps a finished essay reads as broken, and the main transcript streams in the same window.
              Only the "done" branch above makes a variant adoptable, so streaming text here cannot be
              mistaken for a finished answer.
            */
            const partial = partialAssistantText(messages);
            if (partial && partial !== run.variants[variant.index]?.text) {
              publish(withVariant(run, variant.index, { text: partial }));
            }
          }
        } catch {
          // A single failed poll is not a failed variant; the next tick tries again until the deadline.
        }
      }
    }
    return slots.length;
  }, [endpointForWorkspace, loading, local.prefs.defaultModel, providerCatalog, selectedSessionId, selectedWorkspaceId, workspaces]);

  /**
   * Keep the chosen answer by continuing in its fork, and delete the rest.
   *
   * Navigating to the fork is what makes the answer the session's answer: the conversation proceeds from
   * it. The discarded forks are removed after the navigation, and a failure to remove one is swallowed,
   * because a fork left behind is untidy while a lost adoption is the user's work.
   */
  /**
   * Throw a run away, including the forks it made.
   *
   * Clearing the panel alone left the forks on the server, and a refresh then put them back in the
   * sidebar: three rows for one turn, which the user had to delete by hand. A fork that exists for the
   * length of one choice must not outlive the choice.
   */
  const handleDiscardVariantRun = useCallback(async () => {
    const run = variantRun;
    setVariantRun(null);
    variantRunRef.current = null;
    if (!run) return;
    const client = opencodeClient;
    if (!client) return;
    for (const variant of run.variants) {
      if (!variant.sessionID) continue;
      try {
        await client.session.delete({ sessionID: variant.sessionID });
      } catch {
        // Untidy, not broken: the sidebar filter already hid it, and a refresh will show it again.
      }
    }
    void refreshRouteState();
  }, [endpointForWorkspace, refreshRouteState, selectedWorkspaceId, variantRun, workspaces]);

  const handleAdoptVariant = useCallback(async (index: number) => {
    const run = variantRun;
    if (!run) return;
    const chosen = run.variants.find((variant) => variant.index === index);
    if (!chosen?.sessionID) return;
    const workspaceId = selectedWorkspaceId;
    setVariantRun(null);
    variantRunRef.current = null;
    writeLastSessionFor(workspaceId, chosen.sessionID);
    rememberPendingCreatedSession(workspaceId, chosen.sessionID);
    navigateToWorkspaceSession(workspaceId, chosen.sessionID);
    if (opencodeClient) {
      for (const sessionID of discardedSessions(run, index)) {
        try {
          await opencodeClient.session.delete({ sessionID });
        } catch {
          // Untidy, not broken.
        }
      }
    }
    void refreshRouteState();
  }, [endpointForWorkspace, navigateToWorkspaceSession, refreshRouteState, rememberPendingCreatedSession, selectedWorkspaceId, variantRun, workspaces]);

  /**
   * Ask one more model to answer the turn already on screen.
   *
   * This is the control the user actually reaches for: call one model, then another, then keep whichever
   * answered better. Picking the SAME model again is the paraphrase case of the same action, so there is
   * one path rather than a compare feature and a shuffle feature.
   *
   * The prompt is the last user message in this session, so the new answer is an answer to the same
   * question rather than to a fresh one. The fork is taken from the message BEFORE that, which is what
   * makes it a second answer to the turn instead of a follow-up to the first answer.
   */
  const handleAnotherAnswer = useCallback(
    (model: { providerID: string; modelID: string }, kind: "compare" | "paraphrase", text: string) => {
      // Remembered so the same action is one click next time; the caret is how it gets changed.
      local.setPrefs((previous) => ({ ...previous, variantModel: model }));
      void handleVariantRun({ kind, prompt: text, models: [model] });
    },
    [handleVariantRun, local],
  );

  // Latest session-list state for prev/next session tab navigation. The
  // `options` field is updated by `onSessionTabsChange` from SessionPage so we
  // only cycle through tabs the user actually opened (not artifact sessions).
  // The remaining fields are refreshed during render.
  const sessionTabNavRef = useRef<{
    options: OpenSessionTab[];
    workspaceId: string;
    sessionId: string | null;
    navigate: (workspaceId: string, sessionId?: string | null) => void;
  }>({ options: [], workspaceId: "", sessionId: null, navigate: () => {} });

  const goToSessionTabByOffset = useCallback((offset: number) => {
    const { options, workspaceId, sessionId, navigate } = sessionTabNavRef.current;
    const scoped = options.filter((option) => option.workspaceId === workspaceId);
    if (scoped.length === 0) return;
    const currentIndex = sessionId
      ? scoped.findIndex((option) => option.sessionId === sessionId)
      : -1;
    const nextIndex = currentIndex === -1
      ? offset > 0 ? 0 : scoped.length - 1
      : (currentIndex + offset + scoped.length) % scoped.length;
    const target = scoped[nextIndex];
    if (!target || target.sessionId === sessionId) return;
    navigate(target.workspaceId, target.sessionId);
  }, []);

  const goToNextSessionTab = useCallback(() => goToSessionTabByOffset(1), [goToSessionTabByOffset]);
  const goToPrevSessionTab = useCallback(() => goToSessionTabByOffset(-1), [goToSessionTabByOffset]);

  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    sessionSearchOpen,
    setSessionSearchOpen,
    terminalOpen,
    setTerminalOpen,
    sessionNumberShortcuts,
  } = useShellShortcuts({
    canCreateTask,
    workspaceId: selectedWorkspaceId,
    onCreateTask: (workspaceId: string) => void handleCreateTaskInWorkspace(workspaceId),
    onNextSessionTab: goToNextSessionTab,
    onPrevSessionTab: goToPrevSessionTab,
  });
  useReactRenderWatchdog("SessionRoute", {
    selectedSessionId,
    selectedWorkspaceId,
    loading,
    workspaceCount: workspaces.length,
    sessionGroupCount: Object.keys(sessionsByWorkspaceId).length,
    commandPaletteOpen,
    modelPickerOpen: modelPicker.open,
  });

  const navigateToSessionForControl = useCallback((sessionId: string) => {
    const owner = Object.entries(sessionsByWorkspaceId).find(([, sessions]) =>
      (sessions ?? []).some((session) => session?.id === sessionId),
    )?.[0];
    navigateToWorkspaceSession(owner || selectedWorkspaceId, sessionId);
  }, [navigateToWorkspaceSession, selectedWorkspaceId, sessionsByWorkspaceId]);

  const navigateToSessionRootForControl = useCallback(() => {
    navigateToWorkspaceSession(selectedWorkspaceId);
  }, [navigateToWorkspaceSession, selectedWorkspaceId]);

  const openModelPickerForControl = useCallback(() => {
    modelPicker.setOpen(true);
  }, []);

  useSessionControlActions({
    workspaces,
    sessionsByWorkspaceId,
    selectedWorkspaceId,
    selectedWorkspaceRoot,
    selectedSessionId,
    canCreateTask,
    redrobClient: client,
    opencodeClient,
    navigateToSession: navigateToSessionForControl,
    navigateToSessionRoot: navigateToSessionRootForControl,
    createTaskInWorkspace: handleCreateTaskInWorkspace,
    openModelPicker: openModelPickerForControl,
    refreshRouteState,
  });

  const seedUnavailableModelControlAction = useMemo<RedrobControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;
    return {
      id: "eval.model_not_available.seed",
      label: "Seed an unavailable selected model",
      description: "Dev-only eval hook that selects a missing model and returns an available model to recover with.",
      sideEffect: "mutation",
      disabled: !opencodeClient,
      execute: async () => {
        if (!opencodeClient) return { ok: false, error: "Redrob Code client is not connected." };

        const providerList = await ensureProviderListQuery(getReactQueryClient(), {
          client: opencodeClient,
          baseUrl: opencodeBaseUrl,
          directory: selectedWorkspaceRoot || undefined,
          force: true,
        });
        const filteredProviderList = filterProviderList(providerList, disabledProviderIds);
        const availableProvider = getConnectedProviderItems(filteredProviderList)
          .find((provider) => Object.keys(provider.models ?? {}).length > 0);
        const availableModelId = availableProvider ? Object.keys(availableProvider.models ?? {})[0] : undefined;
        const availableModel = availableProvider && availableModelId
          ? availableProvider.models[availableModelId]
          : undefined;

        if (!availableProvider || !availableModelId || !availableModel) {
          return { ok: false, error: "No available connected model found for eval recovery." };
        }

        const unavailableModel = nextEvalUnavailableModel(local.prefs.defaultModel);
        modelPicker.setQuery("");
        modelPicker.setRecentProviderIds(new Set());
        local.setPrefs((previous) => ({
          ...previous,
          defaultModel: unavailableModel,
          modelVariant: null,
        }));

        return {
          unavailableModel,
          availableModel: {
            providerID: availableProvider.id,
            providerName: availableProvider.name || availableProvider.id,
            modelID: availableModelId,
            title: availableModel.name || availableModelId,
          },
          sessionId: selectedSessionId,
          workspaceId: selectedWorkspaceId,
        };
      },
    };
  }, [disabledProviderIds, local, modelPicker.setQuery, modelPicker.setRecentProviderIds, opencodeBaseUrl, opencodeClient, selectedSessionId, selectedWorkspaceId, selectedWorkspaceRoot]);
  useControlAction(seedUnavailableModelControlAction);

  const seedActiveSessionSidebarControlAction = useMemo<RedrobControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;
    return {
      id: "eval.session_sidebar.seed_active",
      label: "Show the selected session as active",
      description: "Dev-only eval hook that displays the selected session activity spinner.",
      sideEffect: "mutation",
      disabled: !selectedWorkspaceId || !selectedSessionId,
      execute: () => {
        if (!selectedWorkspaceId || !selectedSessionId) {
          return { ok: false, error: "No session is selected." };
        }
        useSessionActivityStore.getState().setRunStatus(selectedWorkspaceId, selectedSessionId, "running");
        return { workspaceId: selectedWorkspaceId, sessionId: selectedSessionId };
      },
    };
  }, [selectedSessionId, selectedWorkspaceId]);
  useControlAction(seedActiveSessionSidebarControlAction);

  const commandPaletteControlAction = useMemo<RedrobControlAction>(() => ({
    id: "command_palette.open",
    label: "Open the command palette",
    description: "Open the in-app command palette so the next choice is visible.",
    effects: { data: "none", ui: "dialog", external: false },
    sideEffect: "none",
    execute: () => setCommandPaletteOpen(true),
  }), []);
  useControlAction(commandPaletteControlAction);

  const addProviderControlAction = useMemo<RedrobControlAction>(() => ({
    id: "settings.provider.add",
    label: "Add a model provider",
    description: "Open the provider connection modal, optionally pre-filtered to a specific provider.",
    sideEffect: "mutation",
    requiresArgs: false,
    args: [
      { name: "providerId", type: "string" as const, required: false, description: "Provider id to pre-select, e.g. 'anthropic', 'openai', 'google'." },
    ],
    execute: async (rawArgs: unknown) => {
      const providerId = typeof rawArgs === "object" && rawArgs !== null
        ? (rawArgs as Record<string, unknown>).providerId
        : undefined;
      const preferred = typeof providerId === "string" ? providerId.trim() : undefined;
      await sessionProviderAuthStore.openProviderAuthModal(
        preferred ? { preferredProviderId: preferred } : undefined,
      );
      return { ok: true, opened: "provider_auth_modal", preferredProviderId: preferred ?? null };
    },
  }), [sessionProviderAuthStore]);
  useControlAction(addProviderControlAction);

  const handleOpenProviderAuth = useCallback(() => {
    // Pre-workspace (chat-first) there is no opencode client yet, so the
    // modal cannot load auth methods — fall back to the AI Providers page.
    void sessionProviderAuthStore.openProviderAuthModal({ returnFocusTarget: "composer" }).catch(() => {
      handleOpenSettings("/settings/ai");
    });
  }, [handleOpenSettings, sessionProviderAuthStore]);

  // "Connect more providers" in the compact model picker (and anything else
  // outside this route's prop tree) requests the provider auth modal here.
  useEffect(() => {
    const handler = () => handleOpenProviderAuth();
    window.addEventListener(openProviderAuthEvent, handler);
    return () => window.removeEventListener(openProviderAuthEvent, handler);
  }, [handleOpenProviderAuth]);

  const paletteSessionOptions = useMemo(
    () => buildCommandPaletteSessions(workspaces, sessionsByWorkspaceId, selectedWorkspaceId),
    [sessionsByWorkspaceId, selectedWorkspaceId, workspaces],
  );

  // Refresh the non-tab fields of the nav ref during render. The `options`
  // field is maintained by the `onSessionTabsChange` callback from SessionPage.
  sessionTabNavRef.current = {
    options: sessionTabNavRef.current.options,
    workspaceId: selectedWorkspaceId,
    sessionId: selectedSessionId,
    navigate: navigateToWorkspaceSession,
  };

  const paletteSessionGroups = useMemo<SessionGroupOption[]>(
    () => selectedWorkspaceGroupState?.groups ?? [],
    [selectedWorkspaceGroupState?.groups],
  );

  const currentSessionForGroupMove = useMemo(() => {
    if (!selectedWorkspaceId || !selectedSessionId) return null;
    return paletteSessionOptions.find(
      (session) => session.workspaceId === selectedWorkspaceId && session.sessionId === selectedSessionId,
    ) ?? null;
  }, [paletteSessionOptions, selectedSessionId, selectedWorkspaceId]);

  const currentSessionGroupId = selectedSessionId
    ? selectedWorkspaceGroupState?.assignments[selectedSessionId] ?? null
    : null;

  const handleMoveCurrentSessionToGroup = useCallback((groupId: string) => {
    if (!selectedWorkspaceId || !selectedSessionId) return;
    assignSessionToGroup(selectedWorkspaceId, selectedSessionId, groupId);
  }, [assignSessionToGroup, selectedSessionId, selectedWorkspaceId]);

  const sessionSearchFetcher = useMemo<SessionMessageFetcher | null>(() => {
    if (!client) return null;
    // Cap the transcript fetch to keep multi-workspace scans fast; matches in
    // anything older than the most recent 400 messages are traded away for
    // responsiveness.
    return async (workspaceId: string, sessionId: string) =>
      (await client.getSessionMessages(workspaceId, sessionId, { limit: 400 })).items;
  }, [client]);

  const sessionSearchPaletteItem = useMemo<PaletteItem>(() => ({
    id: "session-search.open",
    title: t("palette.search_messages"),
    detail: t("palette.search_messages_detail"),
    meta: "Cmd/Ctrl+Shift+F",
    searchText: "search find sessions messages history transcript content",
    action: () => {
      setCommandPaletteOpen(false);
      setSessionSearchOpen(true);
    },
  }), []);

  const sessionFindPaletteItem = useMemo<PaletteItem | null>(() => {
    if (!selectedSessionId) return null;
    return {
      id: "session-find.open",
      title: t("find.in_conversation"),
      detail: t("palette.find_in_conversation_detail"),
      meta: "Cmd/Ctrl+F",
      searchText: "find search current conversation session messages transcript",
      action: () => {
        setCommandPaletteOpen(false);
        useSessionFindStore.getState().openFind({ sessionId: selectedSessionId });
      },
    };
  }, [selectedSessionId]);

  const terminalPaletteItems = useMemo<PaletteItem[]>(() => platform.capabilities.terminal ? [
    {
      id: "terminal.toggle",
      title: terminalOpen ? "Hide terminal" : "Show terminal",
      detail: t("palette.toggle_terminal_detail"),
      meta: "Cmd/Ctrl+J",
      searchText: "terminal shell command line console show hide toggle",
      action: () => {
        setCommandPaletteOpen(false);
        setTerminalOpen((value) => !value);
      },
    },
  ] : [], [platform.capabilities.terminal, terminalOpen]);

  const developerModePaletteItem = useMemo<PaletteItem>(() => ({
    id: "developer-mode.toggle",
    title: developerMode ? t("settings.disable_developer_mode") : t("settings.enable_developer_mode"),
    detail: t("settings.developer_mode_desc"),
    meta: developerMode ? "On" : "Off",
    searchText: "developer dev mode debug diagnostics toggle enable disable",
    action: () => {
      setCommandPaletteOpen(false);
      setDeveloperMode((current) => {
        const next = !current;
        try { window.localStorage.setItem("redrob.developerMode", next ? "1" : "0"); } catch {}
        return next;
      });
    },
  }), [developerMode]);

  const buildCommandDiagnosticsBundle = useCallback(() => buildDiagnosticsBundleJson({
    anyActiveRuns: activeReloadBlockingSessions.length > 0,
    canReloadWorkspace: reloadCoordinator.canReloadWorkspaceEngine,
    clientConnected: canCreateTask,
    developerMode,
    hostInfo: redrobServerHostInfoState,
    redrobServerStatus: client ? "connected" : "disconnected",
    redrobServerUrl: baseUrl,
    runtimeWorkspaceId: selectedWorkspaceEndpoint?.workspaceId ?? null,
  }), [
    activeReloadBlockingSessions.length,
    baseUrl,
    canCreateTask,
    client,
    developerMode,
    redrobServerHostInfoState,
    reloadCoordinator.canReloadWorkspaceEngine,
    selectedWorkspaceEndpoint?.workspaceId,
  ]);

  const diagnosticsCopyPaletteItem = useMemo<PaletteItem>(() => ({
    id: "diagnostics.copy",
    title: t("session.cmd_diagnostics_copy_title"),
    detail: t("session.cmd_diagnostics_copy_detail"),
    searchText: "logs share diagnostics debug support bundle troubleshoot copy report issue",
    action: async () => {
      setCommandPaletteOpen(false);
      try {
        const json = await buildCommandDiagnosticsBundle();
        await navigator.clipboard.writeText(json);
        toast.success(t("session.diagnostics_copied"));
      } catch (error) {
        toast.error(t("session.diagnostics_failed"), { description: describeRouteError(error) });
      }
    },
  }), [buildCommandDiagnosticsBundle]);

  const diagnosticsExportPaletteItem = useMemo<PaletteItem>(() => ({
    id: "diagnostics.export",
    title: t("session.cmd_diagnostics_export_title"),
    detail: t("session.cmd_diagnostics_export_detail"),
    searchText: "logs export diagnostics debug support bundle save file json download",
    action: async () => {
      setCommandPaletteOpen(false);
      try {
        const json = await buildCommandDiagnosticsBundle();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        downloadTextAsFile(`redrob-diagnostics-${timestamp}.json`, json, "application/json");
        toast.success(t("session.diagnostics_exported"));
      } catch (error) {
        toast.error(t("session.diagnostics_failed"), { description: describeRouteError(error) });
      }
    },
  }), [buildCommandDiagnosticsBundle]);

  const nextSessionTabPaletteItem = useMemo<PaletteItem>(() => ({
    id: "session-tab.next",
    title: t("palette.next_session_tab"),
    detail: t("palette.next_session_tab_detail"),
    meta: "Cmd/Ctrl+T",
    searchText: "next session tab switch forward",
    action: () => {
      setCommandPaletteOpen(false);
      goToNextSessionTab();
    },
  }), [goToNextSessionTab]);

  const prevSessionTabPaletteItem = useMemo<PaletteItem>(() => ({
    id: "session-tab.previous",
    title: t("palette.previous_session_tab"),
    detail: t("palette.previous_session_tab_detail"),
    meta: "Cmd/Ctrl+Shift+T",
    searchText: "previous session tab switch back",
    action: () => {
      setCommandPaletteOpen(false);
      goToPrevSessionTab();
    },
  }), [goToPrevSessionTab]);

  const reloadConfigPaletteItem = useMemo<PaletteItem>(() => ({
    id: "reload-opencode-config",
    title: t("session.cmd_reload_config_title"),
    detail: t("session.cmd_reload_config_detail"),
    meta: reloadCoordinator.canReloadWorkspaceEngine
      ? t("config.reload_engine")
      : t("system.reload_unavailable"),
    searchText: "reload opencode config providers models mcp jsonc refresh re-read engine restart",
    action: () => {
      setCommandPaletteOpen(false);
      if (!reloadCoordinator.canReloadWorkspaceEngine) return;
      void reloadCoordinator.reloadWorkspaceEngine();
    },
  }), [reloadCoordinator.canReloadWorkspaceEngine, reloadCoordinator.reloadWorkspaceEngine]);

  const handleReorderWorkspaces = useCallback((workspaceIds: string[]) => {
    const activeWorkspaceIds = new Set(workspacesRef.current.map((workspace) => workspace.id));
    const nextOrderIds: string[] = [];
    const nextOrderIdSet = new Set<string>();

    for (const id of workspaceIds) {
      if (!activeWorkspaceIds.has(id) || nextOrderIdSet.has(id)) continue;
      nextOrderIds.push(id);
      nextOrderIdSet.add(id);
    }

    for (const workspace of workspacesRef.current) {
      if (nextOrderIdSet.has(workspace.id)) continue;
      nextOrderIds.push(workspace.id);
      nextOrderIdSet.add(workspace.id);
    }

    workspaceOrderIdsRef.current = nextOrderIds;
    setWorkspaceOrderIds(nextOrderIds);
    writeWorkspaceOrderIds(nextOrderIds);
    setWorkspaces((current) => orderRouteWorkspaces(current, nextOrderIds));
  }, []);

  const handleArchiveSession = useCallback(
    async (sessionId: string, archived: boolean) => {
      if (!opencodeClient) return;
      try {
        await setSessionArchived(
          opencodeClient,
          sessionId,
          archived,
          selectedWorkspaceRoot || undefined,
        );
        await refreshRouteState();
      } catch (error) {
        console.error("[session-route] archive session failed", error);
        toast.error(
          archived
            ? t("session_management.archive_failed")
            : t("session_management.unarchive_failed"),
          { description: describeRouteError(error) },
        );
      }
    },
    [opencodeClient, refreshRouteState, selectedWorkspaceRoot],
  );

  const handleCreateWorkspace = useCallback(async (
    preset: WorkspacePreset,
    folder: string | null,
    options?: CreateWorkspaceOptions,
  ) => {
    if (!folder) return;
    const projectLabel = options?.projectLabel?.trim() ?? "";
    setCreateWorkspaceBusy(true);
    setCreateWorkspaceError(null);
    try {
      const workspaceName = folderNameFromPath(folder);
      let list: WorkspaceList | null = null;
      let createdOnServer = false;
      if (client) {
        list = await client
          .createLocalWorkspace({ folderPath: folder, name: workspaceName, preset })
          .then((serverList) => {
            createdOnServer = true;
            return serverList;
          })
          .catch(() => null);
      }
      if (!list) {
        throw new Error(t("workspace.server_unavailable_create"));
      }
      const createdId = resolveWorkspaceListSelectedId(list) || list.workspaces[list.workspaces.length - 1]?.id || "";
      let targetWorkspaceId = createdId;
      let targetWorkspace = list.workspaces.find((workspace: WorkspaceInfo) => workspace.id === createdId) ?? null;
      if (createdId) {
        await workspaceSetSelected(createdId).catch(() => undefined);
        await workspaceSetRuntimeActive(createdId).catch(() => undefined);
      }
      // First workspace on a fresh install: the Redrob Cowork server was started
      // engine-less (it only spawns OpenCode at boot when a workspace already
      // exists), so sessions would hang forever. This boots the engine when
      // it isn't running, same as the old /welcome flow did.
      let sessionBaseUrl = baseUrl;
      let sessionToken = token;
      if (targetWorkspace && isDesktopRuntime()) {
        await ensureDesktopLocalRedrobConnection({
          route: "session",
          workspace: targetWorkspace,
          allWorkspaces: list.workspaces,
        }).catch(() => undefined);
        // The engine boot can restart the server with fresh tokens; re-resolve
        // so the first-session creation below doesn't use stale credentials.
        const fresh = await resolveRedrobConnection().catch(() => null);
        if (fresh?.normalizedBaseUrl && fresh.resolvedToken) {
          sessionBaseUrl = fresh.normalizedBaseUrl;
          sessionToken = fresh.resolvedToken;
        }
      }
      setCreateWorkspaceOpen(false);
      // Mark onboarding complete so the /welcome redirect never fires again.
      local.setPrefs((prev) => ({ ...prev, hasCompletedOnboarding: true }));
      await refreshRouteState();
      if (targetWorkspaceId) {
        const workspacePath = targetWorkspace?.path?.trim() || folder;
        const firstTaskPrompt = options?.firstTaskPrompt?.trim() ?? "";
        const firstTaskAttachments = options?.firstTaskAttachments ?? [];
        // A workspace registry mutation must not eagerly instantiate an
        // OpenCode directory. Chat-first creation still needs a session for
        // its supplied prompt; ordinary creation lands on the New task state.
        const session = createdOnServer && sessionBaseUrl && sessionToken && (firstTaskPrompt || firstTaskAttachments.length > 0)
          ? await createClient(
              `${(buildRedrobWorkspaceBaseUrl(sessionBaseUrl, targetWorkspaceId) ?? sessionBaseUrl).replace(/\/+$/, "")}/opencode`,
              workspacePath || undefined,
              { token: sessionToken, mode: "redrob" },
            ).session.create({ directory: workspacePath || undefined })
              .then((result) => unwrap(result))
              .catch(() => null)
          : null;
        setLegacySelectedWorkspaceId(targetWorkspaceId);
        writeActiveWorkspaceId(targetWorkspaceId);
        if (projectLabel) {
          writeWorkspaceProjectDimension(targetWorkspaceId, {
            label: projectLabel,
          });
        }
        captureAnalyticsEvent("workspace_created", { workspace_type: "local" });
        if (session?.id) {
          captureAnalyticsEvent("task_created", { source: "workspace_created", workspace_type: "local" });
          if (firstTaskPrompt) {
            // Attachment chips only survive in-memory (File objects), so the
            // persisted fallback draft drops their tokens.
            saveSessionDraft(targetWorkspaceId, session.id, { text: firstTaskPrompt.replace(/\[attachment [^\]]+\]/g, "").trim(), mode: "prompt" });
            // The composer reads its draft from the composer state store, not
            // the persisted draft store — seed both so the prompt shows up.
            useComposerStateStore.getState().setDraft(session.id, firstTaskPrompt);
            if (firstTaskAttachments.length) {
              useComposerStateStore.getState().setAttachments(session.id, firstTaskAttachments);
            }
            // One-step run: the session surface sends the seeded draft itself.
            markComposerAutoSend(session.id);
          }
          writeLastSessionFor(targetWorkspaceId, session.id);
          rememberPendingCreatedSession(targetWorkspaceId, session.id);
          setSessionsByWorkspaceId((current) => {
            const next = {
              ...current,
              [targetWorkspaceId]: [session, ...(current[targetWorkspaceId] ?? [])],
            };
            sessionsByWorkspaceIdRef.current = next;
            return next;
          });
        }
        navigateToWorkspaceSession(targetWorkspaceId, session?.id ?? null, { replace: true });
        if (session?.id) focusPromptSoon();
      }
    } catch (error) {
      setCreateWorkspaceError(describeWorkspaceCreateError(error));
    } finally {
      setCreateWorkspaceBusy(false);
    }
  }, [baseUrl, client, local, navigateToWorkspaceSession, refreshRouteState, rememberPendingCreatedSession, token]);

  /**
   * Chat-first onboarding: the empty-state composer creates a default chat
   * workspace under the user's home folder instead of asking where to put
   * it. Falls back to the create-workspace modal off desktop.
   */
  const handleChatFirstTask = useCallback((prompt: string, attachments?: ComposerAttachment[]) => {
    void (async () => {
      if (!isDesktopRuntime()) {
        handleOpenCreateWorkspace();
        return;
      }
      const home = await getDesktopHomeDir().catch(() => "");
      if (!home) {
        handleOpenCreateWorkspace();
        return;
      }
      const folder = await joinDesktopPath(home, "Redrob Cowork Chat").catch(() => "");
      if (!folder) {
        handleOpenCreateWorkspace();
        return;
      }
      await handleCreateWorkspace("starter", folder, { firstTaskPrompt: prompt, firstTaskAttachments: attachments ?? [] });
    })();
  }, [handleCreateWorkspace, handleOpenCreateWorkspace]);

  const createWorkspaceControlAction = useMemo<RedrobControlAction>(() => ({
    id: "workspace.create",
    label: "Create a local workspace",
    description: "Create a workspace at the given folder path without showing the file picker dialog, optionally labeling its project for analytics.",
    sideEffect: "mutation",
    requiresArgs: true,
    args: [
      { name: "path", type: "string", required: true, description: "Absolute folder path for the new workspace." },
      { name: "projectLabel", type: "string", required: false, description: "Optional project name used to group the workspace's sessions in analytics." },
    ],
    execute: async (args) => {
      const parsed = args as { path?: string; projectLabel?: string } | undefined;
      const folder = parsed?.path?.trim();
      if (!folder) return { ok: false, error: "path is required" };
      const trimmedLabel = parsed?.projectLabel?.trim() ?? "";
      await handleCreateWorkspace("starter", folder, trimmedLabel ? { projectLabel: trimmedLabel } : undefined);
      return { path: folder };
    },
  }), [handleCreateWorkspace]);
  useControlAction(createWorkspaceControlAction);

  return (
    <WorkspaceProvider
      client={opencodeClient}
      opencodeBaseUrl={opencodeBaseUrl}
      redrobServerClient={selectedWorkspaceEndpoint?.client ?? null}
      workspaceId={selectedWorkspaceEndpoint?.workspaceId ?? ""}
      selectedWorkspaceRoot={selectedWorkspaceRoot}
    >
    {opencodeClient && selectedWorkspaceEndpoint && opencodeBaseUrl && selectedWorkspaceServerToken ? (
      <ReactSessionRuntime
        // Use the server-side workspace id (the one without the `rem_`
        // prefix) so the React Query cache keys session-sync writes match
        // the keys SessionSurface reads from. Otherwise events arrive but
        // the UI never sees them and gets stuck on "thinking".
        workspaceId={selectedWorkspaceEndpoint.workspaceId}
        sessionId={selectedSessionId}
        activeSessionIds={activeSelectedWorkspaceSessionIds}
        opencodeBaseUrl={opencodeBaseUrl}
        redrobToken={selectedWorkspaceServerToken}
        onSessionCreated={handleRuntimeSessionCreated}
        onSessionUpdated={handleRuntimeSessionUpdated}
        onSessionDeleted={handleRuntimeSessionDeleted}
      />
    ) : null}
    <SessionPage
      sessionNumberShortcuts={sessionNumberShortcuts}
      selectedSessionId={selectedSessionId}
      selectedWorkspaceId={selectedWorkspaceId}
      selectedWorkspaceDisplay={selectedWorkspace ? {
        id: selectedWorkspace.id,
        name: selectedWorkspace.name ?? undefined,
        displayName: selectedWorkspace.displayNameResolved,
        workspaceType: selectedWorkspace.workspaceType,
      } : { workspaceType: "local" }}
      selectedWorkspaceRoot={selectedWorkspaceRoot}
      selectedWorkspaceError={selectedWorkspaceError}
      runtimeWorkspaceId={selectedWorkspaceEndpoint?.workspaceId || null}
      opencodeBaseUrl={opencodeBaseUrl}
      workspaces={workspaces}
      clientConnected={canCreateTask}
      redrobServerStatus={client ? "connected" : "disconnected"}
      redrobServerClient={selectedWorkspaceEndpoint?.client ?? client}
      environmentClient={client}
      redrobServerToken={selectedWorkspaceServerToken}
      developerMode={developerMode}
      headerStatus={canCreateTask ? t("status.connected") : (modelUnavailableMessage ?? t("session.loading_detail"))}
      busyHint={effectiveLoading ? t("session.loading_detail") : null}
      startupPhase={effectiveLoading ? "nativeInit" : "ready"}
      providerConnectedIds={providerConnectedIds}
      hasUsableModel={hasUsableModel}
      providers={providers}
      mcpConnectedCount={mcpConnectedCount}
      onSendFeedback={() => {
        platform.openLink(
          buildFeedbackUrl({
            entrypoint: "status-bar",
          }),
        );
      }}
      onOpenSettings={() => handleOpenSettings("/settings/general")}
      onOpenExtensions={() => handleOpenExtensions()}
      onOpenProviderAuth={handleOpenProviderAuth}
      onChatFirstTask={handleChatFirstTask}
      chatFirstBusy={createWorkspaceBusy}
      newTaskComposer={newTaskComposerContext}
      providerAuthModal={sessionProviderAuthSnapshot.providerAuthModalOpen ? {
        open: true,
        loading: false,
        submitting: sessionProviderAuthSnapshot.providerAuthBusy,
        error: sessionProviderAuthSnapshot.providerAuthError,
        preferredProviderId: sessionProviderAuthSnapshot.providerAuthPreferredProviderId,
        workerType: sessionProviderAuthSnapshot.providerAuthWorkerType,
        providers: sessionProviderAuthSnapshot.providerAuthProviders,
        connectedProviderIds: providerConnectedIds,
        authMethods: sessionProviderAuthSnapshot.providerAuthMethods,
        onSelect: sessionProviderAuthStore.startProviderAuth,
        onSubmitApiKey: async (providerId, apiKey) => {
          const result = await sessionProviderAuthStore.submitProviderApiKey(providerId, apiKey);
          modelPicker.setRecentProviderIds(new Set([providerId]));
          modelPicker.setQuery("");
          modelPicker.setOpen(true);
          return result;
        },
        onSubmitOAuth: sessionProviderAuthStore.completeProviderAuthOAuth,
        onRefreshProviders: sessionProviderAuthStore.refreshProviders,
        onClose: () => sessionProviderAuthStore.closeProviderAuthModal(),
      } : null}
      settingsSlot={
        <SettingsSurface
          embedded
          initialPath="extensions"
          workspaceId={selectedWorkspaceId}
          onClose={() => {
            try {
              window.dispatchEvent(new CustomEvent("redrob-close-right-pane"));
            } catch {
              // ignore
            }
          }}
        />
      }
      terminalOpen={terminalOpen}
      onTerminalOpenChange={setTerminalOpen}
      onSessionTabsChange={(tabs) => {
        sessionTabNavRef.current = { ...sessionTabNavRef.current, options: tabs };
      }}
      sidebar={{
        workspaceSessionGroups,
        selectedWorkspaceId,
        selectedSessionId,
        developerMode: false,
        sessionStatusById: sidebarSessionStatusById,
        connectingWorkspaceId: null,
        workspaceConnectionStateById,
        newTaskDisabled: !canCreateTask,
        sidebarHydratedFromCache: Object.values(sessionsByWorkspaceId).some((list) => list.length > 0),
        startupPhase: effectiveLoading ? "nativeInit" : "ready",
        onSelectWorkspace: async (workspaceId) => {
          if (workspaceId === selectedWorkspaceId) return true;
          setLegacySelectedWorkspaceId(workspaceId);
          writeActiveWorkspaceId(workspaceId || null);
          // Route adoption owns desktop persistence and server activation.
          // Centralizing those effects lets rapid navigation coalesce to the
          // last route instead of racing stale IPC and engine reloads.
          // If we remember what the user last opened here and that session
          // still exists in our local list, navigate. Otherwise stay put.
          const remembered = readLastSessionFor(workspaceId);
          if (remembered && remembered !== selectedSessionId) {
            const known = sessionsByWorkspaceId[workspaceId];
            if (known?.some((session) => session?.id === remembered)) {
              navigateToWorkspaceSession(workspaceId, remembered);
            } else {
              navigateToWorkspaceSession(workspaceId);
            }
          } else {
            navigateToWorkspaceSession(workspaceId);
          }
          return true;
        },
        onOpenSession: (workspaceId, sessionId) => {
          setLegacySelectedWorkspaceId(workspaceId);
          writeActiveWorkspaceId(workspaceId || null);
          writeLastSessionFor(workspaceId, sessionId);
          navigateToWorkspaceSession(workspaceId, sessionId);
        },
        onPrefetchSession: () => {},
        onCreateTaskInWorkspace: (workspaceId, groupId) => {
          void handleCreateTaskInWorkspace(workspaceId).then((sessionId) => {
            if (sessionId && groupId) {
              sessionManagementStore.getState().assignGroup(workspaceId, sessionId, groupId);
            }
          });
        },
        onCreateTaskWithPrompt: (workspaceId, prompt, attachments) => {
          void (async () => {
            const workspace = workspaces.find((item) => item.id === workspaceId);
            if (!workspace) return;
            const endpoint = endpointForWorkspace(workspace);
            if (!endpoint?.token) return;
            const workspaceClient = createClient(
              endpoint.opencodeBaseUrl,
              workspace.path?.trim() || undefined,
              { token: endpoint.token, mode: "redrob" },
            );
            try {
              const session = unwrap(
                await workspaceClient.session.create({ directory: workspace.path?.trim() || undefined }),
              );
              const firstTaskPrompt = prompt.trim();
              if (firstTaskPrompt) {
                const firstTaskAttachments = attachments ?? [];
                // Attachment chips only survive in-memory (File objects), so the
                // persisted fallback draft drops their tokens.
                saveSessionDraft(workspaceId, session.id, { text: firstTaskPrompt.replace(/\[attachment [^\]]+\]/g, "").trim(), mode: "prompt" });
                // The composer reads its draft from the composer state store,
                // not the persisted draft store — seed both.
                useComposerStateStore.getState().setDraft(session.id, firstTaskPrompt);
                if (firstTaskAttachments.length) {
                  useComposerStateStore.getState().setAttachments(session.id, firstTaskAttachments);
                }
                // One-step run: the session surface sends the seeded draft itself.
                markComposerAutoSend(session.id);
              }
              writeActiveWorkspaceId(workspaceId || null);
              writeLastSessionFor(workspaceId, session.id);
              rememberPendingCreatedSession(workspaceId, session.id);
              applyLastUsedModelToSession(session.id);
              setSessionsByWorkspaceId((current) => ({
                ...current,
                [workspaceId]: [session, ...(current[workspaceId] ?? [])],
              }));
              navigateToWorkspaceSession(workspaceId, session.id);
              focusPromptSoon();
            } catch {
              // Fall back to normal task creation without prompt
              void handleCreateTaskInWorkspace(workspaceId);
            }
          })();
        },
        onOpenRenameWorkspace: handleOpenRenameWorkspace,
        onShareWorkspace: handleShareWorkspace,
        onRevealWorkspace: (id) => void handleRevealWorkspace(id),
        onRecoverWorkspace: (workspaceId) => runRemoteWorkspaceConnectionCheck(workspaceId, "recover"),
        onTestWorkspaceConnection: (workspaceId) => runRemoteWorkspaceConnectionCheck(workspaceId, "test"),
        onForgetWorkspace: (id) => void handleForgetWorkspace(id),
        onOpenCreateWorkspace: handleOpenCreateWorkspace,
        onOpenSessionSearch: () => setSessionSearchOpen(true),
        onReorderWorkspaces: handleReorderWorkspaces,
      }}
      surface={
        /*
          The variant props are attached here rather than inside `surfaceProps`, because that memo is
          built earlier in this component than the handlers are declared and reading them from it would
          hit the temporal dead zone on first render.
        */
        surfaceProps
          ? {
              ...surfaceProps,
              variantRun,
              onVariantRun: handleVariantRun,
              onAnotherAnswer: handleAnotherAnswer,
              variantRemembered: local.prefs.variantModel ?? null,
              variantModels: Object.entries(providerCatalog ?? {}).flatMap(([providerID, models]) =>
                Object.keys(models ?? {}).map((modelID) => ({ providerID, modelID })),
              ),
              onAdoptVariant: handleAdoptVariant,
              onDismissVariantRun: handleDiscardVariantRun,
            }
          : surfaceProps
      }
      history={{
        canUndo: false,
        canRedo: false,
        busyAction: null,
        onUndo: () => {},
        onRedo: () => {},
      }}
      todos={todos}
      sessionLoadingById={(sessionId) => effectiveLoading && Boolean(sessionId && sessionId === selectedSessionId)}
      shareWorkspaceModal={
        shareWorkspaceState.shareWorkspaceOpen
          ? {
              open: true,
              onClose: shareWorkspaceState.closeShareWorkspace,
              workspaceName: shareWorkspaceState.shareWorkspaceName,
              workspaceDetail: shareWorkspaceState.shareWorkspaceDetail,
              fields: shareWorkspaceState.shareFields,
              remoteAccess:
                isDesktopRuntime() && shareWorkspaceState.shareWorkspace?.workspaceType === "local"
                  ? {
                      enabled: redrobServerSettings.remoteAccessEnabled === true,
                      busy: remoteAccessRestart.busy,
                      error: remoteAccessRestart.error,
                      status: remoteAccessRestart.status,
                      onSave: handleSaveShareRemoteAccess,
                    }
                  : undefined,
              note: shareWorkspaceState.shareNote,
              onExportConfig:
                shareWorkspaceState.exportDisabledReason === null
                  ? () => {
                      const id = shareWorkspaceState.shareWorkspaceId;
                      if (!id) return;
                      void handleExportWorkspaceConfig(id);
                    }
                  : undefined,
              exportDisabledReason: shareWorkspaceState.exportDisabledReason,
            }
          : null
      }
      activePermission={activePermission}
      permissionReplyBusy={permissionReplyBusy}
      respondPermission={respondPermission}
      activeQuestion={activeQuestion}
      questionReplyBusy={questionReplyBusy}
      respondQuestion={respondQuestion}
      safeStringify={safeStringify}
      onRenameSession={
        opencodeClient
          ? async (sessionId, nextTitle) => {
              const trimmed = nextTitle.trim();
              if (!trimmed) return;
              await opencodeClient.session.update({
                sessionID: sessionId,
                title: trimmed,
                directory: selectedWorkspaceRoot || undefined,
              });
              await refreshRouteState();
            }
          : undefined
      }
      onDeleteSession={
        client && selectedWorkspaceId
          ? async (sessionId) => {
              const endpoint = endpointForWorkspace(selectedWorkspace);
              if (!endpoint) return;
              await endpoint.client.deleteSession(endpoint.workspaceId, sessionId);
              if (selectedSessionId === sessionId) {
                navigateToWorkspaceSession(selectedWorkspaceId);
              }
              await refreshRouteState();
            }
          : undefined
      }
      onArchiveSession={opencodeClient ? handleArchiveSession : undefined}
      statusBar={{
        loading: showPreparingStatus,
        reloadBusy: reloadCoordinator.reloadBusy,
        reloadError: reloadCoordinator.reloadError,
      }}
      notFoundMessage={routeNotFoundMessage}
      mainContentTakeover={
        extensionsMainOpen ? (
          <SettingsSurface
            standaloneExtensions
            workspaceId={selectedWorkspaceId || undefined}
          />
        ) : null
      }
      mainContentTitle={extensionsMainOpen ? t("settings.tab_extensions") : undefined}
      extensionsActive={extensionsMainOpen}
      onAccessibleTargetsChange={setPaletteAccessibleTargets}
    />
    <CreateWorkspaceModal
      open={createWorkspaceOpen}
      onClose={() => {
        setCreateWorkspaceOpen(false);
        setCreateWorkspaceError(null);
      }}
      onConfirm={handleCreateWorkspace}
      onPickFolder={async () => singlePickedDirectory(await pickDirectory({ title: t("onboarding.authorize_folder") }))}
      submitting={createWorkspaceBusy}
      localError={createWorkspaceError}
      localDisabled={!platform.capabilities.nativeFilePicker}
      localDisabledReason={
        platform.capabilities.nativeFilePicker
          ? undefined
          : t("app.local_disabled_reason")
      }
    />
    <RenameWorkspaceModal
      open={renameWorkspaceId !== null}
      title={renameWorkspaceTitle}
      busy={renameWorkspaceBusy}
      canSave={!renameWorkspaceBusy && renameWorkspaceTitle.trim().length > 0}
      onClose={() => {
        if (renameWorkspaceBusy) return;
        setRenameWorkspaceId(null);
        setRenameWorkspaceTitle("");
      }}
      onSave={() => void handleSaveRenameWorkspace()}
      onTitleChange={setRenameWorkspaceTitle}
    />
    <CommandPalette
      open={commandPaletteOpen}
      onClose={() => setCommandPaletteOpen(false)}
      onCreateNewSession={() => {
        if (selectedWorkspaceId) {
          void handleCreateTaskInWorkspace(selectedWorkspaceId);
        }
      }}
      onOpenSession={(workspaceId, sessionId) => navigateToWorkspaceSession(workspaceId, sessionId)}
      onOpenSettings={(route) => handleOpenSettings(route ?? "/settings/general")}
      onOpenExtensions={() => handleOpenExtensions()}
      onOpenModelPicker={() => {
        modelPicker.setQuery("");
        modelPicker.setRecentProviderIds(new Set());
        window.requestAnimationFrame(() => modelPicker.setOpen(true));
      }}
      selectedModelLabel={modelLabel}
      accessibleTargets={paletteAccessibleTargets}
      onOpenAccessibleTarget={(target) => {
        try {
          window.dispatchEvent(new CustomEvent("redrob-open-accessible-target", { detail: target }));
        } catch {
          // ignore event dispatch failures
        }
      }}
      onHideAccessibleTarget={(target) => {
        try {
          window.dispatchEvent(new CustomEvent("redrob-hide-accessible-target", { detail: target }));
        } catch {
          // ignore event dispatch failures
        }
      }}
      sessions={paletteSessionOptions}
      sessionGroups={paletteSessionGroups}
      currentSessionForGroupMove={currentSessionForGroupMove}
      currentSessionGroupId={currentSessionGroupId}
      onMoveCurrentSessionToGroup={handleMoveCurrentSessionToGroup}
      extraItems={[...(sessionFindPaletteItem ? [sessionFindPaletteItem] : []), sessionSearchPaletteItem, ...terminalPaletteItems, developerModePaletteItem, diagnosticsCopyPaletteItem, diagnosticsExportPaletteItem, nextSessionTabPaletteItem, prevSessionTabPaletteItem, reloadConfigPaletteItem]}
      listAgents={listAgents}
      selectedAgent={selectedAgent}
      onSelectAgent={setSelectedAgent}
    />
    <SessionSearchDialog
      open={sessionSearchOpen}
      onClose={() => setSessionSearchOpen(false)}
      sessions={paletteSessionOptions}
      fetchMessages={sessionSearchFetcher}
      onOpenSession={(workspaceId, sessionId) => navigateToWorkspaceSession(workspaceId, sessionId)}
    />
    <ModelPickerModal
      open={modelPicker.open}
      options={modelPicker.options}
      query={modelPicker.query}
      setQuery={modelPicker.setQuery}
      subtitle={selectedModelUnavailable ? MODEL_PICKER_UNAVAILABLE_SUBTITLE : undefined}
      target="default"
      current={
        (modelPickerSessionId ? getSessionModelSelection(modelPickerSessionId)?.model : null)
          ?? local.prefs.defaultModel
          ?? ({ providerID: "", modelID: "" } satisfies ModelRef)
      }
      onSelect={(next: ModelRef) => {
        if (modelPickerSessionId) {
          // Keep the conversation's own model, and also remember it as the
          // last used default so a newly created session starts on it.
          useSessionModelStore.getState().setModel(modelPickerSessionId, next);
          local.setPrefs((previous) => ({
            ...previous,
            defaultModel: next,
            modelVariant: previous.defaultModel?.providerID === next.providerID && previous.defaultModel.modelID === next.modelID
              ? previous.modelVariant
              : null,
          }));
          setModelPickerSessionId(null);
        } else {
          local.setPrefs((previous) => ({
            ...previous,
            defaultModel: next,
            modelVariant: previous.defaultModel?.providerID === next.providerID && previous.defaultModel.modelID === next.modelID
              ? previous.modelVariant
              : null,
          }));
        }
        modelPicker.setOpen(false);
        focusPromptSoon();
      }}
      disabledProviders={disabledProviderIds}
      onBehaviorChange={() => {}}
      onToggleProvider={async (providerId, enable) => {
        if (!opencodeClient) return;
        try {
          const config = unwrap(await opencodeClient.config.get());
          const current = disabledProvidersFromConfig(config);
          const next = enable
            ? current.filter((id: string) => id !== providerId)
            : [...current, providerId];
          const result = await updateManagedDisabledProviders({
            opencodeClient,
            redrobClient: selectedWorkspaceEndpoint?.client ?? null,
            workspaceId: selectedWorkspaceEndpoint?.workspaceId ?? null,
            workspaceType: selectedWorkspace?.workspaceType ?? "local",
            disabledProviders: next,
            currentConfig: config,
            markReloadRequired: () => {
              reloadCoordinator.markReloadRequired("config", {
                type: "config",
                name: "runtime-opencode-config.json",
                action: "updated",
              });
            },
          });
          setDisabledProviderIds(result.disabledProviders);
        } catch {}
      }}
      onOpenSettings={() => {
        modelPicker.setOpen(false);
        handleOpenSettings("/settings/general");
      }}
      onClose={() => { modelPicker.setOpen(false); modelPicker.setRecentProviderIds(new Set()); }}
    />
    </WorkspaceProvider>
  );
}
