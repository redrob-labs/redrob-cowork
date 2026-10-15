import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { WorkspaceList } from "../src/app/lib/desktop";
import { createRedrobServerClient, type RedrobServerClient } from "../src/app/lib/redrob-server";
import { createWorkspaceServerClientResolver } from "../src/react-app/infra/workspace-server-client";
import { createDeskServices } from "../src/react-app/desk/services/real-services";
import {
  deriveDeskConnection,
  deskChatsVersion,
  publishDeskChatsRevision,
  publishDeskConnection,
  useDeskChatsRevision,
  useDeskConnection,
  type DeskChatsRevision,
} from "../src/react-app/desk/shell/desk-connection";
import type { RouteWorkspace } from "../src/react-app/shell/route-workspaces";
import { subscribeActiveWorkspaceId, writeActiveWorkspaceId } from "../src/react-app/shell/session-memory";
import {
  chooseDefaultWorkspaceId,
  runWorkspaceConnectionRefresh,
  selectActiveWorkspace,
  type WorkspaceConnectionRefreshInput,
  type WorkspaceConnectionRefreshOutcome,
} from "../src/react-app/shell/workspace-connection-refresh";

/**
 * The always-mounted workspace connection (WorkspaceConnectionProvider) and the
 * sole Desk connection writer (DeskConnectionPublisher). Before these, only the
 * chat route published the Desk connection, so a cold landing on /skills had no
 * connection and the Skills screen showed the sample fixtures.
 *
 * MAJOR tests carry the four behaviours the change exists for. AUXILIARY tests
 * pin the edges and the wiring and can be trimmed without losing that bar.
 */

const LOCAL_BASE = "http://127.0.0.1:4096";
const LOCAL_TOKEN = "local-token";
const REMOTE_BASE = "https://worker.example.test";
const REMOTE_TOKEN = "remote-token";

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.fetch = originalFetch;
  useDeskConnection.setState({ client: null, opencode: null, workspaceId: null, workspaceRoot: null, chatsVersion: "" });
  useDeskChatsRevision.setState({ workspaceRecordId: "", version: "", workspaceError: false });
});

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

/** A window with only what session-memory touches. */
function installWindow() {
  globalThis.window = { localStorage: memoryStorage() } as unknown as Window & typeof globalThis;
}

/** Refresh input with no network: fakes for bootstrap, connection and list. */
function refreshInput(overrides: Partial<WorkspaceConnectionRefreshInput> = {}): WorkspaceConnectionRefreshInput {
  return {
    desktopRuntime: false,
    bootstrapDesktop: async () => ({ workspaces: [] }) as unknown as WorkspaceList,
    resolveConnection: async () => ({
      normalizedBaseUrl: LOCAL_BASE,
      resolvedToken: LOCAL_TOKEN,
      resolvedHostToken: "",
      hostInfo: null,
    }),
    createServerClient: (input) => createRedrobServerClient(input),
    listWorkspaces: async () => ({ items: [] }),
    readPreviousWorkspaces: () => [],
    readOrderIds: () => [],
    isCurrent: () => true,
    wait: async () => undefined,
    ...overrides,
  };
}

function connected(outcome: WorkspaceConnectionRefreshOutcome) {
  if (outcome.kind !== "connected") throw new Error(`expected connected, got ${outcome.kind}`);
  return outcome;
}

/** The Desk connection a cold /skills landing publishes after one refresh with no chat route. */
function coldDeskConnection(outcome: ReturnType<typeof connected>, persistedActiveId: string | null) {
  const workspaces = outcome.listState.workspaces;
  const activeId = chooseDefaultWorkspaceId({
    workspaces,
    persistedActiveId,
    desktopSelectedId: "",
    serverActiveId: outcome.listState.activeId ?? "",
  });
  const workspace = selectActiveWorkspace(workspaces, activeId);
  const endpoint = createWorkspaceServerClientResolver({ baseUrl: outcome.baseUrl, token: outcome.token })(workspace);
  const revision: DeskChatsRevision = { workspaceRecordId: "", version: "", workspaceError: false };
  return { workspace, endpoint, desk: deriveDeskConnection({ workspace, endpoint, opencode: null, revision }) };
}

