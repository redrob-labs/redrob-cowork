import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

declare global {
  namespace NodeJS {
    interface Process {
      resourcesPath?: string;
    }
  }
}

function resourcesPathFromAppAsarPath(path: string): string | null {
  const match = /[\\/]app\.asar(?:[\\/]|$)/.exec(path);
  return match ? path.slice(0, match.index) : null;
}

export function redrobPluginPath(name: string, here?: string): string {
  const pluginDir = process.env.REDROB_EXTENSIONS_PLUGIN_DIR;
  if (pluginDir) {
    return join(pluginDir, `${name}.js`);
  }

  here = here ?? dirname(fileURLToPath(import.meta.url));
  const resourcesPath = resourcesPathFromAppAsarPath(here);
  if (resourcesPath) {
    const electronResourcesPath = process.resourcesPath?.includes("app.asar") ? resourcesPath : process.resourcesPath?.trim();
    return join(electronResourcesPath || resourcesPath, "opencode-plugins", `${name}.js`);
  }

  const extension = basename(here) === "dist" ? "js" : "ts";
  return join(here, "opencode-plugins", `${name}.${extension}`);
}

export const redrobExtensionsPreviewPluginPath = () => redrobPluginPath("redrob-extensions-preview");
export const redrobCapabilitiesKnowledgePluginPath = () => redrobPluginPath("redrob-capabilities-knowledge");
export const redrobAnthropicAdaptiveThinkingPluginPath = () => redrobPluginPath("redrob-anthropic-adaptive-thinking");
export const redrobAnthropicToolSchemaPluginPath = () => redrobPluginPath("redrob-anthropic-tool-schema");
export const redrobOfficeAttachmentsPluginPath = () => redrobPluginPath("redrob-office-attachments");
