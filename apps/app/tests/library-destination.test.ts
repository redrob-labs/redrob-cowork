import { describe, expect, test } from "bun:test";

import {
  COMPOSER_CONFIGURE_SECTION,
  LIBRARY_ROUTE_PATH,
  composerConfigureDestination,
  composerConfigureSectionForMenu,
  isLibraryAgent,
  isLibraryCommand,
  libraryAgentDetailId,
  libraryAgentsFromOpencode,
  libraryCommandDetailId,
  libraryCommandTriggers,
  libraryCommandsFromSlashOptions,
  libraryPathForSection,
  libraryAddKindsForFilter,
  libraryPluginFileDisplayName,
  libraryPluginFileFallbackDetailId,
  libraryPluginFilePreferredDetailId,
  parseLibraryPluginFileDetailId,
  slugifyLibraryItemName,
} from "../src/react-app/domains/settings/library";

describe("library destination", () => {
  test("composer Configure opens the matching Library filter except for providers", () => {
    expect(composerConfigureDestination("agents")).toEqual({ kind: "library", path: "agents" });
    expect(composerConfigureDestination("commands")).toEqual({ kind: "library", path: "commands" });
    expect(composerConfigureDestination("skills")).toEqual({ kind: "library", path: "skills" });
    expect(composerConfigureDestination("mcps")).toEqual({ kind: "library", path: "mcps" });
    expect(composerConfigureDestination("plugins")).toEqual({ kind: "library", path: "plugins" });
    expect(composerConfigureDestination("connections")).toEqual({ kind: "library", path: "connections" });
    expect(composerConfigureDestination("extensions")).toEqual({
      kind: "library",
      path: LIBRARY_ROUTE_PATH,
    });
    expect(composerConfigureDestination("providers")).toEqual({
      kind: "settings",
      route: "/settings/ai",
    });
    expect(composerConfigureDestination(COMPOSER_CONFIGURE_SECTION)).toEqual({
      kind: "library",
      path: LIBRARY_ROUTE_PATH,
    });
  });

  test("composer + menu panes map onto Library section URLs", () => {
    expect(composerConfigureSectionForMenu("skills")).toBe("skills");
    expect(composerConfigureSectionForMenu("commands")).toBe("commands");
    expect(composerConfigureSectionForMenu("agents")).toBe("agents");
    expect(composerConfigureSectionForMenu("plugin:recruiting")).toBe("plugins");
    expect(composerConfigureSectionForMenu("mcps")).toBe("connections");
    expect(composerConfigureSectionForMenu("plugins")).toBe("plugins");
    expect(composerConfigureSectionForMenu("connections")).toBe("connections");
    expect(libraryPathForSection(composerConfigureSectionForMenu("skills"))).toBe("skills");
    expect(libraryPathForSection(composerConfigureSectionForMenu("connections"))).toBe("connections");
    expect(libraryPathForSection(composerConfigureSectionForMenu("mcps"))).toBe("connections");
  });

  test("Library commands exclude skill and MCP slash aliases", () => {
    expect(isLibraryCommand({ source: "command" })).toBe(true);
    expect(isLibraryCommand({})).toBe(true);
    expect(isLibraryCommand({ source: "skill" })).toBe(false);
    expect(isLibraryCommand({ source: "mcp" })).toBe(false);
    expect(
      libraryCommandsFromSlashOptions([
        { id: "cmd:release", name: "release", source: "command" },
        { id: "skill:brief", name: "brief", source: "skill" },
      ]).map((command) => command.name),
    ).toEqual(["release"]);
  });

  test("Library agents exclude hidden and subagent entries", () => {
    expect(isLibraryAgent({ name: "redrob" })).toBe(true);
    expect(isLibraryAgent({ name: "reviewer", hidden: true })).toBe(false);
    expect(isLibraryAgent({ name: "explore", mode: "subagent" })).toBe(false);
    expect(
      libraryAgentsFromOpencode([
        { name: "redrob" },
        { name: "hidden", hidden: true },
        { name: "explore", mode: "subagent" },
        { name: "writer", description: "Drafts" },
      ]).map((agent) => agent.name),
    ).toEqual(["redrob", "writer"]);
  });

  test("Library commands keep templates and slash triggers for detail", () => {
    const commands = libraryCommandsFromSlashOptions([
      {
        id: "cmd:release",
        name: "release",
        source: "command",
        template: "Ship the build",
        hints: ["ship it"],
        agent: "redrob",
      },
    ]);
    expect(commands[0]?.template).toBe("Ship the build");
    expect(libraryCommandTriggers(commands[0]!)).toEqual(["/release", "ship it"]);
    expect(libraryCommandDetailId(commands[0]!)).toBe("command:cmd:release");
  });

  test("Library agents keep prompt and mode for detail", () => {
    const agents = libraryAgentsFromOpencode([
      { name: "writer", description: "Drafts", prompt: "Write clearly.", mode: "primary", native: true },
    ]);
    expect(agents[0]?.prompt).toBe("Write clearly.");
    expect(libraryAgentDetailId(agents[0]!)).toBe("agent:writer");
  });

  test("Library Add matches the active filter", () => {
    expect(libraryAddKindsForFilter("skill")).toEqual(["skill"]);
    expect(libraryAddKindsForFilter("command")).toEqual(["command"]);
    expect(libraryAddKindsForFilter("agent")).toEqual(["agent"]);
    expect(libraryAddKindsForFilter("mcp")).toEqual(["mcp"]);
    expect(libraryAddKindsForFilter("plugin")).toEqual(["plugin"]);
    expect(libraryAddKindsForFilter("connection")).toEqual(["connection"]);
    expect(libraryAddKindsForFilter("app")).toEqual([]);
    expect(libraryAddKindsForFilter("all")).toEqual([
      "skill",
      "command",
      "agent",
      "mcp",
      "plugin",
      "connection",
    ]);
  });

  test("Library Add slugs names to kebab-case", () => {
    expect(slugifyLibraryItemName("Briefing Notes", "skill")).toBe("briefing-notes");
    expect(slugifyLibraryItemName("/Release", "command")).toBe("release");
    expect(slugifyLibraryItemName("  ", "agent")).toBe("agent");
  });

  test("plugin files map onto Library detail ids", () => {
    const skill = {
      configObjectId: "cfg_skill",
      objectType: "skill",
      title: "Customer research",
      skillName: "customer-research",
    };
    const command = {
      configObjectId: "cfg_cmd",
      objectType: "command",
      title: "brief",
    };
    const mcp = {
      configObjectId: "cfg_mcp",
      objectType: "mcp",
      title: "Linear",
    };
    expect(libraryPluginFileDisplayName(skill)).toBe("customer-research");
    expect(libraryPluginFilePreferredDetailId(skill)).toBe("skill:customer-research");
    expect(libraryPluginFilePreferredDetailId(command)).toBe("command:cmd:brief");
    expect(libraryPluginFilePreferredDetailId(mcp)).toBe("connect-mcp:Linear");
    expect(libraryPluginFileFallbackDetailId("plug_1", skill)).toBe("plugin:plug_1/file/cfg_skill");
    expect(parseLibraryPluginFileDetailId("plugin:plug_1/file/cfg_skill")).toEqual({
      pluginId: "plug_1",
      fileId: "cfg_skill",
    });
    expect(parseLibraryPluginFileDetailId("plugin:plug_1")).toBeNull();
  });
});
