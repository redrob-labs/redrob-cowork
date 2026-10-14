/** @jsxImportSource react */
/**
 * Wires the settings route to the extension config registry: turns the route's loose bag of
 * clients and callbacks into the per-entry {@link ExtensionConfigContext} each extension's config
 * panel expects, and resolves which panel (if any) an inventory entry renders. Keeps that mapping
 * out of the view so the registry and the route stay decoupled.
 */
import { useCallback } from "react";

import type { McpDirectoryInfo } from "../../../app/constants";
import { evaluateEnablement, type EnablementContext } from "../../../app/enablement";
import type { RedrobServerClient } from "../../../app/lib/redrob-server";
import type { McpServerEntry } from "../../../app/types";
import { getExtensionConfigSlot, type ExtensionConfigContext } from "./extension-registry";
import type { LocalProviderInstallInput } from "./openai-image-extension";

type ProviderLike = {
  id: string;
  source?: string | null;
};

type SettingsExtensionControllerInput = {
  redrobServerClient: RedrobServerClient | null;
  hostRedrobServerClient: RedrobServerClient | null;
  enablementContext: EnablementContext;
  mcpServers: McpServerEntry[];
  mcpConnectingName: string | null;
  onComputerUsePermissionsChange: (permissions: { accessibility: boolean; screenRecording: boolean }) => void;
  restartLocalServer?: () => Promise<boolean>;
  connectMcp: (entry: McpDirectoryInfo) => void | Promise<void>;
  refreshMcpServers: () => void | Promise<void>;
  providers: ProviderLike[];
  providerConnectedIds: string[];
  userEnvKeys: string[];
  imageExtension: {
    busy: boolean;
    status: string | null;
    error: string | null;
    onInstall: (apiKey: string) => void | Promise<void>;
    onTestGenerate: (input: { apiKey: string; prompt: string }) => void | Promise<void>;
  };
  localProvider: {
    busy: boolean;
    status: string | null;
    error: string | null;
    onInstall: (input: LocalProviderInstallInput) => void | Promise<void>;
  };
};

function hasOpenAiEnv(input: Pick<SettingsExtensionControllerInput, "providers" | "providerConnectedIds" | "userEnvKeys">) {
  return input.userEnvKeys.includes("OPENAI_API_KEY") ||
    input.userEnvKeys.includes("REDROB_OPENAI_IMAGE_API_KEY") ||
    input.providers.some((provider) => provider.id === "openai" && provider.source === "env") ||
    input.providerConnectedIds.includes("openai");
}

/**
 * Builds the per-entry config context and the `configSlotForEntry` / `isConnected` helpers the
 * settings view calls. Memoized on the input so the view gets stable callbacks between renders.
 */
export function useSettingsExtensionController(input: SettingsExtensionControllerInput) {
  const configContextForEntry = useCallback((entry: McpDirectoryInfo): ExtensionConfigContext => ({
    redrobServerClient: input.redrobServerClient,
    hostRedrobServerClient: input.hostRedrobServerClient,
    restartLocalServer: input.restartLocalServer,
    computerUse: {
      connected: input.mcpServers.some((server) => server.name === "computer-use"),
      connecting: input.mcpConnectingName === entry.name,
      onConnect: () => input.connectMcp(entry),
      onRefresh: input.refreshMcpServers,
      onPermissionsChange: input.onComputerUsePermissionsChange,
    },
    imageExtension: {
      ...input.imageExtension,
      envKeyDetected: hasOpenAiEnv(input),
    },
    localProvider: input.localProvider,
  }), [input]);

  const configSlotForEntry = useCallback(
    (entry: McpDirectoryInfo) => getExtensionConfigSlot(entry, configContextForEntry(entry)),
    [configContextForEntry],
  );

  const isConnected = useCallback((entry: McpDirectoryInfo) => {
    const enablement = entry.extensionManifest?.enablement;
    return enablement ? evaluateEnablement(enablement, input.enablementContext).active : false;
  }, [input.enablementContext]);

  return {
    configContextForEntry,
    configSlotForEntry,
    isConnected,
  };
}