/** Records every fetch and answers each with an empty list. */
function recordFetches() {
  const calls: Array<{ url: string; authorization: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers ?? {});
    calls.push({ url, authorization: headers.get("Authorization") ?? "" });
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

describe("MAJOR: cold-direct /skills reads the live connection", () => {
  test("a local workspace resolves the local server, and Skills reads real data from it", async () => {
    const outcome = connected(
      await runWorkspaceConnectionRefresh(
        refreshInput({ listWorkspaces: async () => ({ items: [{ id: "ws_local", workspaceType: "local", path: "/work/a" }] }) }),
      ),
    );
    const { desk } = coldDeskConnection(outcome, "ws_local");

    expect(desk.client).not.toBeNull();
    expect(desk.workspaceId).toBe("ws_local");
    expect(desk.workspaceRoot).toBe("/work/a");

    const calls = recordFetches();
    const skills = await createDeskServices({ client: desk.client, workspaceId: desk.workspaceId }).skills.list();
    expect(skills.preview).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.startsWith(LOCAL_BASE)).toBe(true);
      expect(call.authorization).toContain(LOCAL_TOKEN);
    }
  });

  test("a rem_ workspace uses its own worker URL, token and server id, never the local handle", async () => {
    const remote = {
      id: "rem_team",
      workspaceType: "remote",
      baseUrl: REMOTE_BASE,
      redrobToken: REMOTE_TOKEN,
      redrobWorkspaceId: "server-team",
      displayName: "Team",
    };
    const outcome = connected(
      await runWorkspaceConnectionRefresh(
        refreshInput({
          desktopRuntime: true,
          bootstrapDesktop: async () => ({ workspaces: [remote] }) as unknown as WorkspaceList,
          // A stale local registration of the same id must not clobber the remote record.
          listWorkspaces: async () => ({ items: [{ id: "rem_team", workspaceType: "local", path: "/stale" }] }),
        }),
      ),
    );
    const { workspace, endpoint, desk } = coldDeskConnection(outcome, "rem_team");

    expect(workspace?.workspaceType).toBe("remote");
    expect(endpoint?.baseUrl).toBe(REMOTE_BASE);
    expect(endpoint?.token).toBe(REMOTE_TOKEN);
    expect(desk.workspaceId).toBe("server-team");
    expect(desk.workspaceRoot).toBeNull();

    const calls = recordFetches();
    const skills = await createDeskServices({ client: desk.client, workspaceId: desk.workspaceId }).skills.list();
    expect(skills.preview).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.startsWith(REMOTE_BASE)).toBe(true);
      expect(call.url).toContain("server-team");
      expect(call.authorization).toContain(REMOTE_TOKEN);
      expect(call.authorization).not.toContain(LOCAL_TOKEN);
    }
  });
});

describe("MAJOR: an active-workspace switch updates the published connection", () => {
  test("a settings or onboarding write reaches subscribers and re-points the Desk connection", () => {
    installWindow();
    const workspaces = [
      { id: "ws_a", workspaceType: "local", path: "/work/a", displayNameResolved: "A" },
      { id: "ws_b", workspaceType: "local", path: "/work/b", displayNameResolved: "B" },
    ] as RouteWorkspace[];
    const resolve = createWorkspaceServerClientResolver({ baseUrl: LOCAL_BASE, token: LOCAL_TOKEN });
    const seen: Array<string | null> = [];
    let activeId = "ws_a";
    const unsubscribe = subscribeActiveWorkspaceId((id) => {
      seen.push(id);
      activeId = id ?? "";
    });
    const publish = (revision: DeskChatsRevision) => {
      const workspace = selectActiveWorkspace(workspaces, activeId);
      publishDeskConnection(deriveDeskConnection({ workspace, endpoint: resolve(workspace), opencode: null, revision }));
    };
    const revisionA: DeskChatsRevision = { workspaceRecordId: "ws_a", version: "s1:One", workspaceError: false };

    publish(revisionA);
    expect(useDeskConnection.getState().workspaceId).toBe("ws_a");
    expect(useDeskConnection.getState().chatsVersion).toBe("s1:One");

    writeActiveWorkspaceId("ws_b");
    publish(revisionA);
    unsubscribe();

    expect(seen).toEqual(["ws_b"]);
    expect(useDeskConnection.getState().workspaceId).toBe("ws_b");
    expect(useDeskConnection.getState().workspaceRoot).toBe("/work/b");
    // Workspace A's chats are not carried over to B.
    expect(useDeskConnection.getState().chatsVersion).toBe("");
  });
});

