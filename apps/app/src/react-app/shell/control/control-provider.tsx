/** @jsxImportSource react */
import {
  createContext,
  useCallback,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { isDesktopRuntime } from "@/app/utils";
import type {
  RedrobAffordanceDescriptor,
  RedrobAffordanceEffects,
  RedrobAffordanceRequest,
  RedrobAffordanceResult,
} from "@redrob/types/redrob-affordance";
import type { RedrobContextSnapshot } from "@redrob/types/redrob-context";

export type RedrobControlSideEffect = "none" | "navigation" | "mutation" | "external";

export type RedrobControlActionArg = {
  name: string;
  type?: "string" | "number" | "boolean" | "object" | "array" | "unknown";
  required?: boolean;
  description?: string;
};

export type RedrobControlActionMetadata = {
  id: string;
  label: string;
  description?: string;
  kind: "query" | "command";
  effects: RedrobAffordanceEffects;
  sideEffect: RedrobControlSideEffect;
  requiresConfirmation: boolean;
  requiresArgs: boolean;
  hasPreviewArgs: boolean;
  previewArgs?: unknown;
  args?: RedrobControlActionArg[];
  disabled: boolean;
  busy: boolean;
};

export type RedrobControlSnapshot = {
  version: number;
  enabled: boolean;
  route: string;
  status: "off" | "ready" | "acting";
  busyActionId: string | null;
  narration: string;
  actions: RedrobControlActionMetadata[];
};

export type RedrobControlResult =
  | { ok: true; actionId: string; result?: unknown }
  | { ok: false; actionId: string; error: string };

export type RedrobControlHelpers = {
  setNarration: (text: string) => void;
};

export type RedrobControlTargetRef = {
  readonly current: HTMLElement | null;
};

export type RedrobControlAction = {
  id: string;
  label: string;
  description?: string;
  kind?: "query" | "command";
  effects?: RedrobAffordanceEffects;
  sideEffect?: RedrobControlSideEffect;
  requiresConfirmation?: boolean;
  requiresArgs?: boolean;
  args?: RedrobControlActionArg[];
  previewArgs?: unknown;
  disabled?: boolean;
  targetRef?: RedrobControlTargetRef;
  execute: (args: unknown, helpers: RedrobControlHelpers) => unknown | Promise<unknown>;
};

type ControlActionRef = {
  readonly current: RedrobControlAction | null;
};

type RegisteredAction = {
  id: string;
  order: number;
  token: symbol;
  ref: ControlActionRef;
};

type SpotlightState = {
  visible: boolean;
  phase: "target" | "press";
  rect: { x: number; y: number; width: number; height: number } | null;
};

type RedrobControlContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  route: string;
  narration: string;
  busyActionId: string | null;
  actions: RedrobControlActionMetadata[];
  registerAction: (actionId: string, actionRef: ControlActionRef) => () => void;
  executeAction: (actionId: string, args?: unknown) => Promise<RedrobControlResult>;
  publishContext: (context: RedrobContextSnapshot) => void;
  snapshot: () => RedrobControlSnapshot;
};

type RedrobControlAPI = {
  version: number;
  snapshot: () => RedrobControlSnapshot;
  listActions: () => RedrobControlActionMetadata[];
  execute: (actionId: string, args?: unknown) => Promise<RedrobControlResult>;
  context: () => RedrobContextSnapshot;
  query: (request: RedrobAffordanceRequest) => Promise<RedrobAffordanceResult>;
  command: (request: RedrobAffordanceRequest) => Promise<RedrobAffordanceResult>;
  setEnabled: (enabled: boolean) => void;
  subscribe: (listener: (snapshot: RedrobControlSnapshot) => void) => () => void;
};

declare global {
  interface Window {
    __redrobControl?: RedrobControlAPI;
  }
}

