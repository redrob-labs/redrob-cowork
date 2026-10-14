/** @jsxImportSource react */
/**
 * A small registry mapping an extension id to the React node that renders its settings-panel
 * config. Extensions register their factory at module load; the settings route looks one up for
 * an inventory entry. Keeping it a registry (rather than a switch in the view) lets each extension
 * own its config UI without the view importing every one.
 */
import type { ReactNode } from "react";
import type { McpDirectoryInfo } from "../../../app/constants";
import { extensionContribution } from "../../../app/extensions";
import type { RedrobServerClient } from "../../../app/lib/redrob-server";
import type { LocalProviderInstallInput } from "./openai-image-extension";

/**
 * Context bag that the settings route passes to extension config factories.
 * Each extension picks what it needs; unused fields are ignored.
 */
export type ExtensionConfigContext = {
  redrobServerClient?: RedrobServerClient | null;
  hostRedrobServerClient?: RedrobServerClient | null;
  restartLocalServer?: () => Promise<boolean>;
  computerUse?: {
    connected: boolean;
    connecting: boolean;
    onConnect: () => void | Promise<void>;
    onRefresh: () => void | Promise<void>;
    onPermissionsChange?: (permissions: { accessibility: boolean; screenRecording: boolean }) => void;
  };
  imageExtension: {
    busy: boolean;
    status: string | null;
    error: string | null;
    envKeyDetected: boolean;
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

/** Builds an extension's config panel from the shared context. */
export type ExtensionConfigFactory = (ctx: ExtensionConfigContext) => ReactNode;

const registry = new Map<string, ExtensionConfigFactory>();

/** Registers the config factory for an extension id (last registration wins). */
export function registerExtensionConfig(id: string, factory: ExtensionConfigFactory) {
  registry.set(id, factory);
}

function configRegistryId(entry: McpDirectoryInfo) {
  return extensionContribution(entry.extensionManifest, "settings-panel")?.ref ?? entry.serverName ?? entry.name;
}

/** The registered config panel for an inventory entry, or null when the extension contributes none. */
export function getExtensionConfigSlot(
  entry: McpDirectoryInfo,
  ctx: ExtensionConfigContext,
): ReactNode | null {
  const id = configRegistryId(entry);
  const factory = registry.get(id);
  return factory ? factory(ctx) : null;
}
