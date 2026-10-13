import { describe, expect, test } from "bun:test";

import { shouldDeferInPlaceEngineReload } from "./engine-reload-defer.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";

const first: WorkspaceInfo = {
  id: "ws_first",
  name: "First",
  path: "/tmp/first",
  preset: "starter",
  workspaceType: "local",
  baseUrl: "http://127.0.0.1:4096",
};
const second: WorkspaceInfo = {
  ...first,
  id: "ws_second",
  name: "Second",
  path: "/tmp/second",
  baseUrl: "http://127.0.0.1:4096/",
};
function fixtureConfig(): ServerConfig {
  return {
    workspaces: [first, second],
  } as ServerConfig;
}

describe("shouldDeferInPlaceEngineReload", () => {
  test("defers when the target directory has a live session", async () => {
    const config = fixtureConfig();
    const probed: string[] = [];
    const hasActiveSessions = async (_config: ServerConfig, workspace: WorkspaceInfo) => {
      probed.push(workspace.id);
      return workspace.id === second.id;
    };

    expect(await shouldDeferInPlaceEngineReload(config, second, hasActiveSessions)).toBe(true);
    expect(probed).toEqual([second.id]);
  });

  test("does not let another directory block an idle target reload", async () => {
    const config = fixtureConfig();
    const probed: string[] = [];
    const hasActiveSessions = async (_config: ServerConfig, workspace: WorkspaceInfo) => {
      probed.push(workspace.id);
      return workspace.id === first.id;
    };

    expect(await shouldDeferInPlaceEngineReload(config, second, hasActiveSessions)).toBe(false);
    expect(probed).toEqual([second.id]);
  });
});
