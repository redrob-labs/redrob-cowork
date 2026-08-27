import { afterEach, describe, expect, test } from "bun:test";

import type { McpDirectoryInfo } from "../src/app/constants";
import { submitMcpEntry } from "../src/react-app/domains/connections/modals/add-mcp-submission";
import type { RedrobServerStore } from "../src/react-app/domains/connections/redrob-server-store";
import { createConnectionsStore } from "../src/react-app/domains/connections/store";

const originalWindow = globalThis.window;

function installDesktopWindow() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { __REDROB_ELECTRON__: {} },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("local MCP server recovery", () => {
  test("returns submission feedback when local server recovery never settles", async () => {
    installDesktopWindow();
    let recoveryAttempts = 0;
    const stalledRecovery = new Promise<never>(() => undefined);
    const redrobServer = {
      getSnapshot: () => ({
        redrobServerStatus: "disconnected",
        redrobServerClient: null,
        redrobServerCapabilities: null,
      }),
      ensureLocalRedrobServerClient: () => {
        recoveryAttempts += 1;
        return stalledRecovery;
      },
    } as unknown as RedrobServerStore;
    const store = createConnectionsStore({
      client: () => null,
      setClient: () => undefined,
      projectDir: () => "/tmp/redrob-mcp-recovery",
      selectedWorkspaceId: () => "workspace_local",
      selectedWorkspaceRoot: () => "/tmp/redrob-mcp-recovery",
      workspaceType: () => "local",
      redrobServer,
      runtimeWorkspaceId: () => null,
      ensureRuntimeWorkspaceId: async () => "workspace_local",
      localRedrobServerRecoveryTimeoutMs: 10,
      developerMode: () => false,
    });
    const entry: McpDirectoryInfo = {
      name: "Stalled recovery",
      description: "",
      type: "remote",
      url: "https://example.com/mcp",
      oauth: true,
      managedOAuth: true,
    };

    const result = await Promise.race([
      submitMcpEntry(store.connectMcp, entry, "Fallback error"),
      new Promise<"still pending">((resolve) => setTimeout(() => resolve("still pending"), 250)),
    ]);

    expect(recoveryAttempts).toBe(1);
    expect(result).not.toBe("still pending");
    expect(result).not.toBeNull();
    expect(store.getSnapshot().mcpConnectingName).toBeNull();
  });
});
