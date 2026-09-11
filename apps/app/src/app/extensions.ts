import { t } from "../i18n";

// Owned here: reload vocabulary is part of the extension manifest contract.
// types.ts re-exports it for the rest of the app.
export type ReloadReason = "plugins" | "skills" | "mcp" | "config" | "agents" | "commands";

export type RedrobWorkExtensionSourceFormat =
  | "redrob-builtin"
  | "redrob-extension-manifest"
  | "claude-plugin"
  | "opencode-plugin"
  | "mcp-directory"
  | "manual";

export type RedrobWorkExtensionSource = {
  format: RedrobWorkExtensionSourceFormat;
  trusted: boolean;
  origin?: "builtin" | "den" | "workspace" | "local";
  reference?: string;
};

export type RedrobWorkExtensionResourceType =
  | "skill"
  | "agent"
  | "command"
  | "tool"
  | "mcp"
  | "opencode-plugin"
  | "provider"
  | "hook"
  | "context"
  | "secret"
  | "file"
  | "local-service"
  | "native-binary";

export type RedrobWorkExtensionResource = {
  type: RedrobWorkExtensionResourceType;
  id: string;
  label?: string;
  description?: string;
  path?: string;
  command?: string[];
  envKey?: string;
  packageName?: string;
  providerId?: string;
  mcpServerName?: string;
  localCommandRef?: "redrob.computerUseMcp" | "redrob.uiMcp";
  required?: boolean;
};

export type RedrobWorkExtensionContributionType =
  | "settings-panel"
  | "setup-instructions"
  | "composer-prompt"
  | "session-side-panel"
  | "session-rail-item"
  | "control-actions"
  | "server-route"
  | "native-capability"
  | "test-action";

export type RedrobWorkExtensionContribution = {
  type: RedrobWorkExtensionContributionType;
  ref?: string;
  label?: string;
  description?: string;
  prompt?: string;
  location?: "settings-detail" | "composer" | "session-right-pane" | "session-rail" | "server" | "native";
};

export type RedrobWorkExtensionSetup = {
  instructions?: string;
  primaryCta?: string;
  secondaryCta?: string;
  requiredEnv?: string[];
  testActionRef?: string;
};

export type RedrobWorkExtensionLifecycle = {
  reload?: ReloadReason[];
  detection?: string[];
};

// ---------------------------------------------------------------------------
// Enablement — declarative conditions for extension "active" state
// ---------------------------------------------------------------------------

export type EnablementConditionType =
  | "mcp-connected"
  | "plugin-loaded"
  | "provider-connected"
  | "env-set"
  | "permission-granted"
  | "toggle-enabled";

export type EnablementCondition = {
  type: EnablementConditionType;
  /** What to check — MCP server name, plugin id, env key, etc. */
  ref: string;
  /** Human-readable label shown in the UI. */
  label: string;
};

/** Result of evaluating a single enablement condition at runtime. */
export type EnablementResult = {
  condition: EnablementCondition;
  met: boolean;
};

export type RedrobWorkExtensionManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  preview?: boolean;
  source: RedrobWorkExtensionSource;
  icon?: {
    src?: string;
    simpleIconSlug?: string;
  };
  composer?: {
    prompt: string;
  };
  setup?: RedrobWorkExtensionSetup;
  resources: RedrobWorkExtensionResource[];
  contributions?: RedrobWorkExtensionContribution[];
  lifecycle?: RedrobWorkExtensionLifecycle;
  /** Declarative conditions that must ALL be true for the extension to be "active". */
  enablement?: EnablementCondition[];
  defaultEnabled?: boolean;
  defaultHidden?: boolean;
  platform?: Array<"darwin" | "linux" | "windows" | "web">;
};

export type RedrobWorkExtensionPlatform = NonNullable<RedrobWorkExtensionManifest["platform"]>[number];

