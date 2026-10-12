import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { upsertCommand } from "../commands.js";
import { startServer } from "../server.js";
import type { ReloadEvent, ServerConfig } from "../types.js";
import { createWorkspaceKvStore } from "../workspace-kv-store.js";
import { PRODUCTION_KEYS, readTeamPolicyState, TEST_KEYS, trustedKeys, verifyTeamPolicyJws } from "./index.js";
import { samplePolicy, signTestPolicy } from "./test-signer.js";
import vectorFile from "./vectors/vectors.json" with { type: "json" };

const dirs: string[] = [];
const savedEnv = {
  REDROB_RUNTIME_DB: process.env.REDROB_RUNTIME_DB,
  REDROB_DATA_DIR: process.env.REDROB_DATA_DIR,
  REDROB_DISABLE_SCHEDULER: process.env.REDROB_DISABLE_SCHEDULER,
  REDROB_TEAM_POLICY_TEST_KEYS: process.env.REDROB_TEAM_POLICY_TEST_KEYS,
};

afterEach(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

async function temp(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

describe("verifying a team policy", () => {
  for (const vector of vectorFile.vectors) {
    test(`contract vector: ${vector.name}`, async () => {
      const result = await verifyTeamPolicyJws(vector.jws, TEST_KEYS).then(
        (verified) => ({ ok: true as const, accountId: verified.policy.accountId, version: verified.policy.version }),
        (error: { code?: string }) => ({ ok: false as const, code: error.code }),
      );
      expect(result).toEqual(vector.expect as typeof result);
    });
  }

  test("a packaged build trusts no test key", () => {
    expect(trustedKeys({}).map((key) => key.kid)).toEqual(PRODUCTION_KEYS.map((key) => key.kid));
    expect(trustedKeys({}).some((key) => key.kid.startsWith("test-"))).toBe(false);
  });

  test("a dev build, or a test that opts in, trusts the test keys", () => {
    expect(trustedKeys({ REDROB_DEV_MODE: "1" }).map((key) => key.kid)).toContain("test-2026-10-active");
    expect(trustedKeys({ REDROB_TEAM_POLICY_TEST_KEYS: "1" }).map((key) => key.kid)).toContain("test-2026-10-standby");
  });

  test("a validly signed test policy is refused by a packaged build", async () => {
    const jws = await signTestPolicy(samplePolicy());
    await expect(verifyTeamPolicyJws(jws, trustedKeys({}))).rejects.toMatchObject({ code: "team_policy_unknown_key" });
  });
});

function serverConfig(workspace: string, dataDir: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: "test-token",
    hostToken: "host-token",
    configPath: join(dataDir, "config.json"),
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: [],
    workspaces: [{ id: "workspace", name: "workspace", path: workspace, preset: "default", workspaceType: "local" }],
    authorizedRoots: [workspace],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
}

async function startPolicyServer() {
  const workspace = await temp("redrob-team-policy-ws-");
  const dataDir = await temp("redrob-team-policy-data-");
  process.env.REDROB_DATA_DIR = dataDir;
  process.env.REDROB_RUNTIME_DB = join(dataDir, "runtime.sqlite");
  process.env.REDROB_DISABLE_SCHEDULER = "1";
  process.env.REDROB_TEAM_POLICY_TEST_KEYS = "1";
  const config = serverConfig(workspace, dataDir);
  const server = (await startServer(config)) as { port: number; stop: (force?: boolean) => void };
  const base = `http://127.0.0.1:${server.port}`;
  const issued = await fetch(`${base}/tokens`, {
    method: "POST",
    headers: { "X-Redrob-Host-Token": "host-token", "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "owner" }),
  });
  const ownerToken = ((await issued.json()) as { token: string }).token;
  const as = (token: string) => async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = (await response.json().catch(() => null)) as Record<string, any> | null;
    return { status: response.status, body: json ?? {} };
  };
  return { server, workspace, config, owner: as(ownerToken), collaborator: as("test-token") };
}

const apply = (call: Awaited<ReturnType<typeof startPolicyServer>>["owner"], jws: string, accountId?: string) =>
  call("POST", "/workspace/workspace/team-policy", { policy: jws, ...(accountId ? { accountId } : {}) });

const privacyOf = async (call: Awaited<ReturnType<typeof startPolicyServer>>["owner"]) =>
  (await call("GET", "/workspace/workspace/config")).body.redrob?.deskPrivacy;

const teamNotes = async (call: Awaited<ReturnType<typeof startPolicyServer>>["owner"]) =>
  ((await call("GET", "/memory")).body.memories as Array<{ id: string; content: string; tags: string[] }>).filter(
    (memory) => memory.tags?.includes("team-policy"),
  );

describe("applying a team policy in redrob-server", () => {
  test("applies privacy, notes and skills, and records it", async () => {
    const { server, workspace, owner } = await startPolicyServer();
    try {
      const applied = await apply(owner, await signTestPolicy(samplePolicy()), "acc_vectors");
      expect(applied.status).toBe(200);
      expect(applied.body).toMatchObject({ status: "applied", joined: true, version: 1, signedWithTestKey: true });
      expect(applied.body.setBy).toEqual({ userId: "usr_admin", name: "Park Hyunjin", role: "admin" });

      expect(await privacyOf(owner)).toMatchObject({
        level: "high",
        locked: true,
        setBy: "Park Hyunjin",
        names: ["김지원", "Jiwon Kim", "Acme Robotics"],
        source: "team-policy",
      });
      const notes = await teamNotes(owner);
      expect(notes.map((note) => note.content)).toEqual(["House style: numbered clauses"]);
      expect(notes[0]!.tags).toEqual(expect.arrayContaining(["desk-locked", "desk-scope:team", "team-policy:acc_vectors"]));
      expect(await readFile(join(workspace, ".opencode", "skills", "house-style", "SKILL.md"), "utf8")).toContain(
        "Use numbered clauses.",
      );
      // Schema v2 has no playbooks: nothing is written as a command, and the status has no such field.
      await expect(readFile(join(workspace, ".opencode", "commands", "weekly-update.md"), "utf8")).rejects.toThrow();
      expect(applied.body.skills).toEqual(["house-style"]);
      expect(applied.body).not.toHaveProperty("playbooks");

      const audit = (await owner("GET", "/workspace/workspace/audit")).body.items as Array<{ action: string; summary: string }>;
      expect(audit[0]).toMatchObject({ action: "policy.applied" });
      expect(audit[0]!.summary).toContain("version 1 set by Park Hyunjin (test key)");

      const status = (await owner("GET", "/workspace/workspace/team-policy")).body;
      expect(status).toMatchObject({ joined: true, version: 1, skills: ["house-style"] });
      expect(status).not.toHaveProperty("playbooks");

      // Nothing touched the commands, so no commands reload is announced.
      const reasons = ((await owner("GET", "/workspace/workspace/events")).body.items as ReloadEvent[]).map((event) => event.reason);
      expect(reasons).toEqual(expect.arrayContaining(["config", "skills"]));
      expect(reasons).not.toContain("commands");
    } finally {
      server.stop(true);
    }
  });

  test("the same policy again is a no-op; an older or conflicting one is refused", async () => {
    const { server, owner } = await startPolicyServer();
    try {
      const v2 = await signTestPolicy(samplePolicy({ version: 2 }));
      expect((await apply(owner, v2)).body.status).toBe("applied");
      expect((await apply(owner, v2)).body.status).toBe("unchanged");

      const older = await apply(owner, await signTestPolicy(samplePolicy({ version: 1 })));
      expect(older.status).toBe(409);
      expect(older.body.code).toBe("team_policy_not_newer");

      const sameVersionDifferent = await apply(
        owner,
        await signTestPolicy(samplePolicy({ version: 2, notes: [{ id: "n", text: "something else" }] })),
      );
      expect(sameVersionDifferent.status).toBe(409);
      expect(sameVersionDifferent.body.code).toBe("team_policy_conflict");
    } finally {
      server.stop(true);
    }
  });

  test("a newer policy replaces the notes and skills as a whole set", async () => {
    const { server, workspace, owner } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy()));
      await apply(
        owner,
        await signTestPolicy(
          samplePolicy({
            version: 2,
            notes: [{ id: "note_2", text: "Cite the clause number" }],
            skills: [{ name: "clause-check", description: "Clause check", content: "Check every clause." }],
          }),
        ),
      );
      expect((await teamNotes(owner)).map((note) => note.content)).toEqual(["Cite the clause number"]);
      await expect(readFile(join(workspace, ".opencode", "skills", "house-style", "SKILL.md"), "utf8")).rejects.toThrow();
      expect(await readFile(join(workspace, ".opencode", "skills", "clause-check", "SKILL.md"), "utf8")).toContain(
        "Check every clause.",
      );
    } finally {
      server.stop(true);
    }
  });

  test("refuses another team's policy, a policy for the wrong account, and bad signatures", async () => {
    const { server, owner } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy()));
      const other = await apply(owner, await signTestPolicy(samplePolicy({ accountId: "acc_other", version: 9 })));
      expect(other.status).toBe(409);
      expect(other.body.code).toBe("team_policy_other_team");

      const wrongAccount = await apply(owner, await signTestPolicy(samplePolicy({ version: 3 })), "acc_someone_else");
      expect(wrongAccount.status).toBe(422);
      expect(wrongAccount.body.code).toBe("team_policy_wrong_account");

      const tampered = vectorFile.vectors.find((vector) => vector.name === "payload changed after signing")!;
      const bad = await apply(owner, tampered.jws);
      expect(bad.status).toBe(422);
      expect(bad.body.code).toBe("team_policy_bad_signature");
      expect((await owner("GET", "/workspace/workspace/team-policy")).body.version).toBe(1);
    } finally {
      server.stop(true);
    }
  });

  test("refuses a schema v1 policy, playbooks and all, and keeps what was applied", async () => {
    const { server, workspace, owner } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy()));
      const v1 = await signTestPolicy({
        ...samplePolicy({ version: 2 }),
        v: 1,
        playbooks: [{ name: "weekly-update", template: "Write this week's update." }],
      });
      const refused = await apply(owner, v1);
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe("team_policy_unsupported_version");
      expect((await owner("GET", "/workspace/workspace/team-policy")).body.version).toBe(1);
      await expect(readFile(join(workspace, ".opencode", "commands", "weekly-update.md"), "utf8")).rejects.toThrow();
    } finally {
      server.stop(true);
    }
  });

  test("only the owner applies or leaves a policy", async () => {
    const { server, collaborator } = await startPolicyServer();
    try {
      expect((await apply(collaborator, await signTestPolicy(samplePolicy()))).status).toBe(403);
      expect((await collaborator("DELETE", "/workspace/workspace/team-policy")).status).toBe(403);
    } finally {
      server.stop(true);
    }
  });
});

