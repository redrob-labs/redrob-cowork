/** @jsxImportSource react */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { t } from "../../i18n";
import {
  getDesktopHomeDir,
  joinDesktopPath,
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
import { ConnectStep } from "../domains/onboarding/connect-step";
import {
  copyOnboardingCommand,
  fetchHarnessAvailability,
} from "../domains/onboarding/harness-availability-client";
import { AttributionStep, type AttributionSource } from "../domains/onboarding/attribution-step";
import { TutorialStep } from "../domains/onboarding/tutorial-step";
import { REDROB_CONSOLE_URL } from "../domains/settings/redrob-provider";
import { connectRedrobKey } from "../domains/onboarding/redrob-key-connect";
import {
  runRedrobDeviceConnect,
  type RedrobDeviceConnectPrompt,
} from "../domains/onboarding/redrob-device-connect";
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
type WelcomeStage = "language" | "engine" | "connect" | "main";

/**
 * Folder created under the user's home directory when they press "Get started"
 * without choosing a location. Deliberately a plain, recognisable name: the
 * tutorial step tells the user where it is and Settings can add more folders.
 */
const DEFAULT_WORKSPACE_FOLDER_NAME = "Redrob Cowork";

type WelcomeState = {
  stage: WelcomeStage;
  /**
   * True when the current stage was reached by pressing Back.
   *
   * A stage with nothing left to do should not be shown, and the engine stage skips itself when the
   * engine is already installed. But that skip must not fight the Back button: without this flag,
   * pressing Back from the engine stage onto language and then Continue would land on engine, be
   * skipped forward again, and the user could never reach the language stage at all.
   */
  stageFromBack: boolean;
  modalOpen: boolean;
  createBusy: boolean;
  createError: string | null;
  redrobKeyStep: boolean;
  redrobKeyBusy: boolean;
  redrobKeyError: string | null;
  /** True from the moment "Redrob로 연결" is pressed until the attempt settles. */
  redrobConnectBusy: boolean;
  /** The code the console gave us, once there is one to show. */
  redrobConnectPrompt: RedrobDeviceConnectPrompt | null;
  attributionStep: boolean;
  /** Last step: explains the workspace folder the app just created. */
  tutorialStep: boolean;
  pendingRoute: string | null;
  pendingWorkspaceId: string | null;
  pendingSessionId: string | null;
};

type WelcomeAction =
  | { type: "stage"; stage: WelcomeStage; fromBack?: boolean }
  | { type: "open" }
  | { type: "close" }
  | { type: "create:start" }
  | { type: "create:error"; error: string }
  | { type: "create:finish" }
  | { type: "redrob-key-step"; workspaceId: string; sessionId: string | null }
  | { type: "redrob-key:start" }
  | { type: "redrob-key:error"; error: string }
  | { type: "redrob-key:finish" }
  | { type: "redrob-connect:start" }
  | { type: "redrob-connect:prompt"; prompt: RedrobDeviceConnectPrompt }
  | { type: "redrob-connect:error"; error: string | null }
  | { type: "attribution-step"; route: string }
  | { type: "tutorial-step" };

const initialWelcomeState: WelcomeState = {
  stage: "language",
  stageFromBack: false,
  modalOpen: false,
  createBusy: false,
  createError: null,
  redrobKeyStep: false,
  redrobKeyBusy: false,
  redrobKeyError: null,
  redrobConnectBusy: false,
  redrobConnectPrompt: null,
  attributionStep: false,
  tutorialStep: false,
  pendingRoute: null,
  pendingWorkspaceId: null,
  pendingSessionId: null,
};

function welcomeReducer(state: WelcomeState, action: WelcomeAction): WelcomeState {
  switch (action.type) {
    case "stage":
      return { ...state, stage: action.stage, stageFromBack: action.fromBack === true };
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
        redrobConnectBusy: false,
        redrobConnectPrompt: null,
        pendingWorkspaceId: action.workspaceId,
        pendingSessionId: action.sessionId,
      };
    case "redrob-key:start":
      return { ...state, redrobKeyBusy: true, redrobKeyError: null };
    case "redrob-key:error":
      return { ...state, redrobKeyBusy: false, redrobKeyError: action.error };
    case "redrob-key:finish":
      return { ...state, redrobKeyBusy: false };
    case "redrob-connect:start":
      return { ...state, redrobConnectBusy: true, redrobConnectPrompt: null, redrobKeyError: null };
    case "redrob-connect:prompt":
      return { ...state, redrobConnectPrompt: action.prompt };
    /**
     * Clears the code as well as setting the message. A code left on screen after the attempt ended
     * is a code someone will keep waiting on.
     */
    case "redrob-connect:error":
      return {
        ...state,
        redrobConnectBusy: false,
        redrobConnectPrompt: null,
        redrobKeyError: action.error,
      };
    case "attribution-step":
      return {
        ...state,
        redrobKeyStep: false,
        redrobConnectBusy: false,
        redrobConnectPrompt: null,
        attributionStep: true,
        pendingRoute: action.route,
      };
    case "tutorial-step":
      return { ...state, attributionStep: false, tutorialStep: true };
  }
}