export function extensionContribution(
  manifest: RedrobWorkExtensionManifest | undefined,
  type: RedrobWorkExtensionContributionType,
): RedrobWorkExtensionContribution | undefined {
  return manifest?.contributions?.find((contribution) => contribution.type === type);
}

export function extensionResource(
  manifest: RedrobWorkExtensionManifest | undefined,
  type: RedrobWorkExtensionResourceType,
): RedrobWorkExtensionResource | undefined {
  return manifest?.resources.find((resource) => resource.type === type);
}

export function isTrustedBuiltInExtension(manifest: RedrobWorkExtensionManifest | undefined): boolean {
  return manifest?.source.origin === "builtin" && manifest.source.trusted;
}

export const BUILT_IN_REDROB_EXTENSION_MANIFESTS: RedrobWorkExtensionManifest[] = [
  {
    schemaVersion: 1,
    id: "redrob-browser",
    get name() { return t("extensions.builtin_browser_name"); },
    get description() { return t("extensions.builtin_browser_description"); },
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/redrob-mark.svg" },
    composer: { prompt: "Use the Redrob Work Browser extension to " },
    setup: {
      get instructions() { return t("extensions.builtin_browser_setup"); },
    },
    resources: [
      {
        type: "opencode-plugin",
        // `id` and `packageName` are the real npm plugin spec the engine installs
        // (apps/server/src/redrob-runtime-config.ts), so they stay verbatim.
        // `label` exists precisely so the user is not shown that identifier --
        // mcp-view.tsx falls back to `id` when it is absent.
        id: "opencode-chrome-devtools",
        get label() { return t("extensions.builtin_browser_resource_control"); },
        packageName: "opencode-chrome-devtools",
        required: true,
      },
    ],
    contributions: [
      { type: "settings-panel", ref: "redrob.browser.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "redrob.browser.panel", location: "session-right-pane" },
      { type: "composer-prompt", prompt: "Use the Redrob Work Browser extension to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "redrob-browser", get label() { return t("extensions.enablement_enabled"); } },
    ],
    lifecycle: { reload: ["plugins", "agents"], detection: ["plugin:opencode-chrome-devtools"] },
    defaultEnabled: true,
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "computer-use",
    get name() { return t("extensions.builtin_computer_use_name"); },
    get description() { return t("extensions.builtin_computer_use_description"); },
    preview: true,
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/redrob-mark.svg" },
    composer: { prompt: "Use Computer Use to " },
    setup: {
      get instructions() { return t("extensions.builtin_computer_use_setup"); },
      primaryCta: "Connect Computer Use MCP",
      secondaryCta: "Check macOS permissions",
      testActionRef: "redrob.computerUse.healthCheck",
    },
    resources: [
      {
        type: "mcp",
        id: "computer-use-mcp",
        get label() { return t("extensions.builtin_computer_use_resource_mcp"); },
        mcpServerName: "computer-use",
        command: ["npx", "-y", "@redrob/handsfree", "mcp"],
        localCommandRef: "redrob.computerUseMcp",
        required: true,
      },
      {
        type: "native-binary",
        id: "computer-use-native",
        get label() { return t("extensions.builtin_computer_use_resource_runtime"); },
        packageName: "@redrob/handsfree",
        required: true,
      },
    ],
    contributions: [
      { type: "setup-instructions", ref: "redrob.computerUse.setup", location: "settings-detail" },
      { type: "native-capability", ref: "redrob.computerUse.axPermissions", get label() { return t("extensions.builtin_computer_use_contribution_permissions"); } },
      { type: "test-action", ref: "redrob.computerUse.healthCheck", get label() { return t("extensions.builtin_computer_use_contribution_verify"); } },
      { type: "composer-prompt", prompt: "Use Computer Use to ", location: "composer" },
    ],
    enablement: [
      { type: "mcp-connected", ref: "computer-use", get label() { return t("extensions.enablement_mcp_server_connected"); } },
      { type: "permission-granted", ref: "accessibility", get label() { return t("extensions.enablement_accessibility_permission"); } },
      { type: "permission-granted", ref: "screenRecording", get label() { return t("extensions.enablement_screen_recording_permission"); } },
    ],
    lifecycle: { reload: ["mcp"], detection: ["mcp:computer-use"] },
    platform: ["darwin"],
  },
  {
    schemaVersion: 1,
    id: "redrob-voice",
    get name() { return t("extensions.builtin_voice_mode_name"); },
    get description() { return t("extensions.builtin_voice_mode_description"); },
    preview: true,
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/redrob-mark.svg" },
    composer: { prompt: "Use Voice Mode to " },
    setup: {
      get instructions() { return t("extensions.builtin_voice_mode_setup"); },
      primaryCta: "Save OpenAI key",
      secondaryCta: "Test Realtime",
      requiredEnv: ["OPENAI_REALTIME_API_KEY", "OPENAI_API_KEY"],
      testActionRef: "redrob.voice.testRealtime",
    },
    resources: [
      { type: "secret", id: "openai-realtime-api-key", envKey: "OPENAI_REALTIME_API_KEY", required: false },
      { type: "secret", id: "openai-api-key", envKey: "OPENAI_API_KEY", required: true },
      { type: "local-service", id: "redrob-voice-realtime-session", get label() { return t("extensions.builtin_voice_mode_resource_realtime_secret"); }, required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "redrob.voice.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "redrob.voice.panel", location: "session-right-pane" },
      { type: "session-rail-item", ref: "redrob.voice.rail", get label() { return t("extensions.builtin_voice_mode_contribution_label"); }, location: "session-rail" },
      { type: "server-route", ref: "POST /voice/realtime/session", location: "server" },
      { type: "control-actions", ref: "redrob.voice.controlActions" },
      { type: "test-action", ref: "redrob.voice.testRealtime", get label() { return t("extensions.builtin_voice_mode_contribution_test"); } },
      { type: "composer-prompt", prompt: "Use Voice Mode to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "redrob-voice", get label() { return t("extensions.enablement_enabled"); } },
      { type: "env-set", ref: "OPENAI_API_KEY", get label() { return t("extensions.enablement_openai_api_key"); } },
    ],
    lifecycle: { reload: ["config"], detection: ["env:OPENAI_REALTIME_API_KEY", "env:OPENAI_API_KEY"] },
  },
  {
    schemaVersion: 1,
    id: "ollama",
    name: "Ollama",
    get description() { return t("extensions.builtin_ollama_description"); },
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-ollama.svg" },
    composer: { prompt: "Use the Ollama extension to " },
    setup: {
      get instructions() { return t("extensions.builtin_ollama_setup"); },
      primaryCta: "Add Ollama model",
      secondaryCta: "Pull model",
    },
    resources: [
      { type: "local-service", id: "ollama-api", get label() { return t("extensions.builtin_ollama_resource_api"); }, description: "http://localhost:11434", required: true },
      { type: "provider", id: "ollama", providerId: "ollama", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "redrob.ollama.settings", location: "settings-detail" },
      { type: "test-action", ref: "redrob.ollama.listModels", get label() { return t("extensions.builtin_ollama_contribution_check_models"); } },
      { type: "composer-prompt", prompt: "Use the Ollama extension to ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "ollama", get label() { return t("extensions.enablement_ollama_provider"); } },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:ollama"] },
  },
  {
    schemaVersion: 1,
    id: "redrob",
    name: "Redrob",
    get description() { return t("extensions.builtin_redrob_description"); },
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-redrob.svg" },
    composer: { prompt: "Use the Redrob provider to " },
    setup: {
      get instructions() { return t("extensions.builtin_redrob_setup"); },
      primaryCta: "Connect Redrob",
    },
    resources: [
      { type: "provider", id: "redrob", providerId: "redrob", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "Use the Redrob provider to ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "redrob", get label() { return t("extensions.enablement_redrob_provider"); } },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:redrob"] },
  },
];
