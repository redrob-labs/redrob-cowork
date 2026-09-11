/** @jsxImportSource react */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Navigate, Route, Routes } from "react-router";



import { captureAnalyticsEvent, initAnalytics } from "../../app/lib/analytics";
import { evalRelaunchDesktopApp } from "../../app/lib/desktop";
import { currentLocale, subscribeToLocale } from "../../i18n";
import { NewProvidersListener } from "./new-providers-listener";
import { useDesktopFontZoomBehavior } from "./font-zoom";
import { LoadingOverlay } from "./loading-overlay";
import { useVisualViewportInset } from "../../hooks/use-visual-viewport-inset";
import { DevProfiler, DevProfilerOverlay } from "./dev-profiler";
import { ReactRenderWatchdogOverlay } from "./react-render-watchdog-overlay";
import { AppMenuProvider } from "./app-menu";
import {
  RedrobControlProvider,
  RedrobRouteControlActions,
  useControlAction,
  type RedrobControlAction,
} from "./control/control-provider";
import { RedrobContextPublisher } from "./redrob-context-publisher";
import { SessionRoute } from "./session-route";
import { SettingsRoute } from "./settings-route";
import { ShellConfigProvider } from "./shell-config";
import { WelcomeRoute } from "./welcome-route";

/**
 * Dev-only eval hook that relaunches the Electron app. Lives inside
 * RedrobControlProvider so it is registered on every route.
 */
function EvalRelaunchControlActions() {
  const relaunchAction = useMemo<RedrobControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;
    return {
      id: "eval.app.relaunch",
      label: "Relaunch app for eval",
      description: "Dev-only eval hook that relaunches the Electron app.",
      sideEffect: "mutation",
      execute: () => evalRelaunchDesktopApp(),
    };
  }, []);
  useControlAction(relaunchAction);

  return null;
}

let appOpenedCaptured = false;

export function AppRoot() {
  useDesktopFontZoomBehavior();
  useVisualViewportInset();

  // Re-render the whole shell when the active language changes so every
  // `t(...)` call across the tree picks up the new locale immediately (the
  // bottom-left language toggle flips this without a reload).
  useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);

  // Module-level dedupe keeps StrictMode double-mounts from double-counting.
  useEffect(() => {
    if (appOpenedCaptured) return;
    appOpenedCaptured = true;
    initAnalytics();
    captureAnalyticsEvent("app_opened", {});
  }, []);

  return (
    <>
      <DevProfiler id="AppRoot">
        <ShellConfigProvider>
        <AppMenuProvider>
        <RedrobControlProvider>
          <RedrobRouteControlActions />
          <RedrobContextPublisher />
          <EvalRelaunchControlActions />
            <Routes>
              <Route
                path="/welcome"
                element={
                  <DevProfiler id="WelcomeRoute">
                    <WelcomeRoute />
                  </DevProfiler>
                }
              />

              <Route
                path="/session"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/session/:sessionId"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/session"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/session/:sessionId"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/extensions/*"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/extensions/*"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/settings/*"
                element={
                  <DevProfiler id="SettingsRoute">
                    <SettingsRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/settings/*"
                element={
                  <DevProfiler id="SettingsRoute">
                    <SettingsRoute />
                  </DevProfiler>
                }
              />
              {/* Default + fallback: land on the session view. Users open
                  settings deliberately via the sidebar or command palette. */}
              <Route path="/" element={<Navigate to="/session" replace />} />
              <Route path="*" element={<Navigate to="/session" replace />} />
            </Routes>
          <LoadingOverlay />
        </RedrobControlProvider>
        </AppMenuProvider>
        </ShellConfigProvider>
      </DevProfiler>
      {/*
        DevProfilerOverlay sits OUTSIDE the AppRoot <Profiler> zone on
        purpose. The overlay re-renders on every emit() to refresh its
        table, and any commit inside a <Profiler> is recorded as a
        commit on that zone. Mounting the overlay inside AppRoot would
        inflate AppRoot's commit count by hundreds of overlay
        self-renders for every real user-visible commit, masking the
        true app-level signal.
      */}
      <NewProvidersListener />
      <DevProfilerOverlay />
      <ReactRenderWatchdogOverlay />
    </>
  );
}
