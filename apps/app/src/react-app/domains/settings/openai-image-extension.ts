/**
 * Config shapes and helpers for the local-provider (Ollama) and OpenAI image-generation
 * extensions: building the SDK provider/model config from the install form, and probing an
 * Ollama model for vision support. Pure data helpers plus one network probe — no React.
 */
import type { ProviderConfig } from "@redrob-labs/sdk/v2/client";
import { t } from "../../../i18n";

/** The install-form values for adding an OpenAI-compatible local provider (e.g. Ollama). */
export type LocalProviderInstallInput = {
  providerId: string;
  name: string;
  baseURL: string;
  modelId: string;
  modelName: string;
  setDefault: boolean;
  supportsVision: boolean;
};

type ProviderModelConfig = NonNullable<ProviderConfig["models"]>[string];

export const OLLAMA_PROVIDER_CONFIG = {
  providerId: "ollama",
  get name() { return t("extensions.ollama_local_provider_name"); },
  baseURL: "http://localhost:11434/v1",
  defaultModelId: "qwen2.5-coder:7b",
};

export const OPENAI_IMAGE_EXTENSION_ID = "openai-image-generation";
export const OPENAI_IMAGE_MODEL = "gpt-image-2";

/** Local Ollama is on the same machine, so a slow probe means something is wrong, not far away. */
const OLLAMA_PROBE_TIMEOUT_MS = 3000;

function readProperty(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/** Whether an Ollama `/api/show` payload reports the "vision" capability. Shape-checked, not trusted. */
export function parseOllamaVisionCapability(payload: unknown) {
  const capabilities = readProperty(payload, "capabilities");
  if (!Array.isArray(capabilities)) return false;
  return capabilities.some((capability) => typeof capability === "string" && capability.toLowerCase() === "vision");
}

/** Asks a local Ollama server whether a model supports vision. False on any error or timeout. */
export async function fetchOllamaModelSupportsVision(modelId: string, baseURL: string) {
  try {
    const response = await fetch(`${baseURL.replace(/\/v1\/?$/, "")}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId }),
      signal: AbortSignal.timeout(OLLAMA_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    return parseOllamaVisionCapability(payload);
  } catch {
    return false;
  }
}

/** The SDK model-config entry for a local provider, enabling image input only when the model has vision. */
export function buildLocalProviderModelConfig(input: Pick<LocalProviderInstallInput, "modelId" | "modelName" | "supportsVision">): ProviderModelConfig {
  return {
    name: input.modelName.trim() || input.modelId,
    attachment: input.supportsVision,
    modalities: {
      input: input.supportsVision ? ["text", "image"] : ["text"],
      output: ["text"],
    },
  };
}

/** The full SDK provider config for an OpenAI-compatible local provider from the install form. */
export function buildLocalProviderConfig(input: LocalProviderInstallInput): ProviderConfig {
  const modelId = input.modelId.trim();
  return {
    npm: "@ai-sdk/openai-compatible",
    name: input.name,
    options: { baseURL: input.baseURL },
    models: { [modelId]: buildLocalProviderModelConfig({ ...input, modelId }) },
  };
}
