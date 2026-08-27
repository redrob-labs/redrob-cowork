/** @jsxImportSource react */
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import { isWebDeployment } from "@/app/lib/redrob-deployment";
import { hydrateRedrobServerSettingsFromEnv } from "@/app/lib/redrob-server";
import { isDesktopRuntime } from "@/app/utils";
import { LocalProvider } from "@/react-app/kernel/local-provider";
import { ServerProvider } from "@/react-app/kernel/server-provider";
import { ArchitectureMismatchGate } from "./architecture-mismatch-gate";
import { BootStateProvider } from "./boot-state";
import { DesktopRuntimeBoot } from "./desktop-runtime-boot";
import { startDebugLogger, stopDebugLogger } from "./debug-logger";
import { resolveRedrobConnection } from "./redrob-connection";
import { ReloadCoordinatorProvider } from "./reload-coordinator";

function resolveDefaultServerUrl(): string {
  if (isDesktopRuntime()) return "http://127.0.0.1:4096";

  const redrobUrl =
    typeof import.meta.env?.VITE_REDROB_URL === "string"
      ? import.meta.env.VITE_REDROB_URL.trim()
      : "";
  if (redrobUrl) {
    return `${redrobUrl.replace(/\/+$/, "")}/opencode`;
  }

  if (isWebDeployment() && import.meta.env.PROD && typeof window !== "undefined") {
    return `${window.location.origin}/opencode`;
  }

  const envUrl =
    typeof import.meta.env?.VITE_OPENCODE_URL === "string"
      ? import.meta.env.VITE_OPENCODE_URL.trim()
      : "";
  return envUrl || "http://127.0.0.1:4096";
}

type AppProvidersProps = {
  children: ReactNode;
};

function LocalAppProviders({ children }: AppProvidersProps) {
  return (
    <>
      <DesktopRuntimeBoot />
      <LocalProvider>
        <ReloadCoordinatorProvider>{children}</ReloadCoordinatorProvider>
        <Toaster />
      </LocalProvider>
    </>
  );
}

export function AppProviders({ children }: AppProvidersProps) {
  hydrateRedrobServerSettingsFromEnv();

  useEffect(() => {
    // Start the dev observability forwarder. Reads the current redrob-server
    // URL on every flush so reconnects after port changes still work. In prod
    // builds `startDebugLogger` is a no-op.
    startDebugLogger({
      serverUrl: async () => (await resolveRedrobConnection()).normalizedBaseUrl,
    });
    return () => {
      stopDebugLogger();
    };
  }, []);

  const defaultUrl = resolveDefaultServerUrl();
  return (
    <BootStateProvider>
      <ServerProvider defaultUrl={defaultUrl}>
        <ArchitectureMismatchGate>
          <LocalAppProviders>{children}</LocalAppProviders>
        </ArchitectureMismatchGate>
      </ServerProvider>
    </BootStateProvider>
  );
}
