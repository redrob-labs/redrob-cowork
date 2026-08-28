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
    name: "Redrob Work Browser",
    description: "Automate the built-in browser panel that stays visible inside Redrob Work.",
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/redrob-mark.svg" },
    composer: { prompt: "Use the Redrob Work Browser extension to " },
    setup: {
      instructions: "Redrob Work Browser is ready by default in desktop workspaces.",
    },
    resources: [
      {
        type: "opencode-plugin",
        id: "opencode-chrome-devtools",
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
      { type: "toggle-enabled", ref: "redrob-browser", label: "Enabled" },
    ],
    lifecycle: { reload: ["plugins", "agents"], detection: ["plugin:opencode-chrome-devtools"] },
    defaultEnabled: true,
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "computer-use",
    name: "Computer Use",
    description: "Mac only: control Mac apps through semantic accessibility refs, screenshots, background-safe clicks, keyboard input, and strict mode.",
    preview: true,
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/redrob-mark.svg" },
    composer: { prompt: "Use Computer Use to " },
    setup: {
      instructions: "Computer Use is Mac only. It runs as a local MCP server backed by the macOS accessibility runtime. Grant Accessibility and Screen Recording permissions when macOS asks, then connect the MCP server in this workspace.",
      primaryCta: "Connect Computer Use MCP",
      secondaryCta: "Check macOS permissions",
      testActionRef: "redrob.computerUse.healthCheck",
    },
    resources: [
      {
        type: "mcp",
        id: "computer-use-mcp",
        label: "Computer Use MCP",
        mcpServerName: "computer-use",
        command: ["npx", "-y", "@redrob/handsfree", "mcp"],
        localCommandRef: "redrob.computerUseMcp",
        required: true,
      },
      {
        type: "native-binary",
        id: "computer-use-native",
        label: "macOS accessibility runtime",
        packageName: "@redrob/handsfree",
        required: true,
      },
    ],
    contributions: [
      { type: "setup-instructions", ref: "redrob.computerUse.setup", location: "settings-detail" },
      { type: "native-capability", ref: "redrob.computerUse.axPermissions", label: "Accessibility and Screen Recording" },
      { type: "test-action", ref: "redrob.computerUse.healthCheck", label: "Verify Computer Use MCP" },
      { type: "composer-prompt", prompt: "Use Computer Use to ", location: "composer" },
    ],
    enablement: [
      { type: "mcp-connected", ref: "computer-use", label: "MCP server connected" },
      { type: "permission-granted", ref: "accessibility", label: "Accessibility permission" },
      { type: "permission-granted", ref: "screenRecording", label: "Screen Recording permission" },
    ],
    lifecycle: { reload: ["mcp"], detection: ["mcp:computer-use"] },
    platform: ["darwin"],
  },
  {
    schemaVersion: 1,
    id: "redrob-voice",
    name: "Voice Mode",
    description: "Talk to Redrob Work through a Realtime voice panel that drives the same semantic UI controls as Redrob Work UI MCP.",
    preview: true,
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/redrob-mark.svg" },
    composer: { prompt: "Use Voice Mode to " },
    setup: {
      instructions: "Voice Mode uses OpenAI Realtime. Save an OpenAI API key in Redrob Work env vars, then open the session rail panel and speak or send a typed voice command.",
      primaryCta: "Save OpenAI key",
      secondaryCta: "Test Realtime",
      requiredEnv: ["OPENAI_REALTIME_API_KEY", "OPENAI_API_KEY"],
      testActionRef: "redrob.voice.testRealtime",
    },
    resources: [
      { type: "secret", id: "openai-realtime-api-key", envKey: "OPENAI_REALTIME_API_KEY", required: false },
      { type: "secret", id: "openai-api-key", envKey: "OPENAI_API_KEY", required: true },
      { type: "local-service", id: "redrob-voice-realtime-session", label: "Realtime client-secret minting", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "redrob.voice.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "redrob.voice.panel", location: "session-right-pane" },
      { type: "session-rail-item", ref: "redrob.voice.rail", label: "Voice Mode", location: "session-rail" },
      { type: "server-route", ref: "POST /voice/realtime/session", location: "server" },
      { type: "control-actions", ref: "redrob.voice.controlActions" },
      { type: "test-action", ref: "redrob.voice.testRealtime", label: "Test Realtime" },
      { type: "composer-prompt", prompt: "Use Voice Mode to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "redrob-voice", label: "Enabled" },
      { type: "env-set", ref: "OPENAI_API_KEY", label: "OpenAI API key" },
    ],
    lifecycle: { reload: ["config"], detection: ["env:OPENAI_REALTIME_API_KEY", "env:OPENAI_API_KEY"] },
  },
  {
    schemaVersion: 1,
    id: "ollama",
    name: "Ollama",
    description: "Local model provider at http://localhost:11434.",
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-ollama.svg" },
    composer: { prompt: "Use the Ollama extension to " },
    setup: {
      instructions: "Run Ollama locally, choose or pull a model, then add it as an OpenCode provider.",
      primaryCta: "Add Ollama model",
      secondaryCta: "Pull model",
    },
    resources: [
      { type: "local-service", id: "ollama-api", label: "Ollama API", description: "http://localhost:11434", required: true },
      { type: "provider", id: "ollama", providerId: "ollama", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "redrob.ollama.settings", location: "settings-detail" },
      { type: "test-action", ref: "redrob.ollama.listModels", label: "Check local models" },
      { type: "composer-prompt", prompt: "Use the Ollama extension to ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "ollama", label: "Ollama provider" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:ollama"] },
  },
  {
    schemaVersion: 1,
    id: "redrob",
    name: "Redrob",
    description: "Multilingual OpenAI-compatible inference at https://console.redrob.ai.",
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-redrob.svg" },
    composer: { prompt: "Use the Redrob provider to " },
    setup: {
      instructions: "Set REDROB_API_KEY, then connect the Redrob provider to use the auto model.",
      primaryCta: "Connect Redrob",
    },
    resources: [
      { type: "provider", id: "redrob", providerId: "redrob", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "Use the Redrob provider to ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "redrob", label: "Redrob provider" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:redrob"] },
  },
];