const CONTROL_API_VERSION = 2;
const RedrobControlContext = createContext<RedrobControlContextValue | null>(null);
const SPOTLIGHT_TIMING_MS = Object.freeze({
  missingTarget: 80,
  scrollIntoView: 180,
  target: 260,
  press: 130,
  release: 80,
  done: 280,
});

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function returnedActionError(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const payload = result as { ok?: unknown; error?: unknown };
  if (payload.ok !== false) return null;
  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : "Action returned an error.";
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function effectsForSideEffect(sideEffect: RedrobControlSideEffect): RedrobAffordanceEffects {
  if (sideEffect === "navigation") {
    return { data: "none", ui: "navigate", external: false };
  }
  if (sideEffect === "mutation") {
    return { data: "write", ui: "none", external: false };
  }
  if (sideEffect === "external") {
    return { data: "none", ui: "none", external: true };
  }
  return { data: "none", ui: "none", external: false };
}

function metadataForAction(registered: RegisteredAction, busyActionId: string | null): RedrobControlActionMetadata {
  const action = registered.ref.current;
  const sideEffect = action?.sideEffect ?? "none";
  return {
    id: registered.id,
    label: action?.label ?? registered.id,
    description: action?.description,
    kind: action?.kind ?? "command",
    effects: action?.effects ?? effectsForSideEffect(sideEffect),
    sideEffect,
    requiresConfirmation: action?.requiresConfirmation === true,
    requiresArgs: action?.requiresArgs === true,
    hasPreviewArgs: action?.previewArgs !== undefined,
    previewArgs: action?.previewArgs,
    args: action?.args,
    disabled: action?.disabled === true,
    busy: busyActionId === registered.id,
  };
}

function affordanceForAction(action: RedrobControlActionMetadata): RedrobAffordanceDescriptor {
  return {
    id: action.id,
    kind: action.kind,
    title: action.label,
    description: action.description ?? action.label,
    provider: { id: "redrob-ui", kind: "builtin" },
    arguments: (action.args ?? []).map((argument) => ({
      name: argument.name,
      type: argument.type ?? "unknown",
      required: argument.required === true,
      ...(argument.description ? { description: argument.description } : {}),
    })),
    effects: action.effects,
    confirmation: action.requiresConfirmation ? "destructive" : "never",
    availability: {
      enabled: !action.disabled && !action.busy,
      ...(action.disabled ? { reason: "This action is not available in the current app state." } : {}),
    },
    executor: { kind: "redrob" },
  };
}

function ControlModeSpotlight({ spotlight }: { spotlight: SpotlightState }) {
  const rect = spotlight.rect;
  if (!spotlight.visible || !rect) return null;

  const pad = spotlight.phase === "press" ? 8 : 12;
  return (
    <div
      className="pointer-events-none fixed z-[9998] rounded-[18px] bg-[rgba(var(--dls-accent-rgb),0.1)] shadow-[0_0_0_9999px_rgba(7,10,18,0.08),0_0_36px_rgba(var(--dls-accent-rgb),0.32),inset_0_0_0_1px_rgba(var(--dls-accent-rgb),0.24)] transition-all duration-200 ease-out"
      style={{
        left: `${rect.x - pad}px`,
        top: `${rect.y - pad}px`,
        width: `${rect.width + pad * 2}px`,
        height: `${rect.height + pad * 2}px`,
        transform: spotlight.phase === "press" ? "scale(0.985)" : "scale(1)",
      }}
    />
  );
}

export function RedrobControlProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const actionsRef = useRef(new Map<string, RegisteredAction>());
  const listenersRef = useRef(new Set<(snapshot: RedrobControlSnapshot) => void>());
  const contextRef = useRef<RedrobContextSnapshot | null>(null);
  const contextRevisionRef = useRef(0);
  const nextOrderRef = useRef(1);
  const [version, setVersion] = useState(0);
  const [enabledState, setEnabledState] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [narration, setNarration] = useState("Control mode is off.");
  const [spotlight, setSpotlight] = useState<SpotlightState>({ visible: false, phase: "target", rect: null });
  const busyActionIdRef = useRef<string | null>(null);
  const busyActorRef = useRef<string | null>(null);
  const spotlightRunRef = useRef(0);

  const route = `${location.pathname}${location.search}${location.hash}`;
  const enabled = enabledState;
  const status: RedrobControlSnapshot["status"] = !enabled ? "off" : busyActionId ? "acting" : "ready";

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
  }, []);

  const listActionMetadata = useCallback((nextBusyActionId = busyActionId) => {
    return Array.from(actionsRef.current.values())
      .sort((left, right) => left.order - right.order)
      .map((action) => metadataForAction(action, nextBusyActionId));
  }, [busyActionId, version]);

  const actions = useMemo(() => {
    return listActionMetadata();
  }, [listActionMetadata]);

  const snapshot = useCallback((): RedrobControlSnapshot => ({
    version: CONTROL_API_VERSION,
    enabled,
    route,
    status,
    busyActionId,
    narration,
    actions: listActionMetadata(),
  }), [busyActionId, enabled, listActionMetadata, narration, route, status]);

  const publishContext = useCallback((context: RedrobContextSnapshot) => {
    if (contextRef.current === context) return;
    contextRef.current = context;
    contextRevisionRef.current += 1;
  }, []);

  const contextSnapshot = useCallback((): RedrobContextSnapshot => {
    const availableAffordances = listActionMetadata().map(affordanceForAction);
    const published = contextRef.current;
    const revision = contextRevisionRef.current;
    if (published) {
      return {
        ...published,
        revision,
        capturedAt: new Date().toISOString(),
        availableAffordances,
        execution: {
          ...published.execution,
          busyCommandId: busyActionId,
          busyActor: busyActorRef.current,
        },
      };
    }
    return {
      schemaVersion: 1,
      revision,
      capturedAt: new Date().toISOString(),
      screen: { kind: "other", route },
      conversations: { tabs: [], layout: { kind: "empty" } },
      chrome: {
        sidebarOpen: true,
        applicationMenuVisible: false,
        rightSidebarExpanded: false,
      },
      execution: {
        queries: "parallel",
        commands: "serialized",
        busyCommandId: busyActionId,
        busyActor: busyActorRef.current,
      },
      sidePanel: {
        open: false,
        ownerSessionId: null,
        kind: null,
        tabs: [],
        activeTabId: null,
      },
      resources: [{
        ref: `screen:${route}`,
        kind: "screen",
        title: "Redrob Work",
        provider: { id: "redrob-ui", kind: "builtin" },
        state: { kind: "other", route },
      }],
      availableAffordances,
      contributions: [],
    };
  }, [busyActionId, listActionMetadata, route]);

  const registerAction = useCallback((actionId: string, actionRef: ControlActionRef) => {
    const token = Symbol(actionId);
    const previous = actionsRef.current.get(actionId);
    actionsRef.current.set(actionId, {
      id: actionId,
      order: previous?.order ?? nextOrderRef.current++,
      token,
      ref: actionRef,
    });
    contextRevisionRef.current += 1;
    setVersion((current) => current + 1);

    return () => {
      const current = actionsRef.current.get(actionId);
      if (current?.token === token) {
        actionsRef.current.delete(actionId);
        contextRevisionRef.current += 1;
        setVersion((value) => value + 1);
      }
    };
  }, []);

  const playTargetChoreography = useCallback(async (action: RedrobControlAction, runId: number) => {
    if (!isBrowser()) return;
    const stillCurrent = () => spotlightRunRef.current === runId;
    const target = action.targetRef?.current;
    if (!target) {
      await wait(SPOTLIGHT_TIMING_MS.missingTarget);
      return;
    }

    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    await wait(SPOTLIGHT_TIMING_MS.scrollIntoView);
    if (!stillCurrent() || !target.isConnected) return;
    const rect = target.getBoundingClientRect();
    setSpotlight({
      visible: true,
      phase: "target",
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
    await wait(SPOTLIGHT_TIMING_MS.target);
    if (!stillCurrent()) return;
    setSpotlight((current) => ({ ...current, phase: "press" }));
    await wait(SPOTLIGHT_TIMING_MS.press);
    if (!stillCurrent()) return;
    setSpotlight((current) => ({ ...current, phase: "target" }));
    await wait(SPOTLIGHT_TIMING_MS.release);
  }, []);

  const executeAction = useCallback(async (actionId: string, args?: unknown): Promise<RedrobControlResult> => {
    const registered = actionsRef.current.get(actionId);
    const action = registered?.ref.current;
    if (!registered || !action) return { ok: false, actionId, error: `Unknown action: ${actionId}` };
    if (action.disabled) return { ok: false, actionId, error: `Action is disabled: ${action.label}` };
    if (busyActionIdRef.current) {
      const actor = busyActorRef.current ? ` for ${busyActorRef.current}` : "";
      return { ok: false, actionId, error: `Already acting: ${busyActionIdRef.current}${actor}` };
    }

    if (action.requiresConfirmation && isBrowser()) {
      const confirmed = window.confirm(`Allow Control Mode to ${action.label}?`);
      if (!confirmed) return { ok: false, actionId, error: "User cancelled action." };
    }

    const runId = spotlightRunRef.current + 1;
    spotlightRunRef.current = runId;
    busyActionIdRef.current = action.id;
    contextRevisionRef.current += 1;
    setEnabled(true);
    setBusyActionId(action.id);
    setNarration(`Moving to ${action.label}…`);

    try {
      await playTargetChoreography(action, runId);
      setNarration(`Running ${action.label}…`);
      const effectiveArgs = args === undefined ? action.previewArgs : args;
      const result = await action.execute(effectiveArgs, { setNarration });
      const resultError = returnedActionError(result);
      if (resultError) {
        setNarration(`Could not ${action.label}: ${resultError}`);
        if (spotlightRunRef.current === runId) {
          setSpotlight({ visible: false, phase: "target", rect: null });
        }
        return { ok: false, actionId, error: resultError };
      }
      setNarration(`Done: ${action.label}`);
      await wait(SPOTLIGHT_TIMING_MS.done);
      if (spotlightRunRef.current === runId) {
        setSpotlight({ visible: false, phase: "target", rect: null });
      }
      return { ok: true, actionId, result };
    } catch (error) {
      const message = describeError(error);
      setNarration(`Could not ${action.label}: ${message}`);
      if (spotlightRunRef.current === runId) {
        setSpotlight({ visible: false, phase: "target", rect: null });
      }
      return { ok: false, actionId, error: message };
    } finally {
      if (busyActionIdRef.current === action.id) busyActionIdRef.current = null;
      contextRevisionRef.current += 1;
      setBusyActionId(null);
    }
  }, [playTargetChoreography, setEnabled]);

  const queryAffordance = useCallback(async (
    request: RedrobAffordanceRequest,
  ): Promise<RedrobAffordanceResult> => {
    const action = actionsRef.current.get(request.id)?.ref.current;
    const revision = contextRevisionRef.current;
    if (!action || action.kind !== "query") {
      return {
        ok: false,
        id: request.id,
        error: `Unknown query: ${request.id}`,
        code: "unavailable",
        revision,
      };
    }
    if (action.disabled) {
      return {
        ok: false,
        id: request.id,
        error: `Query is disabled: ${action.label}`,
        code: "unavailable",
        revision,
      };
    }
    try {
      const effectiveArgs = request.args === undefined ? action.previewArgs : request.args;
      const result = await action.execute(effectiveArgs, { setNarration: () => undefined });
      const resultError = returnedActionError(result);
      if (resultError) {
        return {
          ok: false,
          id: request.id,
          error: resultError,
          code: "failed",
          revision,
        };
      }
      return {
        ok: true,
        id: request.id,
        result,
        revision,
        effects: action.effects ?? { data: "read", ui: "none", external: false },
      };
    } catch (error) {
      return {
        ok: false,
        id: request.id,
        error: describeError(error),
        code: "failed",
        revision,
      };
    }
  }, []);

  const executeCommand = useCallback(async (
    request: RedrobAffordanceRequest,
  ): Promise<RedrobAffordanceResult> => {
    const action = actionsRef.current.get(request.id)?.ref.current;
    const revision = contextRevisionRef.current;
    if (!action || action.kind === "query") {
      return {
        ok: false,
        id: request.id,
        error: `Unknown command: ${request.id}`,
        code: "unavailable",
        revision,
      };
    }
    if (busyActionIdRef.current) {
      const actor = busyActorRef.current ? ` for ${busyActorRef.current}` : "";
      return {
        ok: false,
        id: request.id,
        error: `Already acting: ${busyActionIdRef.current}${actor}`,
        code: "conflict",
        revision,
      };
    }
    if (request.expectedRevision !== undefined && request.expectedRevision !== revision) {
      return {
        ok: false,
        id: request.id,
        error: `Redrob Work context changed from revision ${request.expectedRevision} to ${revision}.`,
        code: "conflict",
        revision,
      };
    }
    busyActorRef.current = request.actor ?? null;
    const result = await executeAction(request.id, request.args);
    if (!busyActionIdRef.current) busyActorRef.current = null;
    if (!result.ok) {
      return {
        ok: false,
        id: request.id,
        error: result.error,
        code: result.error.startsWith("Already acting:") ? "conflict" : "failed",
        revision: contextRevisionRef.current,
      };
    }
    const sideEffect = action.sideEffect ?? "none";
    return {
      ok: true,
      id: request.id,
      result: result.result,
      revision: contextRevisionRef.current,
      effects: action.effects ?? effectsForSideEffect(sideEffect),
    };
  }, [executeAction]);

  const value = useMemo<RedrobControlContextValue>(() => ({
    enabled,
    setEnabled,
    route,
    narration,
    busyActionId,
    actions,
    registerAction,
    executeAction,
    publishContext,
    snapshot,
  }), [
    actions,
    busyActionId,
    enabled,
    executeAction,
    narration,
    publishContext,
    registerAction,
    route,
    setEnabled,
    snapshot,
  ]);

  useEffect(() => {
    if (!enabled) {
      setNarration("Control mode is off.");
    } else if (narration === "Control mode is off.") {
      setNarration("Ready. A controller can inspect and run visible actions.");
    }
  }, [enabled, narration]);

  useEffect(() => {
    if (!isBrowser()) return;

    const api: RedrobControlAPI = {
      version: CONTROL_API_VERSION,
      snapshot,
      listActions: () => snapshot().actions,
      execute: executeAction,
      context: contextSnapshot,
      query: queryAffordance,
      command: executeCommand,
      setEnabled,
      subscribe(listener) {
        listenersRef.current.add(listener);
        listener(snapshot());
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    };

    window.__redrobControl = api;
    return () => {
      if (window.__redrobControl === api) {
        delete window.__redrobControl;
      }
    };
  }, [contextSnapshot, executeAction, executeCommand, queryAffordance, setEnabled, snapshot]);

  useEffect(() => {
    busyActionIdRef.current = busyActionId;
  }, [busyActionId]);

  useEffect(() => {
    const next = snapshot();
    listenersRef.current.forEach((listener) => listener(next));
  }, [snapshot, version]);

  return (
    <RedrobControlContext.Provider value={value}>
      {children}
      <ControlModeSpotlight spotlight={spotlight} />
    </RedrobControlContext.Provider>
  );
}

export function useRedrobControl() {
  return use(RedrobControlContext);
}

export function usePublishRedrobContext(context: RedrobContextSnapshot) {
  const control = useRedrobControl();
  const publishContext = control?.publishContext;

  useEffect(() => {
    publishContext?.(context);
  }, [context, publishContext]);
}

export function useControlAction(action: RedrobControlAction | null | false | undefined) {
  const control = useRedrobControl();
  const registerAction = control?.registerAction;
  const latestActionRef = useRef<RedrobControlAction | null>(action || null);
  latestActionRef.current = action || null;
  const actionId = action ? action.id : null;

  useEffect(() => {
    if (!registerAction || !actionId) return undefined;
    return registerAction(actionId, latestActionRef);
  }, [actionId, registerAction]);
}

/**
 * Register a dynamic list of control actions. Unlike calling useControlAction
 * per item, this scales to an arbitrary, changing number of actions without
 * violating the rules of hooks. Each action is tracked by its stable id; the
 * latest closure for that id is always used, and removed ids are unregistered.
 */
export function useControlActions(actions: readonly RedrobControlAction[]) {
  const control = useRedrobControl();
  const registerAction = control?.registerAction;

  // One ref per action id, so executeAction always sees the freshest closure.
  const refsById = useRef<Map<string, { current: RedrobControlAction | null }>>(new Map());
  for (const action of actions) {
    const existing = refsById.current.get(action.id);
    if (existing) {
      existing.current = action;
    } else {
      refsById.current.set(action.id, { current: action });
    }
  }

  const ids = actions.map((action) => action.id).join("\u0000");

  useEffect(() => {
    if (!registerAction) return undefined;
    const liveIds = new Set(actions.map((action) => action.id));
    // Drop refs for ids that no longer exist.
    for (const id of Array.from(refsById.current.keys())) {
      if (!liveIds.has(id)) refsById.current.delete(id);
    }
    const cleanups = actions.map((action) => {
      const ref = refsById.current.get(action.id);
      return ref ? registerAction(action.id, ref) : undefined;
    });
    return () => {
      for (const cleanup of cleanups) cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerAction, ids]);
}

import { SETTINGS_TAB_VALUES } from "../../../app/types";

const SETTINGS_TABS: ReadonlySet<string> = new Set<string>(
  SETTINGS_TAB_VALUES.filter((tab) => tab !== "extensions"),
);

export function RedrobRouteControlActions() {
  const navigate = useNavigate();

  const actions = useMemo<RedrobControlAction[]>(() => [
    {
      id: "route.session",
      label: "Open sessions",
      description: "Navigate to the main session view.",
      sideEffect: "navigation",
      execute: () => navigate("/session"),
    },
    {
      id: "route.settings.general",
      label: "Open general settings",
      description: "Navigate to general settings.",
      sideEffect: "navigation",
      execute: () => navigate("/settings/general"),
    },
    {
      id: "route.extensions.skills",
      label: "Open extensions",
      description: "Browse the skills and MCPs available to this agent.",
      sideEffect: "navigation",
      execute: () => navigate("/extensions/skills"),
    },
    {
      id: "route.settings.providers",
      label: "Open provider settings",
      description: "Navigate to AI provider settings.",
      sideEffect: "navigation",
      execute: () => navigate("/settings/ai"),
    },
    {
      id: "route.settings.authorized_folders",
      label: "Open authorized folder settings",
      description: "Navigate to authorized folders and file access settings.",
      sideEffect: "navigation",
      execute: () => navigate("/settings/permissions"),
    },
    {
      id: "route.settings.appearance",
      label: "Open appearance settings",
      description: "Navigate to appearance settings.",
      sideEffect: "navigation",
      execute: () => navigate("/settings/appearance"),
    },
    {
      id: "settings.panel.open",
      label: "Open a settings panel",
      description: "Navigate to a specific settings panel by tab id.",
      sideEffect: "navigation",
      requiresArgs: true,
      args: [
        {
          name: "panel",
          type: "string",
          required: true,
          description:
            "Settings tab: general | ai | preferences | permissions | shell | environment | advanced | appearance | updates | recovery | debug | cloud-account | cloud-providers",
        },
      ],
      previewArgs: { panel: "ai" },
      execute: (args) => {
        const requested = (args as { panel?: unknown } | undefined)?.panel;
        const panel = typeof requested === "string" ? requested.trim() : "";
        if (!SETTINGS_TABS.has(panel)) {
          return {
            ok: false,
            error: `Unknown settings panel: ${panel || "(empty)"}. Expected one of ${Array.from(SETTINGS_TABS).join(", ")}.`,
          };
        }
        navigate(`/settings/${panel}`);
        return { ok: true, panel };
      },
    },
    {
      id: "route.back",
      label: "Go back",
      description: "Navigate back one entry in history.",
      sideEffect: "navigation",
      execute: () => navigate(-1),
    },
    {
      id: "route.forward",
      label: "Go forward",
      description: "Navigate forward one entry in history.",
      sideEffect: "navigation",
      execute: () => navigate(1),
    },
    {
      id: "help.capabilities",
      label: "What can Redrob Work do?",
      description: "List the main capabilities of Redrob Work.",
      kind: "query",
      effects: { data: "read", ui: "none", external: false },
      sideEffect: "none",
      execute: () => ({
        capabilities: [
          { id: "browse", label: "Browse the web", description: "Control a browser to navigate, scrape, and automate web tasks." },
          { id: "providers", label: "AI model providers", description: "Connect Anthropic, OpenAI, Google, OpenRouter, Ollama, or other LLM providers." },
          { id: "extensions", label: "Library", description: "Skills, connections, and tools your agent can use." },
          { id: "voice", label: "Voice mode", description: "Talk to Redrob Work with real-time voice using OpenAI Realtime." },
          { id: "files", label: "File management", description: "Read, write, and organize files in your workspace." },
          { id: "code", label: "Write and run code", description: "Generate, edit, and execute code with full tool access." },
          { id: "computer-use", label: "Computer use", description: "Control your computer with screenshots and mouse/keyboard actions." },
          { id: "skills", label: "Skills", description: "Install specialized skill packs for specific workflows." },
          ...(isDesktopRuntime()
            ? [{ id: "automations", label: "Automations", description: "Schedule recurring tasks and background agents." }]
            : []),
          { id: "sharing", label: "Share sessions", description: "Share workspace sessions with collaborators via Redrob Work Cloud." },
        ],
        hint: "Use settings.panel.open for settings such as AI providers, and route.extensions.skills to browse Library.",
      }),
    },
  ], [navigate]);

  useControlActions(actions);
  return null;
}
