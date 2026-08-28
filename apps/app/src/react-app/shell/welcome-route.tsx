/** @jsxImportSource react */
import { useCallback, useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router";

import { t } from "../../i18n";
import {
  pickDirectory,
  resolveWorkspaceListSelectedId,
  workspaceSetRuntimeActive,
  workspaceSetSelected,
  type WorkspaceInfo,
  type WorkspaceList,
} from "../../app/lib/desktop";
import { isDesktopRuntime } from "../../app/utils";
import { createClient, unwrap } from "../../app/lib/opencode";
import { useLocal } from "../kernel/local-provider";
import { usePlatform } from "../kernel/platform";
import { WelcomePage } from "../domains/onboarding/welcome-page";
import { RedrobKeyStep } from "../domains/onboarding/redrob-key-step";
import { LanguageStep } from "../domains/onboarding/language-step";
import { EngineDownloadStep } from "../domains/onboarding/engine-download-step";
import { AttributionStep, type AttributionSource } from "../domains/onboarding/attribution-step";
import { REDROB_CONSOLE_URL } from "../domains/settings/redrob-provider";
import { connectRedrobKey } from "../domains/onboarding/redrob-key-connect";
import { CreateWorkspaceModal } from "../domains/workspace/create-workspace-modal";
import type { CreateWorkspaceOptions } from "../domains/workspace/types";

import { resolveRedrobConnection } from "./redrob-connection";
import { captureAnalyticsEvent } from "../../app/lib/analytics";
import { buildRedrobWorkspaceBaseUrl, createRedrobServerClient } from "../../app/lib/redrob-server";
import { writeActiveWorkspaceId, writeLastSessionFor, writeWorkspaceProjectDimension } from "./session-memory";
import { workspaceSessionRoute } from "./workspace-routes";
import { ensureDesktopLocalRedrobConnection } from "./desktop-local-redrob";


function folderNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "workspace";
}

function focusPromptSoon() {
  if (typeof window === "undefined") return;
  const focus = () => window.dispatchEvent(new Event("redrob:focusPrompt"));
  [0, 80, 240, 600].forEach((delay) => window.setTimeout(focus, delay));
}

/**
 * First-run wizard stage that precedes the existing workspace-creation flow.
 * "language" and "engine" are the two new leading onboarding steps; once the
 * user reaches "main" the existing WelcomePage -> create -> redrob-key ->
 * attribution flow runs unchanged. Language is always shown first.
 */
type WelcomeStage = "language" | "engine" | "main";

type WelcomeState = {
  stage: WelcomeStage;
  modalOpen: boolean;
  createBusy: boolean;
  createError: string | null;
  redrobKeyStep: boolean;
  redrobKeyBusy: boolean;
  redrobKeyError: string | null;
  attributionStep: boolean;
  pendingRoute: string | null;
  pendingWorkspaceId: string | null;
  pendingSessionId: string | null;
};

type WelcomeAction =
  | { type: "stage"; stage: WelcomeStage }
  | { type: "open" }
  | { type: "close" }
  | { type: "create:start" }
  | { type: "create:error"; error: string }
  | { type: "create:finish" }
  | { type: "redrob-key-step"; workspaceId: string; sessionId: string | null }
  | { type: "redrob-key:start" }
  | { type: "redrob-key:error"; error: string }
  | { type: "redrob-key:finish" }
  | { type: "attribution-step"; route: string };

const initialWelcomeState: WelcomeState = {
  stage: "language",
  modalOpen: false,
  createBusy: false,
  createError: null,
  redrobKeyStep: false,
  redrobKeyBusy: false,
  redrobKeyError: null,
  attributionStep: false,
  pendingRoute: null,
  pendingWorkspaceId: null,
  pendingSessionId: null,
};

function welcomeReducer(state: WelcomeState, action: WelcomeAction): WelcomeState {
  switch (action.type) {
    case "stage":
      return { ...state, stage: action.stage };
    case "open":
      return { ...state, modalOpen: true };
    case "close":
      return { ...state, modalOpen: false, createError: null };
    case "create:start":
      return { ...state, createBusy: true, createError: null };
    case "create:error":
      return { ...state, createError: action.error };
    case "create:finish":
      return { ...state, createBusy: false };
    case "redrob-key-step":
      return {
        ...state,
        redrobKeyStep: true,
        redrobKeyError: null,
        pendingWorkspaceId: action.workspaceId,
        pendingSessionId: action.sessionId,
      };
    case "redrob-key:start":
      return { ...state, redrobKeyBusy: true, redrobKeyError: null };
    case "redrob-key:error":
      return { ...state, redrobKeyBusy: false, redrobKeyError: action.error };
    case "redrob-key:finish":
      return { ...state, redrobKeyBusy: false };
    case "attribution-step":
      return {
        ...state,
        redrobKeyStep: false,
        attributionStep: true,
        pendingRoute: action.route,
      };
  }
}