describe("what a locked team policy holds", () => {
  test("nobody changes the locked privacy setting directly, owner included", async () => {
    const { server, owner, collaborator } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy()));
      const before = await privacyOf(owner);
      for (const call of [owner, collaborator]) {
        const patched = await call("PATCH", "/workspace/workspace/config", {
          redrob: { deskPrivacy: { ...before, level: "off", locked: false } },
        });
        expect(patched.status).toBe(403);
        expect(patched.body.code).toBe("team_policy_locked");

        const imported = await call("POST", "/workspace/workspace/import", {
          redrob: { deskPrivacy: { level: "off", names: [], locked: false } },
        });
        expect(imported.status).toBe(403);
        expect(imported.body.code).toBe("team_policy_locked");
      }
      expect(await privacyOf(owner)).toEqual(before);

      // Other config still changes as usual.
      const unrelated = await owner("PATCH", "/workspace/workspace/config", { redrob: { deskTheme: "dark" } });
      expect(unrelated.status).toBe(200);
    } finally {
      server.stop(true);
    }
  });

  test("an unlocked policy leaves the setting to the owner, as the team file did", async () => {
    const { server, owner } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy({ privacy: { ...samplePolicy().privacy, locked: false } })));
      const patched = await owner("PATCH", "/workspace/workspace/config", {
        redrob: { deskPrivacy: { level: "strict", names: [], locked: false } },
      });
      expect(patched.status).toBe(200);
    } finally {
      server.stop(true);
    }
  });

  test("team policy notes cannot be added, edited or removed through /memory", async () => {
    const { server, owner, collaborator } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy()));
      const [note] = await teamNotes(owner);
      for (const call of [owner, collaborator]) {
        const edited = await call("PATCH", `/memory/${note!.id}`, { content: "changed" });
        expect(edited.status).toBe(403);
        expect(edited.body.code).toBe("memory_team_policy");
        const removed = await call("DELETE", `/memory/${note!.id}`);
        expect(removed.status).toBe(403);
        expect(removed.body.code).toBe("memory_team_policy");
        const planted = await call("POST", "/memory", { content: "planted", tags: ["team-policy:acc_vectors"] });
        expect(planted.status).toBe(403);
        expect(planted.body.code).toBe("memory_team_policy");
      }
      expect((await teamNotes(owner)).map((memory) => memory.content)).toEqual(["House style: numbered clauses"]);
    } finally {
      server.stop(true);
    }
  });
});