describe("MAJOR: deleting the last workspace clears the Desk connection", () => {
  // Regression: a settings-side delete of the last workspace refreshes the provider
  // to an empty record list. selectActiveWorkspace must then return null (not fall
  // back to a stale first record), so a cold /skills publishes no client for the
  // deleted workspace and the Skills screen shows the real empty state.
  test("an empty record list yields a null Desk connection, never the deleted record", async () => {
    const emptyWorkspace = selectActiveWorkspace([], "");
    expect(emptyWorkspace).toBeNull();

    const desk = deriveDeskConnection({
      workspace: emptyWorkspace,
      endpoint: createWorkspaceServerClientResolver({ baseUrl: LOCAL_BASE, token: LOCAL_TOKEN })(emptyWorkspace),
      opencode: null,
      revision: { workspaceRecordId: "", version: "", workspaceError: false },
    });
    expect(desk.client).toBeNull();
    expect(desk.workspaceId).toBeNull();

    // With no client, the Desk services fall back to preview/fixtures, so the Skills
    // screen renders its real empty state instead of a client for the deleted workspace.
    const skills = await createDeskServices({ client: desk.client, workspaceId: desk.workspaceId }).skills.list();
    expect(skills.preview).toBe(true);
  });
});

describe("MAJOR: chat create and rename still invalidate recent chats", () => {
  test("the chat route's revision changes on create and rename and reaches the Desk connection", () => {
    const workspace = { id: "ws_a", workspaceType: "local", path: "/work/a" };
    const endpoint = createWorkspaceServerClientResolver({ baseUrl: LOCAL_BASE, token: LOCAL_TOKEN })(workspace);
    const versions: string[] = [];
    const step = (sessions: Array<{ id: string; title: string }>) => {
      // What SessionRoute does on each session-list change.
      publishDeskChatsRevision({ workspaceRecordId: "ws_a", version: deskChatsVersion(sessions), workspaceError: false });
      // What DeskConnectionPublisher does on each revision change.
      publishDeskConnection(
        deriveDeskConnection({ workspace, endpoint, opencode: null, revision: useDeskChatsRevision.getState() }),
      );
      versions.push(useDeskConnection.getState().chatsVersion);
    };

    step([{ id: "s1", title: "First" }]);
    step([{ id: "s2", title: "New chat" }, { id: "s1", title: "First" }]);
    step([{ id: "s2", title: "Renamed" }, { id: "s1", title: "First" }]);

    expect(versions).toEqual(["s1:First", "s2:New chat|s1:First", "s2:Renamed|s1:First"]);
    // Each is a distinct recent-chats query key (use-desk-nav-data keys on chatsVersion).
    expect(new Set(versions).size).toBe(3);
  });
});

