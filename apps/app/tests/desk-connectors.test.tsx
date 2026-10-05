import { afterEach, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes } from "react-router";

import type { McpDirectoryInfo } from "../src/app/constants";
import type { RedrobManagedMcpConnection } from "../src/app/lib/redrob-server";
import { setLocale, type Language } from "../src/i18n";
import {
  CONNECTORS_QUERY_KEY,
  connectedCount,
  connectorFromMcp,
  connectorState,
  invalidateConnectors,
  isCustomMcp,
  prettifyServerName,
  setConnectorEnabled,
  signInConnector,
  visibleConnectors,
  type ConnectorActionDeps,
  type DeskMcpEntry,
} from "../src/react-app/desk/connectors/connectors";
import { ConnectorsView } from "../src/react-app/desk/connectors/desk-connectors";
import { CONNECTORS } from "../src/react-app/desk/services/fixtures/connectors";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import type { Connector } from "../src/react-app/desk/services/types";
import { deskRoutes } from "../src/react-app/desk/shell/desk-routes";

afterEach(() => setLocale("en"));

function render(node: ReactNode, path = "/connectors", client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Text between tags and the labels a screen reader says, without icon drawings. */
function readable(html: string): string {
  const markup = html.replace(/<svg[\s\S]*?<\/svg>/g, "");
  const labels = [...markup.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);
  return [markup.replace(/<[^>]*>/g, " "), ...labels].join(" ");
}

const notion: DeskMcpEntry = { name: "notion", config: { type: "remote", url: "https://mcp.notion.com/mcp" }, source: "config.project" };
const custom: DeskMcpEntry = { name: "acme-crm-mcp", config: { type: "local", command: ["node", "crm.js"] }, source: "config.project" };
const managedOAuth = (status: RedrobManagedMcpConnection["status"], enabled = true): RedrobManagedMcpConnection => ({
  name: "gmail",
  serverUrl: "https://mail.example.com/mcp",
  enabled,
  status,
  lastError: null,
  hasCredential: status === "connected",
  updatedAt: 1,
});
const managed = (status: RedrobManagedMcpConnection["status"], enabled = true): DeskMcpEntry => ({
  name: "gmail",
  config: { type: "remote", url: "https://mail.example.com/mcp" },
  source: "config.project",
  managedOAuth: managedOAuth(status, enabled),
});

describe("connectorFromMcp", () => {
  test("each engine status in plain words", () => {
    expect(connectorState(notion, { status: "connected" })).toBe("connected");
    expect(connectorState(notion, { status: "needs_auth" })).toBe("needs-sign-in");
    expect(connectorState(notion, { status: "needs_client_registration" })).toBe("needs-sign-in");
    expect(connectorState(notion, { status: "disabled" })).toBe("off");
    expect(connectorState(notion, { status: "failed" })).toBe("failed");
    expect(connectorState(notion, undefined)).toBe("failed");
    expect(connectorState({ ...notion, config: { ...notion.config, enabled: false } }, { status: "connected" })).toBe("off");
    expect(connectorState({ ...notion, disabledByTools: true }, undefined)).toBe("off");
  });

  test("a server Redrob signs in to reads its own sign-in state", () => {
    expect(connectorState(managed("connected"), undefined)).toBe("connected");
    expect(connectorState(managed("needs_auth"), undefined)).toBe("needs-sign-in");
    expect(connectorState(managed("reconnect_required"), undefined)).toBe("needs-sign-in");
    expect(connectorState(managed("connected", false), undefined)).toBe("off");
  });

  test("a catalog app keeps its name and description; anything else is a tool your team built", () => {
    const card = connectorFromMcp(notion, { status: "connected" });
    expect(card).toMatchObject({ id: "notion", name: "Notion", state: "connected", custom: false, icon: "note" });
    expect(card.does).toBe("Pages, databases, and project docs in sync.");
    expect(card.server).toEqual({ name: "notion", managed: false, type: "remote", url: "https://mcp.notion.com/mcp" });
    const built = connectorFromMcp(custom, { status: "connected" });
    expect(built).toMatchObject({ name: "Acme crm", custom: true, icon: "plug", server: { type: "local", managed: false } });
    expect(isCustomMcp(managed("connected"))).toBe(false);
    expect(isCustomMcp({ name: "redrob-ui" })).toBe(true);
    expect(prettifyServerName("my_server-mcp")).toBe("My");
    expect(prettifyServerName("mcp")).toBe("Mcp");
  });

  test("the tools your team built show only in Developer mode, and count only there", () => {
    const list = [connectorFromMcp(notion, { status: "connected" }), connectorFromMcp(custom, { status: "connected" })];
    expect(visibleConnectors(list, false).map((connector) => connector.id)).toEqual(["notion"]);
    expect(visibleConnectors(list, true).map((connector) => connector.id)).toEqual(["notion", "acme-crm-mcp"]);
    expect(connectedCount(list, false)).toBe(1);
    expect(connectedCount(list, true)).toBe(2);
  });
});

describe("real connectors.list", () => {
  test("maps every configured server with the engine status, connected first", async () => {
    const calls: string[] = [];
    const unused = async (): Promise<never> => {
      throw new Error("not used");
    };
    const client: DeskServerClient = {
      listWorkspaces: unused,
      listSessions: unused,
      getSession: unused,
      listMemories: unused,
      saveMemory: unused,
      updateMemory: unused,
      deleteMemory: unused,
      listArtifacts: unused,
      getConfig: unused,
      patchConfig: unused,
      listMcp: async (workspaceId) => {
        calls.push(workspaceId);
        return {
          items: [
            { ...notion, name: "linear", config: { type: "remote" } },
            notion,
            { name: "stripe", config: { type: "remote", enabled: false }, source: "config.project" },
            custom,
            { ...managed("needs_auth"), source: "config.project" },
          ],
        };
      },
    };
    const services = createRealDeskServices({
      client,
      workspaceId: "ws_1",
      mcpStatus: async () => ({ notion: { status: "connected" }, linear: { status: "failed" }, "acme-crm-mcp": { status: "connected" } }),
    });
    const result = await services.connectors.list();
    expect(result.preview).toBe(false);
    expect(calls).toEqual(["ws_1"]);
    expect(result.data.map((connector) => [connector.id, connector.state])).toEqual([
      ["acme-crm-mcp", "connected"],
      ["notion", "connected"],
      ["gmail", "needs-sign-in"],
      ["linear", "failed"],
      ["stripe", "off"],
    ]);
    expect(connectedCount(result.data, false)).toBe(1);

    const unreadable = createRealDeskServices({
      client,
      workspaceId: "ws_1",
      mcpStatus: async () => {
        throw new Error("engine down");
      },
    });
    expect((await unreadable.connectors.list()).data.find((connector) => connector.id === "notion")?.state).toBe("failed");
  });
});

function actionDeps(overrides: Partial<ConnectorActionDeps> = {}) {
  const calls: string[] = [];
  const opened: string[] = [];
  const dialogs: McpDirectoryInfo[] = [];
  const toasts: string[] = [];
  const deps: ConnectorActionDeps = {
    client: {
      connectManagedMcp: async (workspaceId, name) => {
        calls.push(`connect:${workspaceId}:${name}`);
        return { status: "needs_auth", authorizeUrl: "https://auth.example.com/start" };
      },
      setMcpEnabled: async (workspaceId, name, enabled) => {
        calls.push(`enabled:${workspaceId}:${name}:${String(enabled)}`);
        return { items: [] };
      },
    },
    workspaceId: "ws_1",
    openLink: (url) => opened.push(url),
    openSignIn: (entry) => dialogs.push(entry),
    refresh: () => {
      calls.push("refresh");
    },
    showToast: (title) => toasts.push(title),
    ...overrides,
  };
  return { deps, calls, opened, dialogs, toasts };
}

describe("connector actions", () => {
  test("Sign in opens the existing sign-in dialog for a server the engine signs in to", async () => {
    const { deps, calls, dialogs } = actionDeps();
    const card = connectorFromMcp(notion, { status: "needs_auth" });
    expect(await signInConnector(deps, card)).toBe("dialog");
    expect(dialogs).toEqual([
      { name: "notion", serverName: "notion", description: "", type: "remote", oauth: true, url: "https://mcp.notion.com/mcp" },
    ]);
    expect(calls).toEqual([]);
  });

  test("Sign in for a server Redrob signs in to calls its connect path and opens the page", async () => {
    const { deps, calls, opened } = actionDeps();
    expect(await signInConnector(deps, connectorFromMcp(managed("needs_auth"), undefined))).toBe("page");
    expect(calls).toEqual(["connect:ws_1:gmail"]);
    expect(opened).toEqual(["https://auth.example.com/start"]);
  });

  test("a sign-in that is already done refreshes and says so", async () => {
    const { deps, calls, toasts } = actionDeps();
    if (!deps.client) throw new Error("no client");
    deps.client = { ...deps.client, connectManagedMcp: async () => ({ status: "connected" }) };
    expect(await signInConnector(deps, connectorFromMcp(managed("needs_auth"), undefined))).toBe("connected");
    expect(calls).toEqual(["refresh"]);
    expect(toasts).toEqual(["Gmail is connected"]);
  });

  test("Turn on and off use the enable switch, then refresh the count", async () => {
    const { deps, calls, toasts } = actionDeps();
    const card = connectorFromMcp(notion, { status: "connected" });
    expect(await setConnectorEnabled(deps, card, false)).toBe(true);
    expect(await setConnectorEnabled(deps, card, true)).toBe(true);
    expect(calls).toEqual(["enabled:ws_1:notion:false", "refresh", "enabled:ws_1:notion:true", "refresh"]);
    expect(toasts).toEqual(["Notion is off", "Notion is on"]);
    expect(await setConnectorEnabled(actionDeps({ client: null }).deps, card, true)).toBe(false);
  });

  test("invalidateConnectors marks the list and every menu count stale", async () => {
    const client = new QueryClient();
    client.setQueryData([CONNECTORS_QUERY_KEY, "ws_1"], { data: [], preview: false });
    client.setQueryData(["desk-nav", "ws_1", "connected", false], 1);
    await invalidateConnectors(client, "ws_1");
    expect(client.getQueryState([CONNECTORS_QUERY_KEY, "ws_1"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["desk-nav", "ws_1", "connected", false])?.isInvalidated).toBe(true);
  });
});

describe("ConnectorsView", () => {
  const real: Connector[] = [
    connectorFromMcp(notion, { status: "connected" }),
    connectorFromMcp({ ...notion, name: "linear" }, { status: "needs_auth" }),
    connectorFromMcp({ name: "stripe", config: { enabled: false }, source: "config.project" }, undefined),
    connectorFromMcp({ name: "sentry", config: {}, source: "config.project" }, { status: "failed" }),
    connectorFromMcp(custom, { status: "connected" }),
  ];
  const view = (connectors: readonly Connector[], developerMode = false, preview = false) =>
    render(
      <ConnectorsView
        connectors={connectors}
        developerMode={developerMode}
        preview={preview}
        onSignIn={() => {}}
        onTurnOn={() => {}}
        onTurnOff={() => {}}
      />,
    );

  test("each state in words, with its action, and never the word MCP", () => {
    const locales: Language[] = ["en", "ko"];
    for (const locale of locales) {
      setLocale(locale);
      expect(readable(view(real))).not.toMatch(/mcp/i);
    }
    setLocale("en");
    const html = view(real);
    expect(html).toContain("Needs you to sign in");
    expect(html).toContain("Sign in");
    expect(html).toContain("Off");
    expect(html).toContain("Turn on");
    expect(html).toContain("Could not connect");
    expect(html).toContain("Turn off");
    expect(html).not.toContain("Acme crm");
    expect(html).not.toContain("Tools your team built");
    expect(readable(html)).not.toMatch(/https?:|integration/i);
  });

  test("Developer mode adds the tools your team built", () => {
    const html = view(real, true);
    expect(html).toContain("Tools your team built");
    expect(html).toContain("Acme crm");
  });

  test("empty says where connectors will appear", () => {
    const html = view([]);
    expect(html).toContain("No connectors yet");
    expect(html).toContain("Your connectors will appear here.");
    expect(view([connectorFromMcp(custom, undefined)])).toContain("No connectors yet");
  });

  test("sample data says so", () => {
    expect(view(CONNECTORS, false, true)).toContain("Sample connectors");
  });
});

describe("/connectors route", () => {
  test("renders inside the shell with Connectors current and the connected count", () => {
    const client = new QueryClient();
    client.setQueryData([CONNECTORS_QUERY_KEY, "preview"], { data: CONNECTORS, preview: true });
    const html = render(<Routes>{deskRoutes(<span>chat screen</span>)}</Routes>, "/connectors", client);
    expect(html).toContain('<h1 class="rr-shell__title">Connectors</h1>');
    expect(html).toContain("6 connected");
    expect(html).toContain('href="/connectors" aria-current="page"');
    expect(html).toContain("Gmail");
    expect(html).not.toContain("This part of Redrob Cowork is on its way.");
    expect(html).not.toContain("chat screen");
  });
});