describe("leaving a team", () => {
  test("removes what the policy brought, lifts the lock, keeps the level, and keeps older versions refused", async () => {
    const { server, workspace, owner } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy({ version: 5 })));
      const left = await owner("DELETE", "/workspace/workspace/team-policy");
      expect(left.status).toBe(200);
      expect(left.body).toMatchObject({ joined: false, accountId: "acc_vectors", version: 5 });

      expect(await teamNotes(owner)).toEqual([]);
      await expect(readFile(join(workspace, ".opencode", "skills", "house-style", "SKILL.md"), "utf8")).rejects.toThrow();
      expect(await privacyOf(owner)).toEqual({ level: "high", names: [], setBy: null, locked: false });
      const audit = (await owner("GET", "/workspace/workspace/audit")).body.items as Array<{ action: string }>;
      expect(audit[0]!.action).toBe("policy.left");

      // The person may now change the setting themselves.
      expect(
        (await owner("PATCH", "/workspace/workspace/config", { redrob: { deskPrivacy: { level: "standard", names: [], locked: false } } }))
          .status,
      ).toBe(200);

      // Rejoining accepts the current version again, never an older one.
      const older = await apply(owner, await signTestPolicy(samplePolicy({ version: 4 })));
      expect(older.body.code).toBe("team_policy_not_newer");
      expect((await apply(owner, await signTestPolicy(samplePolicy({ version: 5 })))).body.status).toBe("applied");
    } finally {
      server.stop(true);
    }
  });
});

