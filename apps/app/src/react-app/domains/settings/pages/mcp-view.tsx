/** @jsxImportSource react */
import { useEffect, useReducer, useRef, useState, type ReactNode, type SetStateAction } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Cloud,
  Code2,
  CreditCard,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  LayoutGrid,
  List,
  Loader2,
  MonitorSmartphone,
  Plug2,
  Plus,
  Power,
  Settings2,
  Unplug,
  Zap,
} from "lucide-react";

import { getMcpServerName, type McpDirectoryInfo } from "../../../../app/constants";
import { evaluateEnablement } from "../../../../app/enablement";
import type { EnablementResult } from "../../../../app/extensions";
import { ExtensionCard, type ExtensionLayout } from "../../../design-system/extension-card";
import { ExtensionDetailModal } from "../../../design-system/extension-detail-modal";
import {
  type ExtensionInventoryGroup,
} from "../extension-items";
import {
  extensionFilterLabel,
  extensionInventoryFilters,
  matchesExtensionFilter,
  taxonomyForDirectoryEntry,
  type ExtensionInventoryFilter,
  type ExtensionInventoryState,
} from "../extension-taxonomy";
import { SettingsGroupHeader, RefreshButton } from "../settings-section";
import { SettingsListSearchInput } from "../settings-list";
import {
  openDesktopPath,
  readOpencodeConfig,
  revealDesktopItemInDir,
  type OpencodeConfigFile,
} from "../../../../app/lib/desktop";
import {
  getMcpIdentityKey,
  normalizeMcpSlug,
} from "../../../../app/mcp";
import type { McpServerEntry, McpStatusMap } from "../../../../app/types";
import { formatRelativeTime, isDesktopRuntime, isWindowsPlatform } from "../../../../app/utils";
import { t } from "../../../../i18n";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";
import { AddMcpModal } from "../../connections/modals/add-mcp-modal";
import type { McpConnectResult } from "../../connections/store";
import { ClaudePluginImportModal } from "../../connections/modals/claude-plugin-import-modal";
import type { RedrobClaudePluginPreview } from "../../../../app/lib/redrob-server";
import {
  isRedrobWorkExtensionEnabled,
  isRedrobWorkExtensionHidden,
  REDROB_EXTENSION_STATE_CHANGED,
  readExtensionLayout,
  setRedrobWorkExtensionEnabled,
  setRedrobWorkExtensionHidden,
  writeExtensionLayout,
} from "../extension-state";
import {
  initialMcpViewLocalState,
  mcpViewLocalReducer,
  type ConfigScope,
  type McpViewLocalState,
} from "./mcp-view-state";
import {
  libraryAgentDetailId,
  libraryCommandDetailId,
  libraryCommandTriggers,
  parseLibraryAgentDetailId,
  parseLibraryCommandDetailId,
  type LibraryAgentItem,
  type LibraryCommandItem,
} from "../library";

export type ReactMcpStatus =
  | "connected"
  | "needs_auth"
  | "reconnect_required"
  | "needs_client_registration"
  | "failed"
  | "disabled"
  | "disconnected";

export type SkillItem = {
  name: string;
  description?: string;
  trigger?: string;
  path: string;
  content?: string;
  origin?: "local";
  marketplaceName?: string;
  pluginName?: string;
};

const getSkillHiddenId = (skill: SkillItem) => `skill:${skill.name}`;

export type McpViewProps = {
  busy: boolean;
  selectedWorkspaceRoot: string;
  isRemoteWorkspace: boolean;
  /** Installed skills to render alongside MCPs in the grid. */
  installedSkills?: SkillItem[];
  /** Composer slash commands to render in Library. */
  installedCommands?: LibraryCommandItem[];
  /** Composer agents to render in Library. */
  installedAgents?: LibraryAgentItem[];
  /** MCP capabilities available to this workspace. */
  /** Organization inventory is still being fetched and nothing is cached yet. */
  inventoryLoading?: boolean;
  /** Uninstall a skill by name. */
  uninstallSkill?: (name: string) => void;
  /** Read skill content by name. */
  readSkill?: (name: string) => Promise<{ content: string } | null>;
  readConfigFile?: (scope: "project" | "global") => Promise<OpencodeConfigFile | null>;
  mcpServers: McpServerEntry[];
  mcpStatus: string | null;
  mcpLastUpdatedAt: number | null;
  mcpStatuses: McpStatusMap;
  mcpConnectingName: string | null;
  /** False when secure storage for Redrob Work-managed sign-ins is unavailable on this device. */
  managedOAuthAvailable?: boolean;
  selectedMcp: string | null;
  setSelectedMcp: (name: string | null) => void;
  quickConnect: McpDirectoryInfo[];
  connectMcp: (entry: McpDirectoryInfo) => Promise<McpConnectResult>;
  authorizeMcp: (entry: McpServerEntry) => void;
  logoutMcpAuth: (name: string) => Promise<void> | void;
  removeMcp: (name: string) => void;
  setMcpEnabled?: (name: string, enabled: boolean) => Promise<void> | void;
  /** Return extension-specific config UI for the detail modal. */
  configSlotForEntry?: (entry: McpDirectoryInfo) => React.ReactNode | null;
  /** Check if an extension-kind entry is connected/active. */
  isExtensionConnected?: (entry: McpDirectoryInfo) => boolean;
  /** Enablement context for evaluating extension active state. */
  enablementContext?: import("../../../../app/enablement").EnablementContext;
  /** Preview a Claude Code plugin bundle from a GitHub URL ("Will install" disclosure). */
  previewClaudePlugin?: (url: string) => Promise<RedrobClaudePluginPreview>;
  /** Install a Claude Code plugin bundle from a GitHub URL. */
  installClaudePlugin?: (url: string) => Promise<{ ok: boolean; message: string }>;
  initialFilter?: ExtensionInventoryFilter;
  onFilterChange?: (filter: ExtensionInventoryFilter) => void;
  initialState?: ExtensionInventoryState;
  onStateChange?: (state: ExtensionInventoryState, filter: ExtensionInventoryFilter) => void;
  /** Stable extension detail id from `/extensions/:id`. */
  detailId?: string | null;
  /** Navigate when detail opens/closes. When set, detail renders as a page. */
  onDetailIdChange?: (id: string | null) => void;
  /** Reload composer command and agent lists after a Library create. */
  onLibraryListsRefresh?: () => Promise<void> | void;
  onRefresh?: () => void;
};

const statusDot = (status: ReactMcpStatus) => {
  switch (status) {
    case "connected":
      return "bg-success";
    case "needs_auth":
    case "reconnect_required":
    case "needs_client_registration":
      return "bg-warning";
    case "disabled":
      return "bg-gray-8";
    case "disconnected":
      return "bg-gray-7";
    default:
      return "bg-destructive";
  }
};

const friendlyStatus = (status: ReactMcpStatus) => {
  switch (status) {
    case "connected":
      return t("mcp.friendly_status_ready");
    case "needs_auth":
    case "needs_client_registration":
      return t("mcp.friendly_status_needs_signin");
    case "reconnect_required":
      return t("mcp.friendly_status_reconnect_required");
    case "disabled":
      return t("mcp.friendly_status_paused");
    case "disconnected":
      return t("mcp.friendly_status_offline");
    default:
      return t("mcp.friendly_status_issue");
  }
};

const statusBadgeStyle = (status: ReactMcpStatus) => {
  switch (status) {
    case "connected":
      return "bg-success-soft text-success-ink";
    case "needs_auth":
    case "reconnect_required":
    case "needs_client_registration":
      return "bg-warning-soft text-warning-ink";
    case "disabled":
    case "disconnected":
      return "bg-gray-3 text-gray-11";
    default:
      return "bg-destructive-soft text-destructive-ink";
  }
};

const serviceIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("notion")) return BookOpen;
  if (lower.includes("linear")) return Zap;
  if (lower.includes("sentry")) return CircleAlert;
  if (lower.includes("stripe")) return CreditCard;
  if (lower.includes("context")) return Globe;
  if (lower.includes("devtools")) {
    return MonitorSmartphone;
  }
  if (lower.includes("redrob") && lower.includes("cloud")) return Cloud;
  if (lower.includes("redrob") && lower.includes("ui")) return MonitorSmartphone;
  return Plug2;
};

const serviceColor = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("notion")) return "text-gray-12";
  if (lower.includes("linear")) return "text-spectrum-sky";
  if (lower.includes("sentry")) return "text-spectrum-violet";
  if (lower.includes("stripe")) return "text-spectrum-sky";
  if (lower.includes("context")) return "text-spectrum-green";
  if (lower.includes("devtools")) {
    return "text-spectrum-orange";
  }
  if (lower.includes("redrob")) return "text-gray-12";
  return "text-dls-secondary";
};

const serviceIconBg = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("notion")) return "bg-gray-3 border-gray-6";
  if (lower.includes("linear")) return "bg-spectrum-sky/15 border-spectrum-sky/35";
  if (lower.includes("sentry")) return "bg-spectrum-violet/15 border-spectrum-violet/35";
  if (lower.includes("stripe")) return "bg-spectrum-sky/15 border-spectrum-sky/35";
  if (lower.includes("context")) return "bg-spectrum-green/15 border-spectrum-green/35";
  if (lower.includes("devtools")) {
    return "bg-spectrum-orange/15 border-spectrum-orange/35";
  }
  if (lower.includes("redrob")) return "bg-gray-3 border-gray-6";
  return "bg-dls-hover border-dls-border";
};

function extensionResourceLabels(entry: McpDirectoryInfo) {
  return entry.extensionManifest?.resources.map((resource) => resource.label ?? resource.id) ?? [];
}

function extensionContributionLabels(entry: McpDirectoryInfo) {
  return entry.extensionManifest?.contributions?.map((contribution) => contribution.label ?? contribution.ref ?? contribution.type) ?? [];
}

function isToggleOnlyExtension(entry: McpDirectoryInfo) {
  if (entry.kind !== "extension") return false;
  return entry.extensionManifest?.contributions?.some((contribution) =>
    contribution.type === "session-side-panel" || contribution.type === "session-rail-item"
  ) === true;
}

type ExtensionDetailTarget =
  | { kind: "entry"; entry: McpDirectoryInfo }
  | { kind: "skill"; skill: SkillItem }
  | { kind: "command"; command: LibraryCommandItem }
  | { kind: "agent"; agent: LibraryAgentItem }

function extensionDetailIdForTarget(target: ExtensionDetailTarget): string {
  switch (target.kind) {
    case "entry":
      return getMcpIdentityKey(target.entry);
    case "skill":
      return `skill:${target.skill.name}`;
    case "command":
      return libraryCommandDetailId(target.command);
    case "agent":
      return libraryAgentDetailId(target.agent);
  }
}

function resolveExtensionDetailTarget(
  detailId: string,
  lists: {
    quickConnect: McpDirectoryInfo[];
    skills: SkillItem[];
    commands: LibraryCommandItem[];
    agents: LibraryAgentItem[];
  },
): ExtensionDetailTarget | null {
  if (detailId.startsWith("skill:")) {
    const name = detailId.slice("skill:".length);
    const skill = lists.skills.find((entry) => entry.name === name);
    return skill ? { kind: "skill", skill } : null;
  }
  const commandId = parseLibraryCommandDetailId(detailId);
  if (commandId) {
    const command = lists.commands.find((entry) => entry.id === commandId || entry.name === commandId);
    return command ? { kind: "command", command } : null;
  }
  const agentName = parseLibraryAgentDetailId(detailId);
  if (agentName) {
    const agent = lists.agents.find((entry) => entry.name === agentName);
    return agent ? { kind: "agent", agent } : null;
  }
  const entry = lists.quickConnect.find((item) =>
    getMcpIdentityKey(item) === detailId
    || item.id === detailId
    || item.name === detailId,
  );
  return entry ? { kind: "entry", entry } : null;
}