describe("AUXILIARY: refresh edges", () => {
  test("a desktop connection gap retains state and never installs a stale handle", async () => {
    const resolved: unknown[] = [];
    let listed = 0;
    const outcome = await runWorkspaceConnectionRefresh(
      refreshInput({
        desktopRuntime: true,
        resolveConnection: async () => ({ normalizedBaseUrl: "", resolvedToken: "", resolvedHostToken: "", hostInfo: null }),
        onConnectionResolved: (connection) => void resolved.push(connection),
        listWorkspaces: async () => {
          listed += 1;
          return { items: [] };
        },
      }),
    );
    expect(outcome.kind).toBe("gap");
    expect(resolved).toEqual([]);
    expect(listed).toBe(0);
  });

  test("an empty resolution on web is a real disconnect", async () => {
    const outcome = await runWorkspaceConnectionRefresh(
      refreshInput({
        resolveConnection: async () => ({ normalizedBaseUrl: "", resolvedToken: "", resolvedHostToken: "", hostInfo: null }),
      }),
    );
    expect(outcome.kind).toBe("disconnected");
  });

  test("a superseded attempt writes nothing and stops before the list call", async () => {
    let listed = 0;
    const outcome = await runWorkspaceConnectionRefresh(
      refreshInput({
        isCurrent: () => false,
        listWorkspaces: async () => {
          listed += 1;
          return { items: [] };
        },
      }),
    );
    expect(outcome.kind).toBe("stale");
    expect(listed).toBe(0);
  });

  test("the handle is installed before the workspace list is requested", async () => {
    const order: string[] = [];
    await runWorkspaceConnectionRefresh(
      refreshInput({
        onConnectionResolved: () => void order.push("resolved"),
        listWorkspaces: async () => {
          order.push("listed");
          return { items: [] };
        },
      }),
    );
    expect(order).toEqual(["resolved", "listed"]);
  });

  test("without a chat route the choice is persisted, then desktop, then server, then first", () => {
    const workspaces = [{ id: "a" }, { id: "b" }, { id: "c" }] as RouteWorkspace[];
    const base = { workspaces, persistedActiveId: null, desktopSelectedId: "", serverActiveId: "" };
    expect(chooseDefaultWorkspaceId({ ...base, persistedActiveId: "c", desktopSelectedId: "b" })).toBe("c");
    expect(chooseDefaultWorkspaceId({ ...base, persistedActiveId: "gone", desktopSelectedId: "b" })).toBe("b");
    expect(chooseDefaultWorkspaceId({ ...base, serverActiveId: "c" })).toBe("c");
    expect(chooseDefaultWorkspaceId(base)).toBe("a");
  });

  test("a load error withholds the engine only for its own workspace's revision", () => {
    const workspace = { id: "ws_a", workspaceType: "local", path: "/work/a" };
    const endpoint = { client: {} as RedrobServerClient, workspaceId: "ws_a" };
    const other = deriveDeskConnection({
      workspace,
      endpoint,
      opencode: null,
      revision: { workspaceRecordId: "ws_b", version: "x:y", workspaceError: true },
    });
    expect(other.chatsVersion).toBe("");
    expect(other.client).toBe(endpoint.client);
  });
});

describe("AUXILIARY: wiring", () => {
  const SRC = join(import.meta.dir, "..", "src");
  const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  test("DeskConnectionPublisher is the only caller of publishDeskConnection", () => {
    const callers = files(SRC)
      .filter((path) => /publishDeskConnection\(/.test(readFileSync(path, "utf8").replace(/export function publishDeskConnection\(/, "")))
      .map((path) => path.replace(/\\/g, "/").split("/src/")[1]);
    expect(callers).toEqual(["react-app/shell/desk-connection-publisher.tsx"]);
  });

  test("the provider and publisher wrap <Routes> in AppRoot, so /skills is covered", () => {
    const appRoot = read("react-app", "shell", "app-root.tsx");
    const provider = appRoot.indexOf("<WorkspaceConnectionProvider>");
    const publisher = appRoot.indexOf("<DeskConnectionPublisher />");
    const routes = appRoot.indexOf("<Routes>");
    const routesEnd = appRoot.indexOf("</Routes>");
    const providerEnd = appRoot.indexOf("</WorkspaceConnectionProvider>");
    expect(provider).toBeGreaterThan(-1);
    expect(provider).toBeLessThan(publisher);
    expect(publisher).toBeLessThan(routes);
    expect(routesEnd).toBeLessThan(providerEnd);
  });

  test("the chat route contributes only the field-scoped chats revision", () => {
    const route = read("react-app", "shell", "session-route.tsx");
    expect(route).not.toContain("publishDeskConnection");
    expect(route).toContain("publishDeskChatsRevision(");
  });
});