/*
 * A state stored by a schema v1 build records the commands its policy installed as playbooks
 * (installed.playbooks). v2 no longer installs any, but still removes those once.
 */
describe("a state left by a schema v1 policy", () => {
  const rawStates = createWorkspaceKvStore<string>({
    tableName: "team_policy_states",
    valueColumn: "state_json",
    parse: (json) => json,
    serialize: (json) => json,
  });

  async function seedV1State(config: ServerConfig, workspace: string) {
    const stored = JSON.parse((await rawStates.get(config, "workspace")) ?? "null") as { installed: Record<string, unknown> };
    stored.installed = { ...stored.installed, playbooks: ["weekly-update"] };
    await rawStates.set(config, "workspace", JSON.stringify(stored));
    await upsertCommand(workspace, { name: "weekly-update", template: "Write this week's update." });
    // A command the person wrote themselves, which no policy cleanup may touch.
    await writeFile(join(workspace, ".opencode", "commands", "mine.md"), "My own command.\n");
  }

  const commandFile = (workspace: string, name: string) => readFile(join(workspace, ".opencode", "commands", `${name}.md`), "utf8");
  const storedJson = async (config: ServerConfig) => (await rawStates.get(config, "workspace")) ?? "";

  test("reads tolerantly, and never reports playbooks", async () => {
    const { server, workspace, config, owner } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy()));
      await seedV1State(config, workspace);
      expect(await readTeamPolicyState(config, "workspace")).toMatchObject({
        installed: { skills: ["house-style"] },
        legacyPlaybooks: ["weekly-update"],
      });
      const status = (await owner("GET", "/workspace/workspace/team-policy")).body;
      expect(status).toMatchObject({ joined: true, skills: ["house-style"] });
      expect(status).not.toHaveProperty("playbooks");
    } finally {
      server.stop(true);
    }
  });

  test("the next apply deletes those commands, announces it, and drops the field", async () => {
    const { server, workspace, config, owner } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy()));
      await seedV1State(config, workspace);
      // Let the debounce from the first apply pass, so the next commands event is this apply's.
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect((await apply(owner, await signTestPolicy(samplePolicy({ version: 2 })))).body.status).toBe("applied");
      await expect(commandFile(workspace, "weekly-update")).rejects.toThrow();
      expect(await commandFile(workspace, "mine")).toBe("My own command.\n");
      expect(await storedJson(config)).not.toContain("playbooks");
      expect(await readTeamPolicyState(config, "workspace")).not.toHaveProperty("legacyPlaybooks");
      const reasons = ((await owner("GET", "/workspace/workspace/events")).body.items as ReloadEvent[]).map((event) => event.reason);
      expect(reasons).toContain("commands");
    } finally {
      server.stop(true);
    }
  });

  test("leaving deletes those commands and drops the field", async () => {
    const { server, workspace, config, owner } = await startPolicyServer();
    try {
      await apply(owner, await signTestPolicy(samplePolicy()));
      await seedV1State(config, workspace);

      expect((await owner("DELETE", "/workspace/workspace/team-policy")).status).toBe(200);
      await expect(commandFile(workspace, "weekly-update")).rejects.toThrow();
      expect(await commandFile(workspace, "mine")).toBe("My own command.\n");
      expect(await storedJson(config)).not.toContain("playbooks");
      expect(await readTeamPolicyState(config, "workspace")).toMatchObject({ left: true, installed: { skills: [] } });
      expect(await readTeamPolicyState(config, "workspace")).not.toHaveProperty("legacyPlaybooks");
    } finally {
      server.stop(true);
    }
  });
});