export function McpView(props: McpViewProps) {
  const skillCount = props.installedSkills?.length ?? 0;
  const useRoutedDetail = typeof props.onDetailIdChange === "function";
  const [detailTarget, setDetailTarget] = useState<ExtensionDetailTarget | null>(null);
  const [mcpConnectFailure, setMcpConnectFailure] = useState<{ id: string; message: string } | null>(null);
  const [detailSkillContent, setDetailSkillContent] = useState<string | null>(null);
  const [redrobUiMcpCommand, setRedrobUiMcpCommand] = useState<string[] | null>(null);
  const [redrobUiMcpEnvironment, setRedrobUiMcpEnvironment] = useState<Record<string, string> | null>(null);
  const [computerUseMcpCommand, setComputerUseMcpCommand] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExtensionInventoryFilter>(props.initialFilter ?? "all");
  const [inventoryState, setInventoryState] = useState<ExtensionInventoryState>(props.initialState ?? "all");
  const [inventoryStateCounts, setInventoryStateCounts] = useState<InventoryStateCounts>({
    ready: 0,
    available: 0,
  });
  const [showHidden, setShowHidden] = useState(false);
  const [layout, setLayout] = useState<ExtensionLayout>(readExtensionLayout);
  const [claudeImportOpen, setClaudeImportOpen] = useState(false);
  const [, setExtensionStateVersion] = useState(0);

  const [localState, dispatchLocal] = useReducer(
    mcpViewLocalReducer,
    initialMcpViewLocalState,
  );
  const {
    logoutOpen,
    logoutTarget,
    logoutBusy,
    removeOpen,
    removeTarget,
    configScope,
    projectConfig,
    globalConfig,
    configError,
    revealBusy,
    showAdvanced,
    addMcpModalOpen,
    togglingMcp,
  } = localState;
  const setLocal = <K extends keyof McpViewLocalState>(
    key: K,
    value: SetStateAction<McpViewLocalState[K]>,
  ) => dispatchLocal({ type: "set", key, value });
  const setLogoutOpen = (value: SetStateAction<boolean>) => setLocal("logoutOpen", value);
  const setLogoutTarget = (value: SetStateAction<string | null>) => setLocal("logoutTarget", value);
  const setLogoutBusy = (value: SetStateAction<boolean>) => setLocal("logoutBusy", value);
  const setRemoveOpen = (value: SetStateAction<boolean>) => setLocal("removeOpen", value);
  const setRemoveTarget = (value: SetStateAction<string | null>) => setLocal("removeTarget", value);
  const setConfigScope = (value: SetStateAction<ConfigScope>) => setLocal("configScope", value);
  const setConfigError = (value: SetStateAction<string | null>) => setLocal("configError", value);
  const setRevealBusy = (value: SetStateAction<boolean>) => setLocal("revealBusy", value);
  const setShowAdvanced = (value: SetStateAction<boolean>) => setLocal("showAdvanced", value);
  const setAddMcpModalOpen = (value: SetStateAction<boolean>) => setLocal("addMcpModalOpen", value);
  const setTogglingMcp = (value: SetStateAction<string | null>) => setLocal("togglingMcp", value);
  const configRequestId = useRef(0);

  const quickConnectList = props.quickConnect;
  const installedSkills = props.installedSkills ?? [];
  const installedCommands = props.installedCommands ?? [];
  const installedAgents = props.installedAgents ?? [];
  const libraryDetailLists = {
    quickConnect: quickConnectList,
    skills: installedSkills,
    commands: installedCommands,
    agents: installedAgents,
  };
  const routedTarget = useRoutedDetail && props.detailId
    ? resolveExtensionDetailTarget(props.detailId, libraryDetailLists)
    : null;
  const activeTarget = useRoutedDetail ? routedTarget : detailTarget;
  const detailEntry = activeTarget?.kind === "entry" ? activeTarget.entry : null;
  const detailSkill = activeTarget?.kind === "skill" ? activeTarget.skill : null;
  const detailCommand = activeTarget?.kind === "command" ? activeTarget.command : null;
  const detailAgent = activeTarget?.kind === "agent" ? activeTarget.agent : null;
  const detailPresentation = useRoutedDetail ? "page" : "dialog";
  const setInventoryFilter = (nextFilter: ExtensionInventoryFilter) => {
    setFilter(nextFilter);
    props.onFilterChange?.(nextFilter);
  };
  const setInventoryStateFilter = (nextState: ExtensionInventoryState) => {
    setInventoryState(nextState);
    props.onStateChange?.(nextState, filter);
  };

  const closeDetail = () => {
    setDetailTarget(null);
    setDetailSkillContent(null);
    setMcpConnectFailure(null);
    props.onDetailIdChange?.(null);
  };

  const openDetail = (target: ExtensionDetailTarget) => {
    setDetailTarget(target);
    setMcpConnectFailure(null);
    if (target.kind === "skill") {
      setDetailSkillContent(target.skill.content ?? null);
      if (!target.skill.content && props.readSkill) {
        void props.readSkill(target.skill.name).then((result) => {
          if (result?.content) {
            setDetailSkillContent(result.content);
          }
        });
      }
    } else {
      setDetailSkillContent(null);
    }
    props.onDetailIdChange?.(extensionDetailIdForTarget(target));
  };

  useEffect(() => {
    const nextState = props.initialState ?? "all";
    setInventoryState(nextState);
    if (nextState === "all") {
      setFilter(props.initialFilter ?? "all");
    }
  }, [props.initialFilter, props.initialState]);

  useEffect(() => {
    if (!useRoutedDetail) return;
    const detailId = props.detailId ?? null;
    if (!detailId) {
      setDetailTarget(null);
      setDetailSkillContent(null);
      return;
    }
    const resolved = resolveExtensionDetailTarget(detailId, libraryDetailLists);
    setDetailTarget(resolved);
    if (resolved?.kind === "skill") {
      setDetailSkillContent(resolved.skill.content ?? null);
      if (!resolved.skill.content && props.readSkill) {
        void props.readSkill(resolved.skill.name).then((result) => {
          if (result?.content) {
            setDetailSkillContent(result.content);
          }
        });
      }
    } else {
      setDetailSkillContent(null);
    }
  }, [
    useRoutedDetail,
    props.detailId,
    props.readSkill,
    quickConnectList,
    installedSkills,
    installedCommands,
    installedAgents,
  ]);

  useEffect(() => {
    if (useRoutedDetail) return;
    if (detailEntry && !quickConnectList.includes(detailEntry)) {
      setDetailTarget(null);
    }
  }, [useRoutedDetail, detailEntry, quickConnectList]);

  useEffect(() => {
    setMcpConnectFailure((current) =>
      current && (!detailEntry || current.id !== getMcpIdentityKey(detailEntry)) ? null : current
    );
  }, [detailEntry]);

  useEffect(() => {
    const refresh = () => setExtensionStateVersion((value) => value + 1);
    window.addEventListener(REDROB_EXTENSION_STATE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(REDROB_EXTENSION_STATE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void (async () => {
      try {
        const command = await window.__REDROB_ELECTRON__?.invokeDesktop?.("getRedrobUiMcpCommand");
        if (Array.isArray(command) && command.every((part) => typeof part === "string")) {
          setRedrobUiMcpCommand(command);
        }
        const environment = await window.__REDROB_ELECTRON__?.invokeDesktop?.("getRedrobUiMcpEnvironment");
        if (environment && typeof environment === "object" && !Array.isArray(environment)) {
          setRedrobUiMcpEnvironment(Object.fromEntries(
            Object.entries(environment).filter((entry): entry is [string, string] =>
              typeof entry[0] === "string" && typeof entry[1] === "string"
            ),
          ));
        }
        const computerUseCommand = await window.__REDROB_ELECTRON__?.invokeDesktop?.("getComputerUseMcpCommand");
        if (Array.isArray(computerUseCommand) && computerUseCommand.every((part) => typeof part === "string")) {
          setComputerUseMcpCommand(computerUseCommand);
        }
      } catch {
        setRedrobUiMcpCommand(null);
        setRedrobUiMcpEnvironment(null);
        setComputerUseMcpCommand(null);
      }
    })();
  }, []);

  useEffect(() => {
    const root = props.selectedWorkspaceRoot.trim();
    const nextId = configRequestId.current + 1;
    configRequestId.current = nextId;
    const readConfig = props.readConfigFile;
    const canReadDesktopConfig = !props.isRemoteWorkspace && isDesktopRuntime();

    if (!readConfig && !canReadDesktopConfig) {
      dispatchLocal({ type: "configUnavailable" });
      return;
    }

    void (async () => {
      try {
        setConfigError(null);
        const [project, global] = await Promise.all([
          root
            ? readConfig
              ? readConfig("project")
              : canReadDesktopConfig
              ? readOpencodeConfig("project", root)
              : Promise.resolve(null)
            : Promise.resolve(null),
          readConfig
            ? readConfig("global")
            : canReadDesktopConfig
            ? readOpencodeConfig("global", root)
            : Promise.resolve(null),
        ]);
        if (nextId !== configRequestId.current) return;
        dispatchLocal({
          type: "configLoaded",
          project: project as OpencodeConfigFile | null,
          global: global as OpencodeConfigFile | null,
        });
      } catch (error) {
        if (nextId !== configRequestId.current) return;
        dispatchLocal({
          type: "configLoadError",
          error: error instanceof Error ? error.message : t("mcp.config_load_failed"),
        });
      }
    })();
  }, [props.isRemoteWorkspace, props.readConfigFile, props.selectedWorkspaceRoot]);

  const activeConfig = configScope === "project" ? projectConfig : globalConfig;

  const revealLabel = isWindowsPlatform()
    ? t("mcp.open_file")
    : t("mcp.reveal_in_finder");

  const canRevealConfig =
    isDesktopRuntime() &&
    !props.isRemoteWorkspace &&
    !revealBusy &&
    !(configScope === "project" && !props.selectedWorkspaceRoot.trim()) &&
    Boolean(activeConfig?.exists);

  const resolveQuickConnectMatch = (name: string) =>
    quickConnectList.find((candidate) => {
      const candidateKey = getMcpIdentityKey(candidate);
      return (
        candidateKey === name ||
        candidate.name === name ||
        normalizeMcpSlug(candidate.name) === name
      );
    });

  // Auto-configured built-ins like redrob-cloud remain active but hidden from
  // Your apps until Show hidden reveals the row for disable/remove.
  const visibleMcpServers = inventoryState === "all" && (filter === "all" || filter === "mcp")
    ? showHidden
      ? props.mcpServers
      : props.mcpServers.filter((entry) => {
          const match = resolveQuickConnectMatch(entry.name);
          return !match || !isRedrobWorkExtensionHidden(match);
        })
    : [];

  const displayName = (name: string) => resolveQuickConnectMatch(name)?.name ?? name;

  const quickConnectStatus = (entry: McpDirectoryInfo) =>
    props.mcpStatuses[getMcpIdentityKey(entry)];

  const isQuickConnectConfigured = (entry: McpDirectoryInfo) =>
    props.mcpServers.some((server) => server.name === getMcpIdentityKey(entry));

  const isMcpBackedExtension = (entry: McpDirectoryInfo) =>
    entry.kind === "extension" && Boolean(entry.type || entry.command?.length || entry.url);

  const enablementForEntry = (entry: McpDirectoryInfo): { active: boolean; results: EnablementResult[] } | null => {
    const manifest = entry.extensionManifest;
    if (manifest?.enablement && props.enablementContext) {
      return evaluateEnablement(manifest.enablement, props.enablementContext);
    }
    return null;
  };

  const isEntryConfigured = (entry: McpDirectoryInfo) => {
    const result = enablementForEntry(entry);
    if (result) return result.active;
    // Fallback for entries without enablement context.
    if (isToggleOnlyExtension(entry)) return isRedrobWorkExtensionEnabled(entry);
    if (entry.kind === "extension" && !isMcpBackedExtension(entry)) return props.isExtensionConnected?.(entry) ?? false;
    return isQuickConnectConfigured(entry);
  };

  const launchCommandForEntry = (entry: McpDirectoryInfo) => {
    if (entry.serverName === "redrob-ui") return redrobUiMcpCommand ?? undefined;
    if (entry.serverName === "computer-use") return computerUseMcpCommand ?? entry.command;
    return entry.command;
  };

  const supportsOauth = (entry: McpServerEntry) =>
    Boolean(entry.managedOAuth) || (entry.config.type === "remote" && entry.config.oauth !== false);

  const resolveStatus = (entry: McpServerEntry): ReactMcpStatus => {
    if (entry.config.enabled === false) return "disabled";
    const resolved = props.mcpStatuses[entry.name];
    return resolved?.status ?? "disconnected";
  };

  const hiddenCount = quickConnectList.filter((entry) => isRedrobWorkExtensionHidden(entry)).length +
    (props.installedSkills ?? []).filter((skill) => isRedrobWorkExtensionHidden(getSkillHiddenId(skill))).length;

  const requestLogout = (name: string) => {
    if (!name.trim()) return;
    setLogoutTarget(name);
    setLogoutOpen(true);
  };

  const confirmLogout = async () => {
    const name = logoutTarget;
    if (!name || logoutBusy) return;
    setLogoutBusy(true);
    try {
      await props.logoutMcpAuth(name);
    } finally {
      setLogoutBusy(false);
      setLogoutOpen(false);
      setLogoutTarget(null);
    }
  };

  const revealConfig = async () => {
    if (!isDesktopRuntime() || revealBusy) return;
    const root = props.selectedWorkspaceRoot.trim();

    if (configScope === "project" && !root) {
      setConfigError(t("mcp.pick_workspace_error"));
      return;
    }

    setRevealBusy(true);
    setConfigError(null);
    try {
      const resolved = props.readConfigFile
        ? await props.readConfigFile(configScope)
        : !props.isRemoteWorkspace
        ? await readOpencodeConfig(configScope, root)
        : null;
      const configFile = resolved as OpencodeConfigFile | null;
      if (!configFile) {
        throw new Error(t("mcp.config_load_failed"));
      }
      if (isWindowsPlatform()) {
        await openDesktopPath(configFile.path);
      } else {
        await revealDesktopItemInDir(configFile.path);
      }
    } catch (error) {
      setConfigError(
        error instanceof Error ? error.message : t("mcp.reveal_config_failed"),
      );
    } finally {
      setRevealBusy(false);
    }
  };

  const detailPanels = (
    <>
      {detailEntry ? (() => {
        const extensionConfigSlot = props.configSlotForEntry?.(detailEntry) ?? null;
        const hasConfigSlot = extensionConfigSlot !== null;
        const hidden = isRedrobWorkExtensionHidden(detailEntry);
        const isConnected = isToggleOnlyExtension(detailEntry)
          ? isRedrobWorkExtensionEnabled(detailEntry)
          : detailEntry.kind === "extension" && !isMcpBackedExtension(detailEntry)
          ? props.isExtensionConnected?.(detailEntry) ?? false
          : isQuickConnectConfigured(detailEntry);
        return (
          <ExtensionDetailModal
            open={!!detailEntry}
            onClose={closeDetail}
            presentation={detailPresentation}
            backLabel={t("extensions.title")}
            name={detailEntry.name}
            description={detailEntry.description}
            iconSlug={detailEntry.iconSlug}
            iconSrc={detailEntry.iconSrc}
            taxonomy={taxonomyForDirectoryEntry(detailEntry)}
            uiControl={detailEntry.kind === "ui-control"}
            connected={isConnected}
            connecting={props.mcpConnectingName === detailEntry.name}
            errorInfo={mcpConnectFailure?.id === getMcpIdentityKey(detailEntry) ? mcpConnectFailure.message : null}
            hidden={hidden}
            preview={detailEntry.preview}
            setupInstructions={detailEntry.extensionManifest?.setup?.instructions}
            resourceLabels={extensionResourceLabels(detailEntry)}
            contributionLabels={extensionContributionLabels(detailEntry)}
            launchCommand={launchCommandForEntry(detailEntry)}
            environment={detailEntry.serverName === "redrob-ui" ? redrobUiMcpEnvironment ?? undefined : undefined}
            url={typeof detailEntry.url === "string" ? detailEntry.url : undefined}
            oauth={detailEntry.oauth}
            configSlot={extensionConfigSlot}
            showEnablementCard
            onConnect={isToggleOnlyExtension(detailEntry) ? () => {
              setRedrobWorkExtensionEnabled(detailEntry, true);
              closeDetail();
            } : hasConfigSlot ? undefined : async () => {
              setMcpConnectFailure(null);
              const result = await props.connectMcp(detailEntry);
              if (result.ok) {
                closeDetail();
                return;
              }
              setMcpConnectFailure({
                id: getMcpIdentityKey(detailEntry),
                message: result.error.trim() ? result.error : t("mcp.connect_failed"),
              });
            }}
            onUninstall={isToggleOnlyExtension(detailEntry) && isConnected ? () => {
              setRedrobWorkExtensionEnabled(detailEntry, false);
            } : isQuickConnectConfigured(detailEntry) ? () => {
              const slug = getMcpIdentityKey(detailEntry);
              props.removeMcp(slug);
              closeDetail();
            } : undefined}
            onHide={() => setRedrobWorkExtensionHidden(detailEntry, true)}
            onShow={() => setRedrobWorkExtensionHidden(detailEntry, false)}
          />
        );
      })() : null}

      {detailSkill ? (() => {
        const hidden = isRedrobWorkExtensionHidden(getSkillHiddenId(detailSkill));
        return (
          <ExtensionDetailModal
            open={!!detailSkill}
            onClose={closeDetail}
            presentation={detailPresentation}
            backLabel={t("extensions.title")}
            name={detailSkill.name}
            description={detailSkill.description ?? t("extensions.fallback_description_skill")}
            taxonomy="skill"
            connected={true}
           hidden={hidden}
            path={detailSkill.path}
            sourceLabel={detailSkill.path}
            triggers={detailSkill.trigger ? [detailSkill.trigger] : []}
            triggerHint={t("extensions.detail_triggers_skill_hint")}
            instructionsHint={t("extensions.detail_instructions_skill_hint")}
            openFileLabel={t("extensions.detail_open_skill")}
            contentPreview={detailSkillContent ?? undefined}
            onReveal={detailSkill.path ? () => {
              void revealDesktopItemInDir(detailSkill.path);
            } : undefined}
            onUninstall={props.uninstallSkill ? () => {
              props.uninstallSkill?.(detailSkill.name);
              closeDetail();
            } : undefined}
            onHide={() => setRedrobWorkExtensionHidden(getSkillHiddenId(detailSkill), true)}
            onShow={() => setRedrobWorkExtensionHidden(getSkillHiddenId(detailSkill), false)}
          />
        );
      })() : null}

      {detailCommand ? (
        <ExtensionDetailModal
          open={true}
          onClose={closeDetail}
          presentation={detailPresentation}
          backLabel={t("extensions.title")}
          name={`/${detailCommand.name}`}
          description={detailCommand.description ?? t("extensions.detail_source_composer")}
          taxonomy="command"
          connected={true}
          sourceLabel={t("extensions.detail_source_composer")}
          triggers={libraryCommandTriggers(detailCommand)}
          triggerHint={t("extensions.detail_triggers_command_hint")}
          instructionsHint={t("extensions.detail_instructions_command_hint")}
          contentPreview={detailCommand.template}
          facts={[
            { label: t("extensions.detail_fact_slash"), value: `/${detailCommand.name}` },
            ...(detailCommand.agent ? [{ label: t("extensions.detail_fact_agent"), value: detailCommand.agent }] : []),
            ...(detailCommand.model ? [{ label: t("extensions.detail_fact_model"), value: detailCommand.model }] : []),
          ]}
        />
      ) : null}

      {detailAgent ? (
        <ExtensionDetailModal
          open={true}
          onClose={closeDetail}
          presentation={detailPresentation}
          backLabel={t("extensions.title")}
          name={detailAgent.name}
          description={detailAgent.description ?? t("extensions.detail_source_composer")}
          taxonomy="agent"
          connected={true}
          sourceLabel={detailAgent.native ? t("extensions.detail_native_agent") : t("extensions.detail_workspace_agent")}
          triggers={[t("extensions.detail_agent_trigger")]}
          triggerHint={t("extensions.detail_triggers_agent_hint")}
          instructionsHint={t("extensions.detail_instructions_agent_hint")}
          contentPreview={detailAgent.prompt}
          facts={[
            ...(detailAgent.mode ? [{ label: t("extensions.detail_fact_mode"), value: detailAgent.mode }] : []),
            { label: t("extensions.detail_fact_origin"), value: detailAgent.native ? t("extensions.detail_native_agent") : t("extensions.detail_workspace_agent") },
            ...(detailAgent.model
              ? [{ label: t("extensions.detail_fact_model"), value: `${detailAgent.model.providerID}/${detailAgent.model.modelID}` }]
              : []),
          ]}
        />
      ) : null}

    </>
  );

  if (useRoutedDetail && props.detailId) {
    if (activeTarget) {
      return detailPanels;
    }
    return (
      <div className="flex w-full max-w-3xl flex-col gap-6 animate-in fade-in duration-300">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit gap-1 px-2 text-muted-foreground"
          onClick={closeDetail}
        >
          <ChevronLeft size={16} />
          {t("extensions.title")}
        </Button>
        {props.inventoryLoading === true ? (
          <p className="flex items-center gap-2 text-sm text-dls-secondary">
            <Loader2 size={14} className="animate-spin" />
            {t("extensions.detail_loading")}
          </p>
        ) : (
          <p className="text-sm text-dls-secondary">{t("extensions.detail_unavailable")}</p>
        )}
      </div>
    );
  }

  return (
    <section className="w-full max-w-3xl animate-in fade-in duration-300">
      {props.mcpStatus ? (
        <div className="mb-5 whitespace-pre-wrap wrap-break-word rounded-xl border border-dls-border bg-dls-hover px-4 py-3 text-xs text-dls-secondary">
          {props.mcpStatus}
        </div>
      ) : null}

      <div className="mb-5">
        <ExtensionStateTabs
          state={inventoryState}
          readyCount={inventoryStateCounts.ready}
          availableCount={inventoryStateCounts.available}
          onChange={setInventoryStateFilter}
        />
      </div>

      <div className="mb-7 flex flex-wrap items-center gap-2" aria-label={t("extensions.filters_label")}>
        <div className="w-full sm:w-[220px]">
          <SettingsListSearchInput
            placeholder={t("extensions.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
        {extensionInventoryFilters.map((f) => {
          const selected = filter === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={selected}
              onClick={() => setInventoryFilter(f)}
              className={`inline-flex h-[26px] items-center rounded-full border px-3 text-[12px] font-medium transition-colors ${
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              }`}
            >
              {extensionFilterLabel(f)}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={showHidden}
          onClick={() => setShowHidden((current) => !current)}
          className={`inline-flex h-[26px] items-center rounded-full border px-3 text-[12px] font-medium transition-colors ${
            showHidden
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          }`}
        >
          {showHidden
            ? t("extensions.showing_hidden")
            : hiddenCount > 0
              ? t("extensions.show_hidden_count", { count: hiddenCount })
              : t("extensions.show_hidden")}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <ExtensionLayoutToggle
            layout={layout}
            onChange={(next) => {
              setLayout(next);
              writeExtensionLayout(next);
            }}
          />
          {props.onRefresh ? (
            <RefreshButton busy={props.busy} onRefresh={props.onRefresh}>
              {t("common.refresh")}
            </RefreshButton>
          ) : null}
        </div>
      </div>

      <McpQuickConnectSection
        skillCount={skillCount}
        entries={
          quickConnectList.filter((entry) => {
            if (!showHidden && isRedrobWorkExtensionHidden(entry)) return false;
            if (!matchesExtensionFilter(
              filter,
              taxonomyForDirectoryEntry(entry),
              entry.kind === "mcp" ? "mcp" : null,
            )) return false;
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return entry.name.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
          })
        }
        installedSkills={
          installedSkills.filter((skill) => {
            if (!showHidden && isRedrobWorkExtensionHidden(getSkillHiddenId(skill))) return false;
            if (!matchesExtensionFilter(filter, "skill")) return false;
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return skill.name.toLowerCase().includes(q) || (skill.description ?? "").toLowerCase().includes(q);
          })
        }
        installedCommands={
          (props.installedCommands ?? []).filter((command) => {
            if (!matchesExtensionFilter(filter, "command")) return false;
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return command.name.toLowerCase().includes(q) || (command.description ?? "").toLowerCase().includes(q);
          })
        }
        installedAgents={
          (props.installedAgents ?? []).filter((agent) => {
            if (!matchesExtensionFilter(filter, "agent")) return false;
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return agent.name.toLowerCase().includes(q) || (agent.description ?? "").toLowerCase().includes(q);
          })
        }
        loading={props.inventoryLoading === true}
        layout={layout}
        filter={filter}
        state={inventoryState}
        onStateCountsChange={setInventoryStateCounts}
        busy={props.busy}
        connectingName={props.mcpConnectingName}
        isEntryHidden={(entry) => isRedrobWorkExtensionHidden(entry)}
        isSkillHidden={(skill) => isRedrobWorkExtensionHidden(getSkillHiddenId(skill))}
        isConfigured={isEntryConfigured}
        enablementForEntry={props.enablementContext ? enablementForEntry : undefined}
        statusForEntry={quickConnectStatus}
        onConnect={async (entry) => {
          setMcpConnectFailure(null);
          const result = await props.connectMcp(entry);
          if (result.ok) return;
          openDetail({ kind: "entry", entry });
          setMcpConnectFailure({
            id: getMcpIdentityKey(entry),
            message: result.error.trim() ? result.error : t("mcp.connect_failed"),
          });
        }}
        onDetail={(entry) => openDetail({ kind: "entry", entry })}
        onSkillDetail={(skill) => openDetail({ kind: "skill", skill })}
        onCommandDetail={(command) => openDetail({ kind: "command", command })}
        onAgentDetail={(agent) => openDetail({ kind: "agent", agent })}
       filtersActive={Boolean(search.trim()) || filter !== "all" || inventoryState !== "all"}
      />

      {visibleMcpServers.length > 0 ? (
      <McpConfiguredServersSection
        servers={visibleMcpServers}
        statuses={props.mcpStatuses}
        managedOAuthUnavailable={props.managedOAuthAvailable === false}
        lastUpdatedAt={props.mcpLastUpdatedAt}
        selectedMcp={props.selectedMcp}
        busy={props.busy}
        logoutBusy={logoutBusy}
        logoutTarget={logoutTarget}
        togglingMcp={togglingMcp}
        displayName={displayName}
        resolveStatus={resolveStatus}
        supportsOauth={supportsOauth}
        onSelect={props.setSelectedMcp}
        onAuthorize={props.authorizeMcp}
        onRequestLogout={requestLogout}
        onRemove={(name) => {
          setRemoveTarget(name);
          setRemoveOpen(true);
        }}
        onToggleEnabled={props.setMcpEnabled}
        onToggleBusy={setTogglingMcp}
      />
      ) : null}

      <ConfirmModal
        open={logoutOpen}
        title={t("mcp.logout_modal_title")}
        message={t("mcp.logout_modal_message").replace("{server}", displayName(logoutTarget ?? ""))}
        confirmLabel={logoutBusy ? t("mcp.logout_working") : t("mcp.logout_action")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onCancel={() => {
          if (logoutBusy) return;
          setLogoutOpen(false);
          setLogoutTarget(null);
        }}
        onConfirm={() => {
          void confirmLogout();
        }}
      />

      <ConfirmModal
        open={removeOpen}
        title={t("mcp.remove_modal_title")}
        message={t("mcp.remove_modal_message").replace("{server}", displayName(removeTarget ?? ""))}
        confirmLabel={t("mcp.remove_app")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onCancel={() => {
          setRemoveOpen(false);
          setRemoveTarget(null);
        }}
        onConfirm={() => {
          if (removeTarget) props.removeMcp(removeTarget);
          setRemoveOpen(false);
          setRemoveTarget(null);
        }}
      />

      <McpAdvancedConfigSection
        open={showAdvanced}
        configScope={configScope}
        activeConfig={activeConfig}
        canRevealConfig={canRevealConfig}
        revealBusy={revealBusy}
        revealLabel={revealLabel}
        configError={configError}
        onToggle={() => setShowAdvanced((current) => !current)}
        onScopeChange={setConfigScope}
        onReveal={revealConfig}
        onAddMcp={() => setAddMcpModalOpen(true)}
        onImportFromGithub={
          props.previewClaudePlugin && props.installClaudePlugin
            ? () => setClaudeImportOpen(true)
            : undefined
        }
      />

      <AddMcpModal
        open={addMcpModalOpen}
        onClose={() => setAddMcpModalOpen(false)}
        onAdd={props.connectMcp}
        busy={props.busy}
        isRemoteWorkspace={props.isRemoteWorkspace}
      />

      {props.previewClaudePlugin && props.installClaudePlugin ? (
        <ClaudePluginImportModal
          open={claudeImportOpen}
          onClose={() => setClaudeImportOpen(false)}
          onPreview={props.previewClaudePlugin}
          onInstall={props.installClaudePlugin}
        />
      ) : null}

      {detailPanels}
    </section>
  );
}

const inventoryGroupOrder: ExtensionInventoryGroup[] = [
  "ready",
  "available",
  "disabled",
];

function inventoryGroupLabel(group: ExtensionInventoryGroup) {
  switch (group) {
    case "ready":
      return t("connect.group_ready");
    case "available":
      return t("extensions.group_ready_to_set_up");
    case "disabled":
      return t("extensions.disabled_by_organization");
  }
}

type InventoryStateCounts = Record<Exclude<ExtensionInventoryState, "all">, number>;

export function countInventoryCardGroups(groups: ExtensionInventoryGroup[]): InventoryStateCounts {
  return {
    ready: groups.filter((group) => group === "ready").length,
    available: groups.filter((group) => group === "available").length,
  };
}

export function filterInventoryCardsByState<T extends { group: ExtensionInventoryGroup }>(
  cards: T[],
  state: Exclude<ExtensionInventoryState, "all">,
) {
  return cards.filter((card) => card.group === state);
}

export function ExtensionStateTabs(props: {
  state: ExtensionInventoryState;
  readyCount: number;
  availableCount: number;
  onChange: (state: ExtensionInventoryState) => void;
}) {
  const tabs = [
    { state: "all", label: t("extensions.state_all"), count: null, countClassName: "" },
    {
      state: "ready",
      label: t("connect.group_ready"),
      count: props.readyCount,
      countClassName: "bg-gray-3 text-gray-11",
    },
    {
      state: "available",
      label: t("extensions.group_ready_to_set_up"),
      count: props.availableCount,
      countClassName: "bg-warning-soft text-warning-ink",
    },
  ] satisfies Array<{
    state: ExtensionInventoryState;
    label: string;
    count: number | null;
    countClassName: string;
  }>;

  return (
    <div className="flex flex-wrap gap-6 border-b border-dls-border" role="tablist" aria-label={t("extensions.state_tabs_label")}>
      {tabs.filter((tab) => tab.state === "all" || tab.count !== 0).map((tab) => {
        const active = props.state === tab.state;
        return (
          <button
            key={tab.state}
            type="button"
            role="tab"
            aria-selected={active}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 pb-2.5 text-[13px] font-medium transition-colors ${
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => props.onChange(tab.state)}
          >
            <span>{tab.label}</span>
            {tab.count === null ? null : (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tab.countClassName}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type InventoryCard = {
  key: string;
  group: ExtensionInventoryGroup;
  node: ReactNode;
};

function ExtensionLayoutToggle(props: {
  layout: ExtensionLayout;
  onChange: (layout: ExtensionLayout) => void;
}) {
  const options: { layout: ExtensionLayout; label: string; icon: ReactNode }[] = [
    { layout: "grid", label: t("extensions.layout_grid"), icon: <LayoutGrid size={13} /> },
    { layout: "list", label: t("extensions.layout_list"), icon: <List size={13} /> },
  ];
  return (
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <Button
          key={option.layout}
          variant={props.layout === option.layout ? "secondary" : "outline"}
          size="xs"
          aria-pressed={props.layout === option.layout}
          aria-label={option.label}
          title={option.label}
          onClick={() => props.onChange(option.layout)}
        >
          {option.icon}
        </Button>
      ))}
    </div>
  );
}

function McpQuickConnectSection(props: {
  skillCount: number;
  entries: McpDirectoryInfo[];
  installedSkills?: SkillItem[];
  installedCommands?: LibraryCommandItem[];
  installedAgents?: LibraryAgentItem[];
  loading: boolean;
  layout: ExtensionLayout;
  filter: ExtensionInventoryFilter;
  state: ExtensionInventoryState;
  onStateCountsChange: (counts: InventoryStateCounts) => void;
  busy: boolean;
  connectingName: string | null;
  isEntryHidden: (entry: McpDirectoryInfo) => boolean;
  isSkillHidden: (skill: SkillItem) => boolean;
  isConfigured: (entry: McpDirectoryInfo) => boolean;
  enablementForEntry?: (entry: McpDirectoryInfo) => { active: boolean; results: EnablementResult[] } | null;
  statusForEntry: (entry: McpDirectoryInfo) => { status: ReactMcpStatus } | undefined;
  onConnect: (entry: McpDirectoryInfo) => void;
  onDetail: (entry: McpDirectoryInfo) => void;
  onSkillDetail?: (skill: SkillItem) => void;
  onCommandDetail?: (command: LibraryCommandItem) => void;
  onAgentDetail?: (agent: LibraryAgentItem) => void;
  filtersActive?: boolean;
}) {
  const cards: InventoryCard[] = [];

  for (const entry of props.entries) {
    const configured = props.isConfigured(entry);
    const enablement = props.enablementForEntry?.(entry);
    const connecting = props.connectingName === entry.name;
    const hidden = props.isEntryHidden(entry);
    const entryUrl = typeof entry.url === "string" ? entry.url : undefined;
    const group: ExtensionInventoryGroup = configured || enablement?.active
      ? "ready"
      : "available";
    cards.push({
      key: getMcpIdentityKey(entry),
      group,
      node: (
        <ExtensionCard
          layout={props.layout}
          name={entry.name}
          description={entry.description}
          iconSlug={entry.iconSlug}
          iconSrc={entry.iconSrc}
          url={entryUrl}
          taxonomy={taxonomyForDirectoryEntry(entry)}
          connected={configured}
          enablement={enablement?.results}
          connecting={connecting}
          hidden={hidden}
          preview={entry.preview}
          disabled={props.busy}
          meta={t("extensions.surface_this_device")}
          actionLabel={configured ? t("extensions.view_details") : t("mcp.tap_to_connect")}
          nextActionLabel={configured ? undefined : t("connect.row_action_connect")}
          onClick={() => props.onDetail(entry)}
        />
      ),
    });
  }

  for (const skill of props.installedSkills ?? []) {
    const hidden = props.isSkillHidden(skill);

    cards.push({
      key: `skill:${skill.path}`,
      group: "ready",
      node: (
        <ExtensionCard
          layout={props.layout}
          name={skill.name}
          description={skill.description ?? t("extensions.fallback_description_skill")}
          taxonomy="skill"
          connected={true}
          hidden={hidden}
          meta={t("extensions.surface_this_device")}
          actionLabel={t("extensions.view_details")}
          onClick={() => props.onSkillDetail?.(skill)}
        />
      ),
    });
  }

  for (const command of props.installedCommands ?? []) {
    cards.push({
      key: `command:${command.id}`,
      group: "ready",
      node: (
        <ExtensionCard
          layout={props.layout}
          name={`/${command.name}`}
          description={command.description ?? t("extensions.fallback_description_command")}
          taxonomy="command"
          connected={true}
          meta={t("extensions.surface_this_device")}
          actionLabel={t("extensions.view_details")}
          onClick={() => props.onCommandDetail?.(command)}
        />
      ),
    });
  }

  for (const agent of props.installedAgents ?? []) {
    cards.push({
      key: `agent:${agent.name}`,
      group: "ready",
      node: (
        <ExtensionCard
          layout={props.layout}
          name={agent.name}
          description={agent.description ?? t("extensions.fallback_description_agent")}
          taxonomy="agent"
          connected={true}
          meta={t("extensions.surface_this_device")}
          actionLabel={t("extensions.view_details")}
          onClick={() => props.onAgentDetail?.(agent)}
        />
      ),
    });
  }

  const grouped = inventoryGroupOrder
    .map((group) => ({ group, cards: cards.filter((card) => card.group === group) }))
    .filter((entry) => entry.cards.length > 0);
  const stateCards = props.state === "all"
    ? []
    : filterInventoryCardsByState(cards, props.state);
  const hasCards = props.state === "all" ? grouped.length > 0 : stateCards.length > 0;
  const cardContainerClassName = props.layout === "list"
    ? "overflow-hidden rounded-xl border border-dls-border bg-dls-surface [&>div+div]:border-t [&>div+div]:border-dls-border/60"
    : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3";

  return (
    <div className="space-y-6">
      {!hasCards && props.loading ? (
        <div className={props.layout === "list" ? "flex flex-col gap-2" : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3"}>
          {[0, 1, 2].map((index) => (
            <Skeleton
              key={index}
              className={props.layout === "list" ? "h-[42px] rounded-lg" : "h-[104px] rounded-xl"}
            />
          ))}
        </div>
      ) : !hasCards ? (
        <div className="rounded-[10px] border border-dashed border-dls-border bg-dls-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-dls-text">
            {props.filtersActive ? t("extensions.empty_filtered_title") : t("extensions.empty_title")}
          </p>
          <p className="mt-2 text-[13px] text-dls-secondary">
            {props.filtersActive ? t("extensions.empty_filtered_hint") : t("extensions.empty_hint")}
          </p>
        </div>
      ) : props.state === "all" ? (
        grouped.map(({ group, cards: groupCards }) => (
          <div key={group} className="space-y-4">
            <SettingsGroupHeader
              label={inventoryGroupLabel(group)}
              count={groupCards.length}
              hint={group === "available" ? t("extensions.group_ready_to_set_up_hint") : undefined}
            />
            {/* List mode: one quiet container per readiness group, rows divided by hairlines. */}
            <div className={cardContainerClassName}>
              {groupCards.map((card) => (
                <div key={card.key} data-inventory-group={card.group}>{card.node}</div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className={cardContainerClassName}>
          {stateCards.map((card) => (
            <div key={card.key} data-inventory-group={card.group}>{card.node}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function McpConfiguredServersSection(props: {
  servers: McpServerEntry[];
  statuses: McpStatusMap;
  managedOAuthUnavailable: boolean;
  lastUpdatedAt: number | null;
  selectedMcp: string | null;
  busy: boolean;
  logoutBusy: boolean;
  logoutTarget: string | null;
  togglingMcp: string | null;
  displayName: (name: string) => string;
  resolveStatus: (entry: McpServerEntry) => ReactMcpStatus;
  supportsOauth: (entry: McpServerEntry) => boolean;
  onSelect: (name: string | null) => void;
  onAuthorize: (entry: McpServerEntry) => void;
  onRequestLogout: (name: string) => void;
  onRemove: (name: string) => void;
  onToggleEnabled?: (name: string, enabled: boolean) => Promise<void> | void;
  onToggleBusy: (value: SetStateAction<string | null>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-dls-secondary">
          {t("extensions.mcp_servers_section")}
        </h3>
        {props.lastUpdatedAt ? (
          <span className="tabular-nums text-[11px] text-dls-secondary">
            {t("mcp.last_synced")} {formatRelativeTime(props.lastUpdatedAt)}
          </span>
        ) : null}
      </div>

      {props.managedOAuthUnavailable ? (
        <div
          data-testid="mcp-managed-oauth-unavailable"
          className="rounded-lg border border-warning-muted bg-warning-soft px-3 py-2 text-xs text-warning-ink"
        >
          {t("mcp.managed_oauth_unavailable")}
        </div>
      ) : null}

      {props.servers.length ? (
        <div className="space-y-2">
          {props.servers.map((entry) => (
            <McpConfiguredServerRow
              key={entry.name}
              entry={entry}
              status={props.resolveStatus(entry)}
              errorInfo={readMcpErrorInfo(props.statuses[entry.name])}
              selected={props.selectedMcp === entry.name}
              busy={props.busy}
              logoutBusy={props.logoutBusy}
              logoutTarget={props.logoutTarget}
              togglingMcp={props.togglingMcp}
              displayName={props.displayName}
              supportsOauth={props.supportsOauth}
              onSelect={props.onSelect}
              onAuthorize={props.onAuthorize}
              onRequestLogout={props.onRequestLogout}
              onRemove={props.onRemove}
              onToggleEnabled={props.onToggleEnabled}
              onToggleBusy={props.onToggleBusy}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-dls-border px-5 py-10 text-center">
          <Unplug size={24} className="mx-auto mb-3 text-dls-secondary/30" />
          <div className="text-sm font-medium text-dls-secondary">{t("mcp.no_apps_yet")}</div>
          <div className="mt-1 text-xs text-dls-secondary/60">{t("mcp.no_apps_hint")}</div>
        </div>
      )}
    </div>
  );
}

function readMcpErrorInfo(status: McpStatusMap[string] | undefined) {
  if (!status || status.status !== "failed") return null;
  return "error" in status ? status.error : t("mcp.connection_failed");
}

function McpConfiguredServerRow(props: {
  entry: McpServerEntry;
  status: ReactMcpStatus;
  errorInfo: string | null;
  selected: boolean;
  busy: boolean;
  logoutBusy: boolean;
  logoutTarget: string | null;
  togglingMcp: string | null;
  displayName: (name: string) => string;
  supportsOauth: (entry: McpServerEntry) => boolean;
  onSelect: (name: string | null) => void;
  onAuthorize: (entry: McpServerEntry) => void;
  onRequestLogout: (name: string) => void;
  onRemove: (name: string) => void;
  onToggleEnabled?: (name: string, enabled: boolean) => Promise<void> | void;
  onToggleBusy: (value: SetStateAction<string | null>) => void;
}) {
  const Icon = serviceIcon(props.entry.name);
  return (
    <div className={`rounded-xl border transition-all ${props.selected ? "border-primary-muted bg-primary-soft shadow-sm" : "border-dls-border bg-dls-surface hover:bg-dls-hover"}`}>
      <button type="button" className="w-full px-4 py-3.5 text-left" onClick={() => props.onSelect(props.selected ? null : props.entry.name)}>
        <div className="flex items-center gap-3">
          <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${props.status === "connected" ? "border-success-muted bg-success-soft" : serviceIconBg(props.entry.name)}`}>
            <Icon size={15} className={props.status === "connected" ? "text-success-ink" : serviceColor(props.entry.name)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-dls-text">{props.displayName(props.entry.name)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className={`size-2 rounded-full ${statusDot(props.status)}`} />
            <span className="text-[11px] text-dls-secondary">{friendlyStatus(props.status)}</span>
          </div>
          <div className={`transition-transform ${props.selected ? "rotate-180" : ""}`}>
            <ChevronDown size={14} className="text-dls-secondary/40" />
          </div>
        </div>
      </button>

      {props.selected ? <McpConfiguredServerDetails {...props} /> : null}
    </div>
  );
}

function McpConfiguredServerDetails(props: Parameters<typeof McpConfiguredServerRow>[0]) {
  return (
    <div className="animate-in fade-in slide-in-from-top-1 space-y-3 border-t border-primary-muted/20 px-4 py-3 duration-200">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-dls-secondary">{t("mcp.connection_type")}</span>
        <span className="text-dls-text">{props.entry.config.type === "remote" ? t("mcp.type_cloud") : t("mcp.type_local")}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-medium text-dls-text">
          {t("mcp.cap_tools")}
        </span>
        {props.entry.config.type === "remote" ? (
          <span className="rounded-md border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-medium text-dls-text">
            {t("mcp.cap_signin")}
          </span>
        ) : null}
      </div>
      {props.errorInfo ? <div className="rounded-lg border border-destructive-muted bg-destructive-soft px-3 py-2 text-xs text-destructive-ink">{props.errorInfo}</div> : null}
      {props.entry.managedOAuth?.status === "reconnect_required" && props.entry.managedOAuth.lastError ? (
        <div
          data-testid="mcp-managed-reconnect-reason"
          className="rounded-lg border border-warning-muted bg-warning-soft px-3 py-2 text-xs text-warning-ink"
        >
          {props.entry.managedOAuth.lastError}
        </div>
      ) : null}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-dls-secondary transition-colors hover:text-dls-text">
          <Code2 size={11} />
          {t("mcp.technical_details")}
          <ChevronDown size={10} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-1.5 break-all rounded-lg bg-dls-hover px-3 py-2 font-mono text-[11px] text-dls-secondary">
          {props.entry.config.type === "remote" ? props.entry.config.url : props.entry.config.command?.join(" ")}
        </div>
      </details>
      <McpConfiguredServerAuthActions {...props} />
      <div className="flex justify-end gap-2 pt-1">
        {props.onToggleEnabled && props.entry.source !== "config.global" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={props.busy || props.togglingMcp === props.entry.name}
            onClick={(event) => {
              event.stopPropagation();
              if (props.togglingMcp) return;
              const next = props.entry.config.enabled !== false ? false : true;
              props.onToggleBusy(props.entry.name);
              void Promise.resolve(props.onToggleEnabled?.(props.entry.name, next)).finally(() => props.onToggleBusy(null));
            }}
          >
            <Power size={13} />
            {props.entry.config.enabled === false ? t("mcp.enable_app") : t("mcp.disable_app")}
          </Button>
        ) : null}
        <Button
          variant="destructive"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            props.onRemove(props.entry.name);
          }}
        >
          {t("mcp.remove_app")}
        </Button>
      </div>
    </div>
  );
}

function McpConfiguredServerAuthActions(props: Parameters<typeof McpConfiguredServerRow>[0]) {
  if (!props.supportsOauth(props.entry)) return null;
  if (props.status !== "connected") {
    return (
      <>
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs text-dls-secondary">{t("mcp.logout_label")}</div>
          <Button
            data-testid="mcp-managed-auth-action"
            size="sm"
            disabled={props.busy}
            onClick={() => props.onAuthorize(props.entry)}
          >
            {props.status === "reconnect_required" ? t("mcp.action_reconnect") : t("mcp.login_action")}
          </Button>
        </div>
        <div className="text-[11px] text-dls-secondary/70">{t("mcp.login_hint")}</div>
      </>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-xs text-dls-secondary">{t("mcp.logout_label")}</div>
        <Button
          variant="destructive"
          size="sm"
          disabled={props.busy || props.logoutBusy}
          onClick={() => props.onRequestLogout(props.entry.name)}
        >
          {props.logoutBusy && props.logoutTarget === props.entry.name ? t("mcp.logout_working") : t("mcp.logout_action")}
        </Button>
      </div>
      <div className="text-[11px] text-dls-secondary/70">{t("mcp.logout_hint")}</div>
    </>
  );
}

function McpAdvancedConfigSection(props: {
  open: boolean;
  configScope: ConfigScope;
  activeConfig: OpencodeConfigFile | null;
  canRevealConfig: boolean;
  revealBusy: boolean;
  revealLabel: string;
  configError: string | null;
  onToggle: () => void;
  onScopeChange: (scope: ConfigScope) => void;
  onReveal: () => Promise<void>;
  onAddMcp: () => void;
  onImportFromGithub?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-dls-border bg-dls-surface">
      <button type="button" className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-dls-hover" onClick={props.onToggle}>
        <div className="flex items-center gap-3">
          <Settings2 size={16} className="text-dls-secondary" />
          <div className="text-left">
            <div className="text-sm font-medium text-dls-text">{t("mcp.advanced_settings")}</div>
            <div className="text-xs text-dls-secondary">{t("mcp.advanced_settings_hint")}</div>
          </div>
        </div>
        <div className={`transition-transform ${props.open ? "rotate-180" : ""}`}>
          <ChevronDown size={16} className="text-dls-secondary" />
        </div>
      </button>
      {props.open ? (
        <div className="animate-in fade-in slide-in-from-top-1 space-y-4 border-t border-dls-border px-5 py-4 duration-200">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-dls-secondary">{t("mcp.custom_app_cta_hint")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={props.onAddMcp}>
                <Plus size={14} />
                {t("mcp.add_modal_title")}
              </Button>
              {props.onImportFromGithub ? (
                <Button variant="outline" onClick={props.onImportFromGithub}>
                  <Download size={14} />{t("mcp.from_github")}</Button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <McpConfigScopeButton scope="project" activeScope={props.configScope} onScopeChange={props.onScopeChange} />
            <McpConfigScopeButton scope="global" activeScope={props.configScope} onScopeChange={props.onScopeChange} />
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <div className="text-dls-secondary">{t("mcp.config_file")}</div>
            <div className="truncate font-mono text-[11px] text-dls-secondary/80">
              {props.activeConfig?.path ?? t("mcp.config_not_loaded")}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void props.onReveal()} disabled={!props.canRevealConfig}>
                {props.revealBusy ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t("mcp.opening_label")}
                  </>
                ) : (
                  <>
                    <FolderOpen size={14} />
                    {props.revealLabel}
                  </>
                )}
              </Button>
              <a href="https://opencode.ai/docs/mcp-servers/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-dls-secondary transition-colors hover:text-dls-text">
                {t("mcp.docs_link")}
                <ExternalLink size={11} />
              </a>
            </div>
            {props.activeConfig && props.activeConfig.exists === false ? <div className="text-[11px] text-dls-secondary">{t("mcp.file_not_found")}</div> : null}
          </div>
          {props.configError ? <div className="text-xs text-destructive-ink">{props.configError}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function McpConfigScopeButton(props: {
  scope: ConfigScope;
  activeScope: ConfigScope;
  onScopeChange: (scope: ConfigScope) => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        props.activeScope === props.scope
          ? "bg-dls-active text-dls-text"
          : "text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
      }`}
      onClick={() => props.onScopeChange(props.scope)}
    >
      {props.scope === "project" ? t("mcp.scope_project") : t("mcp.scope_global")}
    </button>
  );
}

export default McpView;
