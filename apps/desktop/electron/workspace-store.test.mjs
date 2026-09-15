import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createWorkspaceStore } from "./workspace-store.mjs";

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function writeBootstrapConfig(targetPath, config) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function withIsolatedBootstrapStore(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-bootstrap-store-"));
  const home = path.join(root, "home");
  const xdg = path.join(root, "xdg");
  const previousHome = process.env.HOME;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousOverride = process.env.REDROB_DESKTOP_BOOTSTRAP_PATH;
  const previousDevMode = process.env.REDROB_DEV_MODE;

  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = xdg;
  delete process.env.REDROB_DESKTOP_BOOTSTRAP_PATH;
  delete process.env.REDROB_DEV_MODE;

  try {
    const module = await import(`./workspace-store.mjs?bootstrap-test=${Date.now()}-${Math.random()}`);
    const createStore = (overrides = {}) => module.createWorkspaceStore({
      app: { getPath: (name) => name === "userData" ? path.join(root, "userData") : root },
      ...overrides,
    });
    const store = createStore();
    return await callback({
      store,
      createStore,
      canonicalPath: path.join(xdg, "redrob", "desktop-bootstrap.json"),
      legacyPath: path.join(home, ".config", "redrob", "desktop-bootstrap.json"),
      root,
      userDataPath: path.join(root, "userData"),
    });
  } finally {
    restoreEnv("HOME", previousHome);
    restoreEnv("XDG_CONFIG_HOME", previousXdg);
    restoreEnv("REDROB_DESKTOP_BOOTSTRAP_PATH", previousOverride);
    restoreEnv("REDROB_DEV_MODE", previousDevMode);
  }
}

test("recovers missing desktop workspace state from token store paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-workspace-store-"));
  const userData = path.join(root, "userData");
  const oldWorkspace = path.join(root, "old-workspace");
  await mkdir(oldWorkspace, { recursive: true });
  const oldWorkspaceReal = await realpath(oldWorkspace);
  await mkdir(userData, { recursive: true });

  await writeFile(
    path.join(userData, "redrob-server-tokens.json"),
    JSON.stringify({
      version: 1,
      workspaces: {
        "": { updatedAt: 3 },
        [oldWorkspace]: { updatedAt: 2 },
        [path.join(root, "missing")]: { updatedAt: 4 },
      },
    }),
    "utf8",
  );

  const previous = process.env.REDROB_SERVER_CONFIG;
  process.env.REDROB_SERVER_CONFIG = path.join(root, "missing-server.json");
  try {
    const store = createWorkspaceStore({
      app: { getPath: (name) => name === "userData" ? userData : root },
    });

    const state = await store.readWorkspaceState();
    assert.equal(state.workspaces.length, 1);
    assert.equal(state.workspaces[0].path, oldWorkspaceReal);
    assert.equal(state.selectedId, state.workspaces[0].id);
    assert.equal(state.watchedId, state.workspaces[0].id);

    const persisted = JSON.parse(await readFile(path.join(userData, "redrob-workspaces.json"), "utf8"));
    assert.equal(persisted.workspaces.length, 1);
    assert.equal(persisted.selectedWorkspaceId, state.workspaces[0].id);
  } finally {
    if (previous === undefined) delete process.env.REDROB_SERVER_CONFIG;
    else process.env.REDROB_SERVER_CONFIG = previous;
  }
});

test("keeps persisted empty desktop workspace state authoritative", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-workspace-store-"));
  const userData = path.join(root, "userData");
  const oldWorkspace = path.join(root, "old-workspace");
  await mkdir(oldWorkspace, { recursive: true });
  await mkdir(userData, { recursive: true });

  await writeFile(
    path.join(userData, "redrob-workspaces.json"),
    JSON.stringify({ selectedId: "", activeId: null, watchedId: null, workspaces: [] }),
    "utf8",
  );
  await writeFile(
    path.join(userData, "redrob-server-tokens.json"),
    JSON.stringify({ version: 1, workspaces: { [oldWorkspace]: { updatedAt: 2 } } }),
    "utf8",
  );

  const previous = process.env.REDROB_SERVER_CONFIG;
  process.env.REDROB_SERVER_CONFIG = path.join(root, "missing-server.json");
  try {
    const store = createWorkspaceStore({
      app: { getPath: (name) => name === "userData" ? userData : root },
    });

    const state = await store.readWorkspaceState();
    assert.deepEqual(state.workspaces, []);
    assert.equal(state.selectedId, "");
  } finally {
    restoreEnv("REDROB_SERVER_CONFIG", previous);
  }
});

