import { describe, expect, test } from "bun:test";

import type { McpDirectoryInfo } from "../src/app/constants";
import type { McpServerEntry } from "../src/app/types";
import {
  buildExtensionItems,
  isRedrobProvidedSkill,
  resolveExtensionInventoryGroup,
  type ExtensionItem,
} from "../src/react-app/domains/settings/extension-items";

const connectedBuiltIn: McpDirectoryInfo = {
  id: "redrob-browser",
  name: "Redrob Cowork Browser",
  serverName: "redrob-browser",
  description: "Connected by default.",
  oauth: false,
  kind: "extension",
  extensionManifest: {
    schemaVersion: 1,
    id: "redrob-browser",
    name: "Redrob Cowork Browser",
    description: "Connected by default.",
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    resources: [],
  },
};

const availableBuiltIn: McpDirectoryInfo = {
  id: "computer-use",
  name: "Computer Use",
  serverName: "computer-use",
  description: "Marketplace-only until installed.",
  oauth: false,
  kind: "extension",
  extensionManifest: {
    schemaVersion: 1,
    id: "computer-use",
    name: "Computer Use",
    description: "Marketplace-only until installed.",
    source: { format: "redrob-builtin", origin: "builtin", trusted: true },
    resources: [],
  },
};

const notionQuickConnect: McpDirectoryInfo = {
  name: "Notion",
  serverName: "notion",
  description: "Pages and databases.",
  url: "https://mcp.notion.com/mcp",
  type: "remote",
  oauth: true,
  kind: "mcp",
};

const directNotionServer: McpServerEntry = {
  name: "notion",
  config: {
    type: "remote",
    url: "https://mcp.notion.com/mcp",
  },
};

describe("extension item projection", () => {
  test("attributes only current Redrob Cowork-provided local skills", () => {
    expect(isRedrobProvidedSkill({
      name: "skill-creator",
      path: "/workspace/.opencode/skills/skill-creator/SKILL.md",
    })).toBe(true);
    expect(isRedrobProvidedSkill({
      name: "workspace-guide",
      path: String.raw`C:\workspace\.opencode\skills\workspace-guide\SKILL.md`,
    })).toBe(true);

    for (const name of [
      "get-started",
      "command-creator",
      "agent-creator",
      "plugin-creator",
      "customer-creator",
    ]) {
      expect(isRedrobProvidedSkill({
        name,
        path: `/workspace/.opencode/skills/${name}/SKILL.md`,
      })).toBe(false);
    }
  });

  test("lists built-ins that are not set up yet, but never uninstalled directory entries", () => {
    const result = buildExtensionItems({
      quickConnect: [connectedBuiltIn, availableBuiltIn, notionQuickConnect],
      mcpServers: [],
      installedSkills: [],
      enablementContext: {},
      isBuiltInConnected: (entry) => entry.id === connectedBuiltIn.id,
    });

    expect(result.installedMcpEntries.map((entry) => entry.name)).toEqual(["Redrob Cowork Browser"]);
    expect(result.builtInItems.map((item) => item.name)).toEqual(["Redrob Cowork Browser", "Computer Use"]);
    expect(result.quickConnectEntries.map((entry) => entry.name)).toEqual(["Redrob Cowork Browser", "Computer Use"]);
  });

  test("keeps configured direct MCPs alongside their quick-connect entry", () => {
    const result = buildExtensionItems({
      quickConnect: [notionQuickConnect],
      mcpServers: [directNotionServer],
      installedSkills: [],
      enablementContext: {},
      isBuiltInConnected: () => false,
    });

    expect(result.quickConnectEntries.map((entry) => entry.name)).toEqual(["Notion"]);
    expect(result.installedMcpEntries.map((entry) => entry.name)).toEqual(["Notion"]);
  });

});

describe("resolveExtensionInventoryGroup", () => {
  const baseItem = (overrides: Partial<ExtensionItem> = {}): ExtensionItem => ({
    id: "builtin:redrob-browser",
    source: "builtin",
    name: "Redrob Cowork Browser",
    description: null,
    installState: "installed",
    setupState: "ready",
    active: true,
    enablement: null,
    resources: [],
    ...overrides,
  });

  test("marks disabled items first", () => {
    expect(resolveExtensionInventoryGroup(baseItem({ installState: "available" }), {
      disabledReason: "Disabled by organization",
    })).toBe("disabled");
  });

  test("maps available install state", () => {
    expect(resolveExtensionInventoryGroup(baseItem({ installState: "available" }))).toBe("available");
  });

  test("maps installed local items to ready", () => {
    expect(resolveExtensionInventoryGroup(baseItem())).toBe("ready");
  });

});