export function WelcomeRoute() {
  const navigate = useNavigate();
  const local = useLocal();
  const platform = usePlatform();
  const [state, dispatch] = useReducer(welcomeReducer, initialWelcomeState);
  const [manualFolder, setManualFolder] = useState("");
  // If user already completed onboarding, redirect away immediately.
  useEffect(() => {
    if (local.prefs.hasCompletedOnboarding) {
      navigate("/session", { replace: true });
    }
  }, [local.prefs.hasCompletedOnboarding, navigate]);

  const markOnboardingComplete = useCallback(() => {
    local.setPrefs((prev) => ({ ...prev, hasCompletedOnboarding: true }));
  }, [local]);

  const handleCreateWorkspace = useCallback(
    async (_preset: string, folder: string | null, options?: CreateWorkspaceOptions) => {
      if (!folder) return;
      const projectLabel = options?.projectLabel?.trim() ?? "";
      dispatch({ type: "create:start" });
      try {
        const workspaceName = folderNameFromPath(folder);
        let list: WorkspaceList | null = null;
        let sessionBaseUrl = "";
        let sessionToken = "";
        try {
          const { normalizedBaseUrl, resolvedToken, resolvedHostToken } =
            await resolveRedrobConnection();
          if (normalizedBaseUrl && (resolvedToken || resolvedHostToken)) {
            const redrobClient = createRedrobServerClient({
              baseUrl: normalizedBaseUrl,
              token: resolvedToken || undefined,
              hostToken: resolvedHostToken || undefined,
            });
            list = await redrobClient.createLocalWorkspace({
              folderPath: folder,
              name: workspaceName,
              preset: "starter",
            });
            sessionBaseUrl = normalizedBaseUrl;
            sessionToken = resolvedToken;
          }
        } catch {
          list = null;
        }
        if (!list) {
          throw new Error("Redrob Work server is unavailable. Start or reconnect the server before creating a workspace.");
        }
        const createdId =
          resolveWorkspaceListSelectedId(list) ||
          list.workspaces[list.workspaces.length - 1]?.id ||
          "";
        let targetWorkspaceId = createdId;
        let targetWorkspace = list.workspaces.find((workspace: WorkspaceInfo) => workspace.id === createdId) ?? null;
        let targetSessionId: string | null = null;
        if (createdId) {
          await workspaceSetSelected(createdId).catch(() => undefined);
          await workspaceSetRuntimeActive(createdId).catch(() => undefined);
          writeActiveWorkspaceId(createdId);
        }
        if (targetWorkspace) {
          await ensureDesktopLocalRedrobConnection({
            route: "session",
            workspace: targetWorkspace,
            allWorkspaces: list.workspaces,
          }).catch(() => undefined);
          const fresh = await resolveRedrobConnection().catch(() => null);
          if (fresh?.normalizedBaseUrl && fresh.resolvedToken) {
            sessionBaseUrl = fresh.normalizedBaseUrl;
            sessionToken = fresh.resolvedToken;
          }
        }
        if (targetWorkspaceId && sessionBaseUrl && sessionToken) {
          try {
            const workspacePath = targetWorkspace?.path?.trim() || folder;
            const session = unwrap(await createClient(
              `${(buildRedrobWorkspaceBaseUrl(sessionBaseUrl, targetWorkspaceId) ?? sessionBaseUrl).replace(/\/+$/, "")}/opencode`,
              workspacePath || undefined,
              { token: sessionToken, mode: "redrob" },
            ).session.create({ directory: workspacePath || undefined }));
            targetSessionId = session.id;
            captureAnalyticsEvent("task_created", { source: "onboarding", workspace_type: "local" });
          } catch {
            // Best-effort first task creation.
          }
        }
        if (targetWorkspaceId) {
          writeActiveWorkspaceId(targetWorkspaceId);
          if (projectLabel) {
            writeWorkspaceProjectDimension(targetWorkspaceId, {
              label: projectLabel,
            });
          }
          if (targetSessionId) writeLastSessionFor(targetWorkspaceId, targetSessionId);
        }
        dispatch({ type: "close" });
        // Redrob-only onboarding: prompt for the console.redrob.ai API key
        // before the provider/attribution steps and the session redirect.
        dispatch({ type: "redrob-key-step", workspaceId: targetWorkspaceId, sessionId: targetSessionId });

      } catch (error) {
        dispatch({
          type: "create:error",
          error: error instanceof Error ? error.message : "Failed to create workspace.",
        });
      } finally {
        dispatch({ type: "create:finish" });
      }
    },
    [],
  );

  const handleGetStarted = useCallback(async () => {
    if (!isDesktopRuntime()) {
      // Non-desktop: fall back to the modal for remote workspace creation.
      dispatch({ type: "open" });
      return;
    }
    const picked = await pickDirectory({ title: t("onboarding.authorize_folder") });
    const folder = typeof picked === "string" ? picked : null;
    if (!folder) return;
    await handleCreateWorkspace("starter", folder);
  }, [handleCreateWorkspace]);

  const handleUseManualFolder = useCallback(async () => {
    const folder = manualFolder.trim();
    if (!folder) return;
    await handleCreateWorkspace("starter", folder);
  }, [handleCreateWorkspace, manualFolder]);

  const handleOpenRedrobConsole = useCallback(() => {
    platform.openLink(REDROB_CONSOLE_URL);
  }, [platform]);

  const handleSubmitRedrobKey = useCallback(
    async (apiKey: string) => {
      const trimmed = apiKey.trim();
      if (!trimmed) return;
      dispatch({ type: "redrob-key:start" });
      try {
        const { normalizedBaseUrl, resolvedToken, resolvedHostToken } =
          await resolveRedrobConnection();
        if (!normalizedBaseUrl || !(resolvedToken || resolvedHostToken)) {
          throw new Error(t("welcome.redrob_key_error_server"));
        }
        // Hands the key to Redrob Code's auth store. Work keeps no copy; this
        // resolves only once the engine reports it connected. See connectRedrobKey.
        await connectRedrobKey(
          createRedrobServerClient({
            baseUrl: normalizedBaseUrl,
            token: resolvedToken || undefined,
            hostToken: resolvedHostToken || undefined,
          }),
          trimmed,
        );
        dispatch({ type: "redrob-key:finish" });
        dispatch({
          type: "attribution-step",
          route: state.pendingWorkspaceId
            ? `${workspaceSessionRoute(state.pendingWorkspaceId, state.pendingSessionId)}?onboarding=1`
            : "/session?onboarding=1",
        });
      } catch (error) {
        dispatch({
          type: "redrob-key:error",
          error: error instanceof Error ? error.message : t("welcome.redrob_key_error_server"),
        });
      }
    },
    [state.pendingSessionId, state.pendingWorkspaceId],
  );

  const finishOnboarding = useCallback(() => {
    markOnboardingComplete();
    navigate(state.pendingRoute ?? "/session", { replace: true });
    if (state.pendingSessionId) focusPromptSoon();
  }, [markOnboardingComplete, navigate, state.pendingRoute, state.pendingSessionId]);

  // "Just look around": the browse-mode branch of the API-key step. Browsing
  // finishes onboarding without a key, but still runs the attribution survey
  // (as the keyed path does) so browse users are not silently dropped from
  // attribution coverage. Never throws.
  const handleLookAround = useCallback(() => {
    captureAnalyticsEvent("onboarding_browse_mode_selected");
    const route = state.pendingWorkspaceId
      ? workspaceSessionRoute(state.pendingWorkspaceId, state.pendingSessionId)
      : "/session";
    dispatch({ type: "attribution-step", route });
  }, [state.pendingSessionId, state.pendingWorkspaceId]);

  const handleAttributionSubmit = useCallback(
    (source: AttributionSource, aiPrompt?: string) => {
      const prompt = aiPrompt?.trim().slice(0, 500) ?? "";
      captureAnalyticsEvent("attribution_survey_submitted", {
        source,
        // User-volunteered survey answer (not session content); see survey UI.
        ai_prompt: prompt || null,
        ai_prompt_length: prompt.length,
      });
      finishOnboarding();
    },
    [finishOnboarding],
  );

  const handleAttributionSkip = useCallback(() => {
    captureAnalyticsEvent("attribution_survey_skipped");
    finishOnboarding();
  }, [finishOnboarding]);

  // Leading onboarding steps run before the existing workspace-creation flow.
  // Language is always the first thing shown; engine download follows; then
  // the "main" stage renders the established WelcomePage -> create -> key ->
  // provider -> attribution flow unchanged.
  if (state.stage === "language") {
    return <LanguageStep onContinue={() => dispatch({ type: "stage", stage: "engine" })} />;
  }
  if (state.stage === "engine") {
    return (
      <EngineDownloadStep
        onBack={() => dispatch({ type: "stage", stage: "language" })}
        onContinue={() => dispatch({ type: "stage", stage: "main" })}
      />
    );
  }

  return (
    <>
      <WelcomePage
        onGetStarted={handleGetStarted}
        busy={state.createBusy}
        error={state.createError}
        manualFolder={manualFolder}
        onManualFolderChange={setManualFolder}
        onUseManualFolder={handleUseManualFolder}
        showManualFolder={import.meta.env.DEV && isDesktopRuntime()}
      />
      <CreateWorkspaceModal
        open={state.modalOpen}
        onClose={() => dispatch({ type: "close" })}
        onConfirm={handleCreateWorkspace}
        onPickFolder={() =>
          pickDirectory({ title: t("onboarding.authorize_folder") }) as Promise<
            string | null
          >
        }
        submitting={state.createBusy}
        localError={state.createError}
        localDisabled={!isDesktopRuntime()}
        localDisabledReason={
          isDesktopRuntime()
            ? undefined
            : t("app.local_disabled_reason")
        }
      />
      {state.redrobKeyStep ? (
        <RedrobKeyStep
          busy={state.redrobKeyBusy}
          error={state.redrobKeyError}
          onSubmitKey={handleSubmitRedrobKey}
          onOpenConsole={handleOpenRedrobConsole}
          onSkip={handleLookAround}
          skipLabel={t("onboarding.look_around_cta")}
          skipDescription={t("onboarding.look_around_description")}
        />
      ) : null}
      {state.attributionStep ? (
        <AttributionStep
          onSubmit={handleAttributionSubmit}
          onSkip={handleAttributionSkip}
        />
      ) : null}
    </>
  );
}