test("prefers server config workspaces when desktop state is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-workspace-store-"));
  const userData = path.join(root, "userData");
  const oldWorkspace = path.join(root, "server-workspace");
  const serverConfig = path.join(root, "server.json");
  await mkdir(oldWorkspace, { recursive: true });
  await mkdir(userData, { recursive: true });
  const oldWorkspaceReal = await realpath(oldWorkspace);

  await writeFile(
    serverConfig,
    JSON.stringify({ workspaces: [{ path: oldWorkspace, name: "From Server" }] }),
    "utf8",
  );
  await writeFile(
    path.join(userData, "redrob-server-tokens.json"),
    JSON.stringify({ version: 1, workspaces: { [path.join(root, "other")]: { updatedAt: 9 } } }),
    "utf8",
  );

  const previous = process.env.REDROB_SERVER_CONFIG;
  process.env.REDROB_SERVER_CONFIG = serverConfig;
  try {
    const store = createWorkspaceStore({
      app: { getPath: (name) => name === "userData" ? userData : root },
    });

    const state = await store.readWorkspaceState();
    assert.equal(state.workspaces.length, 1);
    assert.equal(state.workspaces[0].path, oldWorkspaceReal);
    assert.equal(state.workspaces[0].name, "From Server");
  } finally {
    if (previous === undefined) delete process.env.REDROB_SERVER_CONFIG;
    else process.env.REDROB_SERVER_CONFIG = previous;
  }
});

test("does not create a default workspace when desktop state is absent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-workspace-store-"));
  const userData = path.join(root, "userData");
  const previousDevMode = process.env.REDROB_DEV_MODE;
  const previousServerConfig = process.env.REDROB_SERVER_CONFIG;
  process.env.REDROB_DEV_MODE = "1";
  process.env.REDROB_SERVER_CONFIG = path.join(root, "missing-server.json");
  try {
    const store = createWorkspaceStore({
      app: { getPath: (name) => name === "userData" ? userData : root },
    });

    const state = await store.readWorkspaceState();
    assert.equal(state.workspaces.length, 0);
    await assert.rejects(readFile(path.join(userData, "redrob-dev-data", "home", "Redrob Cowork", ".opencode", "redrob.json"), "utf8"));
  } finally {
    restoreEnv("REDROB_DEV_MODE", previousDevMode);
    restoreEnv("REDROB_SERVER_CONFIG", previousServerConfig);
  }
});

test("normalizes recovered remote Redrob Cowork entries before persisting", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-workspace-store-"));
  const userData = path.join(root, "userData");
  const serverConfig = path.join(root, "server.json");
  await mkdir(userData, { recursive: true });

  await writeFile(
    serverConfig,
    JSON.stringify({
      workspaces: [
        {
          id: "legacy_one",
          path: "/workspace",
          workspaceType: "remote",
          remoteType: "redrob",
          baseUrl: "https://worker.example.com/workspace/ws_remote",
        },
        {
          id: "legacy_two",
          path: "/workspace",
          workspaceType: "remote",
          remoteType: "redrob",
          baseUrl: "https://worker.example.com/w/ws_remote",
        },
      ],
    }),
    "utf8",
  );

  const previous = process.env.REDROB_SERVER_CONFIG;
  process.env.REDROB_SERVER_CONFIG = serverConfig;
  try {
    const store = createWorkspaceStore({
      app: { getPath: (name) => name === "userData" ? userData : root },
    });

    const state = await store.readWorkspaceState();
    assert.equal(state.workspaces.length, 1);
    assert.equal(state.workspaces[0].id, "rem_ws_remote");
    assert.equal(state.workspaces[0].baseUrl, "https://worker.example.com");
    assert.equal(state.workspaces[0].redrobWorkspaceId, "ws_remote");
    assert.equal(state.selectedId, "rem_ws_remote");
  } finally {
    if (previous === undefined) delete process.env.REDROB_SERVER_CONFIG;
    else process.env.REDROB_SERVER_CONFIG = previous;
  }
});