export function WelcomeRoute() {
  const navigate = useNavigate();
  const local = useLocal();
  const platform = usePlatform();
  const [state, dispatch] = useReducer(welcomeReducer, initialWelcomeState);
  const [manualFolder, setManualFolder] = useState("");
  /** Folder of the workspace just created, shown on the tutorial step. */
  const [createdFolder, setCreatedFolder] = useState<string | null>(null);
  // Whether onboarding was ALREADY complete when this route mounted.
  //
  // Read once, deliberately. This guard exists to bounce a RETURNING user who lands on /welcome, and
  // it must not react to the flag being set during the flow that is running right now -- doing so
  // unmounts the wizard mid-flow and throws away the step it was showing.
  const wasCompleteOnMount = useRef(local.prefs.hasCompletedOnboarding);

  // If the user already completed onboarding before arriving, redirect away immediately.
  useEffect(() => {
    if (wasCompleteOnMount.current) {
      navigate("/session", { replace: true });
    }
  }, [navigate]);

  const markOnboardingComplete = useCallback(() => {
    local.setPrefs((prev) => ({ ...prev, hasCompletedOnboarding: true }));
  }, [local]);

  // Record completion as soon as the user reaches the attribution step, NOT at the tutorial's Start
  // button.
  //
  // Reported from Windows 11: choosing any of "Just look around", "Connect Redrob" or the API-key path
  // put the user back on Get Started. All three converge on `attribution-step` and none of them creates
  // a workspace, while completion was written only in finishOnboarding, reachable only from
  // TutorialStep's Start button. That left a window in the state use-workspace-route-state.ts guards
  // against -- no workspaces AND onboarding not complete -- whose effect runs
  // navigate("/welcome", { replace: true }), remounting this route and discarding the reducer state.
  //
  // This pairs with the ref above and only works alongside it: an earlier attempt wrote completion here
  // while the redirect still watched the live flag, which fixed the bounce and then skipped the tutorial
  // instead, because setting the flag tripped the redirect the moment the attribution step appeared.
  useEffect(() => {
    if (!state.attributionStep) return;
    markOnboardingComplete();
  }, [markOnboardingComplete, state.attributionStep]);

  const handleCreateWorkspace = useCallback(
    async (_preset: string, folder: string | null, options?: CreateWorkspaceOptions) => {
      if (!folder) return;
      const projectLabel = options?.projectLabel?.trim() ?? "";
      setCreatedFolder(folder);
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
          throw new Error(t("workspace.server_unavailable_create"));
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
          error: error instanceof Error ? error.message : t("workspace.create_failed"),
        });
      } finally {
        dispatch({ type: "create:finish" });
      }
    },
    [],
  );

  const handleChooseFolder = useCallback(async () => {
    if (!isDesktopRuntime()) {
      dispatch({ type: "open" });
      return;
    }
    const picked = await pickDirectory({ title: t("onboarding.authorize_folder") });
    const folder = typeof picked === "string" ? picked : null;
    if (!folder) return;
    await handleCreateWorkspace("starter", folder);
  }, [handleCreateWorkspace]);

  /**
   * "Get started" must not open a native folder dialog as its first act: a
   * first-run user has been told nothing about workspaces yet and cannot know
   * what folder is being asked for, so the dialog reads as a dead end. Create a
   * default workspace under the home folder -- the same thing chat-first
   * creation already does -- and let the user move or add folders afterwards.
   * Choosing a folder explicitly stays available via `handleChooseFolder`.
   */
  const handleGetStarted = useCallback(async () => {
    if (!isDesktopRuntime()) {
      // Non-desktop: fall back to the modal for remote workspace creation.
      dispatch({ type: "open" });
      return;
    }
    const home = await getDesktopHomeDir().catch(() => "");
    const folder = home
      ? await joinDesktopPath(home, DEFAULT_WORKSPACE_FOLDER_NAME).catch(() => "")
      : "";
    if (!folder) {
      // No usable home directory: ask rather than fail silently.
      await handleChooseFolder();
      return;
    }
    await handleCreateWorkspace("starter", folder);
  }, [handleChooseFolder, handleCreateWorkspace]);

  const handleUseManualFolder = useCallback(async () => {
    const folder = manualFolder.trim();
    if (!folder) return;
    await handleCreateWorkspace("starter", folder);
  }, [handleCreateWorkspace, manualFolder]);

  /**
   * Opens the console. While a device connection is waiting this opens the page with the code already
   * in it, so "open again" lands on the confirm screen rather than on the dashboard.
   */
  const handleOpenRedrobConsole = useCallback(() => {
    platform.openLink(state.redrobConnectPrompt?.verificationUriComplete ?? REDROB_CONSOLE_URL);
  }, [platform, state.redrobConnectPrompt]);

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

  /**
   * Set while a device connection is waiting, and cleared to stop the loop. A ref rather than state
   * because the loop reads it between polls and must see the current value, not the one captured
   * when the attempt started.
   */
  const redrobConnectCancelled = useRef(false);

  const handleCancelRedrobConnect = useCallback(() => {
    redrobConnectCancelled.current = true;
    dispatch({ type: "redrob-connect:error", error: null });
  }, []);

  /**
   * "Redrob로 연결": the primary path. The console issues a short code, the browser opens on the
   * confirm screen, and the key arrives here on its own and goes to Redrob Code's auth store, which
   * is exactly where the pasted one goes. Nobody sees the key.
   *
   * Every ending is reported. A denial, an expiry, or a console that could not finish leaves the step
   * saying what happened, with the paste field still there for a machine that cannot open a browser.
   */
  const handleConnectRedrob = useCallback(async () => {
    redrobConnectCancelled.current = false;
    dispatch({ type: "redrob-connect:start" });
    try {
      const { normalizedBaseUrl, resolvedToken, resolvedHostToken } = await resolveRedrobConnection();
      if (!normalizedBaseUrl || !(resolvedToken || resolvedHostToken)) {
        throw new Error(t("welcome.redrob_key_error_server"));
      }
      const outcome = await runRedrobDeviceConnect({
        client: createRedrobServerClient({
          baseUrl: normalizedBaseUrl,
          token: resolvedToken || undefined,
          hostToken: resolvedHostToken || undefined,
        }),
        onPrompt: (prompt) => dispatch({ type: "redrob-connect:prompt", prompt }),
        openLink: (url) => platform.openLink(url),
        isCancelled: () => redrobConnectCancelled.current,
      });

      if (outcome.status === "connected") {
        captureAnalyticsEvent("redrob_connected", { method: "device_code" });
        dispatch({ type: "redrob-key:finish" });
        dispatch({
          type: "attribution-step",
          route: state.pendingWorkspaceId
            ? `${workspaceSessionRoute(state.pendingWorkspaceId, state.pendingSessionId)}?onboarding=1`
            : "/session?onboarding=1",
        });
        return;
      }

      if (outcome.status === "cancelled") {
        dispatch({ type: "redrob-connect:error", error: null });
        return;
      }

      dispatch({
        type: "redrob-connect:error",
        error:
          outcome.status === "denied"
            ? t("welcome.redrob_connect_error_denied")
            : outcome.status === "expired"
              ? t("welcome.redrob_connect_error_expired")
              : t("welcome.redrob_connect_error_failed"),
      });
    } catch (error) {
      dispatch({
        type: "redrob-connect:error",
        error: error instanceof Error ? error.message : t("welcome.redrob_connect_error_failed"),
      });
    }
  }, [platform, state.pendingSessionId, state.pendingWorkspaceId]);

  // Persist completion as soon as the user reaches the attribution step, NOT at the tutorial's Start
  // button.
  //
  // Reported from Windows 11: after the engine step, choosing any of "Just look around", "Connect
  // Redrob" or the API-key path put the user back on Get Started. All three converge on
  // `attribution-step` and NONE of them creates a workspace, while completion was written in exactly
  // one place -- finishOnboarding, reachable only from TutorialStep's Start button.
  //
  // That left a window in the precise state use-workspace-route-state.ts guards against: no
  // workspaces AND onboarding not complete. Its effect runs navigate("/welcome", { replace: true }),
  // which remounts this route and discards the reducer state that was showing the attribution step --
  // so the user lands back on the first screen with their choice thrown away.
  //
  // Reaching this step means the user made a terminal onboarding choice, so recording it here removes
  // the bounce condition rather than racing it. One effect covers all three paths; marking inside each
  // handler would leave the next path added to this flow with the same bug. It also survives a reload
  // or a crash before the tutorial.
  useEffect(() => {
    if (!state.attributionStep) return;
    markOnboardingComplete();
  }, [markOnboardingComplete, state.attributionStep]);

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
      dispatch({ type: "tutorial-step" });
    },
    [],
  );

  const handleAttributionSkip = useCallback(() => {
    captureAnalyticsEvent("attribution_survey_skipped");
    dispatch({ type: "tutorial-step" });
  }, []);

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
        // Nothing to do here when the engine is already installed, so the step does not ask for a
        // click to confirm that. It still SHOWS on a Back press, or the language stage would be
        // unreachable.
        autoContinueWhenPresent={!state.stageFromBack}
        onBack={() => dispatch({ type: "stage", stage: "language", fromBack: true })}
        onContinue={() => dispatch({ type: "stage", stage: "connect" })}
      />
    );
  }
  if (state.stage === "connect") {
    // After the engine, not before: the engine download is what makes the Redrob choice
    // usable, so offering the three options first would let a user pick Redrob and then
    // wait, which reads as the choice having failed.
    return (
      <ConnectStep
        fetchAvailability={fetchHarnessAvailability}
        copyCommand={copyOnboardingCommand}
        onConnectRedrob={() => dispatch({ type: "stage", stage: "main" })}
        onDone={() => dispatch({ type: "stage", stage: "main" })}
        onBack={() => dispatch({ type: "stage", stage: "engine", fromBack: true })}
        redrobConnected={false}
      />
    );
  }

  return (
    <>
      <WelcomePage
        onGetStarted={handleGetStarted}
        onChooseFolder={isDesktopRuntime() ? handleChooseFolder : undefined}
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
          onConnect={handleConnectRedrob}
          onCancelConnect={handleCancelRedrobConnect}
          connectBusy={state.redrobConnectBusy}
          connectPrompt={state.redrobConnectPrompt}
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
      {state.tutorialStep ? (
        <TutorialStep workspacePath={createdFolder} onStart={finishOnboarding} />
      ) : null}
    </>
  );
}