test("forgetting a local workspace removes its recovery token", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-workspace-store-"));
  const userData = path.join(root, "userData");
  const forgottenWorkspace = path.join(root, "forgotten-workspace");
  const retainedWorkspace = path.join(root, "retained-workspace");
  await mkdir(forgottenWorkspace, { recursive: true });
  await mkdir(retainedWorkspace, { recursive: true });
  await mkdir(userData, { recursive: true });

  await writeFile(
    path.join(userData, "redrob-workspaces.json"),
    JSON.stringify({
      selectedId: "ws_forgotten",
      activeId: "ws_forgotten",
      watchedId: "ws_forgotten",
      workspaces: [
        { id: "ws_forgotten", path: forgottenWorkspace, workspaceType: "local" },
        { id: "ws_retained", path: retainedWorkspace, workspaceType: "local" },
      ],
    }),
    "utf8",
  );
  await writeFile(
    path.join(userData, "redrob-server-tokens.json"),
    JSON.stringify({
      version: 1,
      workspaces: {
        [forgottenWorkspace]: { token: "forgotten", updatedAt: 2 },
        [retainedWorkspace]: { token: "retained", updatedAt: 1 },
      },
    }),
    "utf8",
  );

  const store = createWorkspaceStore({
    app: { getPath: (name) => name === "userData" ? userData : root },
  });

  const state = await store.forgetWorkspace("ws_forgotten");
  assert.deepEqual(state.workspaces.map((workspace) => workspace.id), ["ws_retained"]);
  assert.equal(state.selectedId, "");
  assert.equal(state.activeId, null);
  assert.equal(state.watchedId, null);

  const tokens = JSON.parse(await readFile(path.join(userData, "redrob-server-tokens.json"), "utf8"));
  assert.deepEqual(Object.keys(tokens.workspaces), [retainedWorkspace]);
  assert.equal(tokens.workspaces[retainedWorkspace].token, "retained");
});

test("desktop bootstrap prefers a newer canonical writtenAt over stale legacy", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath, legacyPath }) => {
    await writeBootstrapConfig(canonicalPath, {
      brandAppName: "https://canonical.example.com",
      writtenAt: "2026-01-02T00:00:00.000Z",
    });
    await writeBootstrapConfig(legacyPath, {
      brandAppName: "https://legacy.example.com",
      writtenAt: "2026-01-01T00:00:00.000Z",
    });

    const config = await store.getDesktopBootstrapConfig();
    assert.equal(config.brandAppName, "https://canonical.example.com");
    assert.equal(config.fromFile, true);

    const persisted = JSON.parse(await readFile(canonicalPath, "utf8"));
    assert.equal(persisted.brandAppName, "https://canonical.example.com");
  });
});

test("desktop bootstrap migrates a newer legacy writtenAt to canonical", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath, legacyPath }) => {
    await writeBootstrapConfig(canonicalPath, {
      brandAppName: "https://canonical.example.com",
      writtenAt: "2026-01-01T00:00:00.000Z",
    });
    await writeBootstrapConfig(legacyPath, {
      brandAppName: "https://legacy.example.com",
      writtenAt: "2026-01-02T00:00:00.000Z",
    });

    const config = await store.getDesktopBootstrapConfig();
    assert.equal(config.brandAppName, "https://legacy.example.com");
    assert.equal(config.fromFile, true);

    const migrated = JSON.parse(await readFile(canonicalPath, "utf8"));
    assert.equal(migrated.brandAppName, "https://legacy.example.com");
  });
});

test("explicit desktop bootstrap path never inherits legacy activation state", async () => {
  await withIsolatedBootstrapStore(async ({ store, legacyPath, root }) => {
    const explicitPath = path.join(root, "isolated", "desktop-bootstrap.json");
    process.env.REDROB_DESKTOP_BOOTSTRAP_PATH = explicitPath;
    await writeBootstrapConfig(legacyPath, {
      brandAppName: "https://app.redrob.io",
    });

    const config = await store.getDesktopBootstrapConfig();
    assert.equal(config.fromFile, false);
    await assert.rejects(readFile(explicitPath, "utf8"));
  });
});

test("explicit desktop bootstrap path still reads its configured bootstrap", async () => {
  await withIsolatedBootstrapStore(async ({ store, root }) => {
    const explicitPath = path.join(root, "isolated", "desktop-bootstrap.json");
    process.env.REDROB_DESKTOP_BOOTSTRAP_PATH = explicitPath;
    await writeBootstrapConfig(explicitPath, {
      brandAppName: "https://enterprise.example.com",
    });

    const config = await store.getDesktopBootstrapConfig();
    assert.equal(config.fromFile, true);
    assert.equal(config.brandAppName, "https://enterprise.example.com");
    assert.equal("requireActivation" in config, false);
  });
});

test("desktop bootstrap ignores a newer malformed canonical config when legacy is valid", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath, legacyPath }) => {
    await writeBootstrapConfig(legacyPath, {
      brandAppName: "https://legacy.organization.internal.example",
    });
    await mkdir(path.dirname(canonicalPath), { recursive: true });
    await writeFile(canonicalPath, "{ malformed", "utf8");
    const older = new Date("2026-07-09T12:00:00.000Z");
    const newer = new Date("2026-07-10T12:00:00.000Z");
    await utimes(legacyPath, older, older);
    await utimes(canonicalPath, newer, newer);

    const config = await store.getDesktopBootstrapConfig();
    assert.equal(config.brandAppName, "https://legacy.organization.internal.example");
    assert.equal(config.fromFile, true);
    const migrated = JSON.parse(await readFile(canonicalPath, "utf8"));
    assert.equal(migrated.brandAppName, "https://legacy.organization.internal.example");
  });
});

test("desktop bootstrap falls back to mtime when writtenAt is missing", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath, legacyPath }) => {
    await writeBootstrapConfig(canonicalPath, {
      brandAppName: "https://canonical.example.com",
    });
    await writeBootstrapConfig(legacyPath, {
      brandAppName: "https://legacy.example.com",
    });
    const older = new Date("2026-01-01T00:00:00.000Z");
    const newer = new Date("2026-01-02T00:00:00.000Z");
    await utimes(canonicalPath, older, older);
    await utimes(legacyPath, newer, newer);

    const config = await store.getDesktopBootstrapConfig();
    assert.equal(config.brandAppName, "https://legacy.example.com");
    assert.equal(config.fromFile, true);
  });
});

test("sync desktop bootstrap reader matches async reader for canonical, legacy, and missing configs", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath }) => {
    await writeBootstrapConfig(canonicalPath, {
      brandAppName: "https://canonical.example.com",
      writtenAt: "2026-01-02T00:00:00.000Z",
    });
    assert.deepEqual(store.readDesktopBootstrapConfigSync(), await store.getDesktopBootstrapConfig());
  });

  await withIsolatedBootstrapStore(async ({ store, legacyPath }) => {
    await writeBootstrapConfig(legacyPath, {
      brandAppName: "https://legacy.example.com",
      writtenAt: "2026-01-02T00:00:00.000Z",
    });
    const syncConfig = store.readDesktopBootstrapConfigSync();
    const asyncConfig = await store.getDesktopBootstrapConfig();
    assert.deepEqual(syncConfig, asyncConfig);
    assert.equal(syncConfig.fromFile, true);
  });

  await withIsolatedBootstrapStore(async ({ store }) => {
    const syncConfig = store.readDesktopBootstrapConfigSync();
    const asyncConfig = await store.getDesktopBootstrapConfig();
    assert.deepEqual(syncConfig, asyncConfig);
    assert.equal(syncConfig.fromFile, false);
  });
});

test("desktop bootstrap fallback marks fromFile false only when no parseable file is available", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath }) => {
    await mkdir(path.dirname(canonicalPath), { recursive: true });
    await writeFile(canonicalPath, "{ malformed", "utf8");

    const syncConfig = store.readDesktopBootstrapConfigSync();
    const asyncConfig = await store.getDesktopBootstrapConfig();
    assert.deepEqual(syncConfig, asyncConfig);
    assert.equal(syncConfig.fromFile, false);
  });
});

test("desktop bootstrap writes include a fresh writtenAt stamp", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath }) => {
    const config = await store.setDesktopBootstrapConfig({
      brandAppName: "https://canonical.example.com",
    });
    assert.equal(Number.isFinite(Date.parse(config.writtenAt)), true);

    const persisted = JSON.parse(await readFile(canonicalPath, "utf8"));
    assert.equal(persisted.brandAppName, "https://canonical.example.com");
    assert.equal(Number.isFinite(Date.parse(persisted.writtenAt)), true);
  });
});

test("an omitted requireActivation is never materialized into the shared bootstrap file", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath }) => {
    await store.setDesktopBootstrapConfig({
      brandAppName: "https://app.redrob.io",
    });

    const persisted = JSON.parse(await readFile(canonicalPath, "utf8"));
    assert.equal("requireActivation" in persisted, false);
    assert.equal("requireActivation" in await store.getDesktopBootstrapConfig(), false);
  });
});

test("clearDesktopBootstrapConfig removes bootstrap files without deleting workspace state", async () => {
  await withIsolatedBootstrapStore(async ({ store, canonicalPath, legacyPath, userDataPath }) => {
    const workspaceStatePath = path.join(userDataPath, "redrob-workspaces.json");
    await writeBootstrapConfig(canonicalPath, {
      brandAppName: "https://canonical.example.com",
      writtenAt: "2026-01-02T00:00:00.000Z",
    });
    await writeBootstrapConfig(legacyPath, {
      brandAppName: "https://legacy.example.com",
      writtenAt: "2026-01-01T00:00:00.000Z",
    });
    await mkdir(userDataPath, { recursive: true });
    await writeFile(workspaceStatePath, JSON.stringify({ selectedId: "ws_keep", workspaces: [] }), "utf8");

    await store.clearDesktopBootstrapConfig();

    await assert.rejects(readFile(canonicalPath, "utf8"));
    await assert.rejects(readFile(legacyPath, "utf8"));
    const workspaceState = JSON.parse(await readFile(workspaceStatePath, "utf8"));
    assert.equal(workspaceState.selectedId, "ws_keep");

    const config = await store.getDesktopBootstrapConfig();

    assert.equal(config.fromFile, false);
  });
});
