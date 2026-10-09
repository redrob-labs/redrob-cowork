import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseFrontmatter } from "../frontmatter.js";
import type { ServerConfig } from "../types.js";
import { exists } from "../utils.js";
import { readTeamSkillsState, syncTeamSkills, type TeamSkillsFetch, type TeamSkillsSyncDeps } from "./sync.js";

const savedDb = process.env.REDROB_RUNTIME_DB;
let workspacePath: string;
let dataDir: string;
let config: ServerConfig;

beforeEach(async () => {
  workspacePath = await mkdtemp(join(tmpdir(), "redrob-team-skills-ws-"));
  dataDir = await mkdtemp(join(tmpdir(), "redrob-team-skills-data-"));
  await mkdir(join(workspacePath, ".git"), { recursive: true });
  process.env.REDROB_RUNTIME_DB = join(dataDir, "runtime.sqlite");
  config = {
    host: "127.0.0.1",
    port: 0,
    token: "t",
    hostToken: "h",
    configPath: join(dataDir, "config.json"),
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: [],
    workspaces: [{ id: "ws", name: "ws", path: workspacePath, preset: "default", workspaceType: "local" }],
    authorizedRoots: [workspacePath],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
});

afterEach(async () => {
  if (savedDb === undefined) delete process.env.REDROB_RUNTIME_DB;
  else process.env.REDROB_RUNTIME_DB = savedDb;
  await rm(workspacePath, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

const workspace = () => ({ id: "ws", path: workspacePath });
const skillFile = (name: string) => join(workspacePath, ".opencode", "skills", name, "SKILL.md");

function teamSkill(name: string, body = `Do ${name}.`) {
  return { name, description: `The team's ${name}`, body, profession: "lawyer", task: "review", language: "en", version: 1, updatedAt: "2026-10-01T00:00:00Z", content: "" };
}

/** A Console that answers with `skills` under `etag`, or a status, and records what it was asked. */
function fakeConsole() {
  const state: { status: number; etag: string; skills: ReturnType<typeof teamSkill>[] } = { status: 200, etag: '"a"', skills: [] };
  const calls: Array<{ url: string; auth: string | null; ifNoneMatch: string | null }> = [];
  const fetchImpl: TeamSkillsFetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("authorization"), ifNoneMatch: headers.get("if-none-match") });
    if (state.status !== 200) return new Response("{}", { status: state.status });
    if (headers.get("if-none-match") === state.etag) return new Response(null, { status: 304 });
    return new Response(JSON.stringify({ etag: state.etag, skills: state.skills }), { status: 200, headers: { etag: state.etag } });
  };
  return { state, calls, fetchImpl };
}

function deps(fetchImpl: TeamSkillsFetch, changes: string[] = [], key: string | null = "rr-key"): TeamSkillsSyncDeps {
  return { readKey: async () => key, fetchImpl, baseUrl: "https://console.test/v1", onChange: (ws) => changes.push(ws.id) };
}

describe("team skills sync", () => {
  test("installs the team's skills marked as team skills, with the key, and records them", async () => {
    const remote = fakeConsole();
    remote.state.skills = [teamSkill("nda-review"), teamSkill("weekly-update")];
    const changes: string[] = [];
    const state = await syncTeamSkills(config, workspace(), deps(remote.fetchImpl, changes));
    expect(remote.calls[0]).toEqual({ url: "https://console.test/v1/skill-sync", auth: "Bearer rr-key", ifNoneMatch: null });
    expect(state).toMatchObject({ status: "synced", etag: '"a"', installed: ["nda-review", "weekly-update"], conflicts: [] });
    const written = parseFrontmatter(await readFile(skillFile("nda-review"), "utf8"));
    expect(written.data.metadata).toMatchObject({ source: "team", profession: "lawyer", task: "review", language: "en", version: 1 });
    expect(written.body.trim()).toBe("Do nda-review.");
    expect(changes).toEqual(["ws"]);
    expect(await readTeamSkillsState(config, "ws")).toEqual(state);
  });

  test("an unchanged team (304) changes nothing", async () => {
    const remote = fakeConsole();
    remote.state.skills = [teamSkill("nda-review")];
    await syncTeamSkills(config, workspace(), deps(remote.fetchImpl));
    const changes: string[] = [];
    const state = await syncTeamSkills(config, workspace(), deps(remote.fetchImpl, changes));
    expect(remote.calls[1]?.ifNoneMatch).toBe('"a"');
    expect(state).toMatchObject({ status: "synced", installed: ["nda-review"] });
    expect(changes).toEqual([]);
  });

  test("updates a changed skill and removes one the team dropped", async () => {
    const remote = fakeConsole();
    remote.state.skills = [teamSkill("nda-review"), teamSkill("weekly-update")];
    await syncTeamSkills(config, workspace(), deps(remote.fetchImpl));
    remote.state.etag = '"b"';
    remote.state.skills = [teamSkill("nda-review", "Check the term first.")];
    const changes: string[] = [];
    const state = await syncTeamSkills(config, workspace(), deps(remote.fetchImpl, changes));
    expect(state.installed).toEqual(["nda-review"]);
    expect(parseFrontmatter(await readFile(skillFile("nda-review"), "utf8")).body.trim()).toBe("Check the term first.");
    expect(await exists(skillFile("weekly-update"))).toBe(false);
    expect(changes).toEqual(["ws"]);
  });

  test("a skill already there that the sync did not install wins, and is reported", async () => {
    await mkdir(join(workspacePath, ".opencode", "skills", "nda-review"), { recursive: true });
    const mine = "---\nname: nda-review\ndescription: My own NDA review\n---\n\nMine.\n";
    await writeFile(skillFile("nda-review"), mine, "utf8");
    const remote = fakeConsole();
    remote.state.skills = [teamSkill("nda-review"), teamSkill("weekly-update")];
    const state = await syncTeamSkills(config, workspace(), deps(remote.fetchImpl));
    expect(state).toMatchObject({ installed: ["weekly-update"], conflicts: ["nda-review"] });
    expect(await readFile(skillFile("nda-review"), "utf8")).toBe(mine);
    // While there is a conflict the next check asks for everything, so removing the local one resolves it.
    await rm(join(workspacePath, ".opencode", "skills", "nda-review"), { recursive: true });
    const next = await syncTeamSkills(config, workspace(), deps(remote.fetchImpl));
    expect(remote.calls[1]?.ifNoneMatch).toBeNull();
    expect(next).toMatchObject({ installed: ["nda-review", "weekly-update"], conflicts: [] });
  });

  test("401 and 403 remove the team's skills, and only those", async () => {
    for (const [status, expected] of [[401, "not_connected"], [403, "not_member"]] as const) {
      const remote = fakeConsole();
      remote.state.skills = [teamSkill("nda-review")];
      await syncTeamSkills(config, workspace(), deps(remote.fetchImpl));
      await mkdir(join(workspacePath, ".opencode", "skills", "my-own"), { recursive: true });
      await writeFile(skillFile("my-own"), "---\nname: my-own\ndescription: Mine\n---\n\nMine.\n", "utf8");
      remote.state.status = status;
      const changes: string[] = [];
      const state = await syncTeamSkills(config, workspace(), deps(remote.fetchImpl, changes));
      expect(state).toMatchObject({ status: expected, installed: [], conflicts: [], etag: null });
      expect(await exists(skillFile("nda-review"))).toBe(false);
      expect(await exists(skillFile("my-own"))).toBe(true);
      expect(changes).toEqual(["ws"]);
    }
  });

  test("no key and no answer change nothing on disk", async () => {
    const remote = fakeConsole();
    remote.state.skills = [teamSkill("nda-review")];
    await syncTeamSkills(config, workspace(), deps(remote.fetchImpl));

    const noKey = await syncTeamSkills(config, workspace(), deps(remote.fetchImpl, [], null));
    expect(noKey).toMatchObject({ status: "not_connected", installed: ["nda-review"] });
    expect(remote.calls).toHaveLength(1);

    const down = await syncTeamSkills(config, workspace(), deps(() => Promise.reject(new Error("offline"))));
    expect(down).toMatchObject({ status: "unreachable", installed: ["nda-review"] });
    remote.state.status = 502;
    expect(await syncTeamSkills(config, workspace(), deps(remote.fetchImpl))).toMatchObject({ status: "unreachable" });
    expect(await exists(skillFile("nda-review"))).toBe(true);
  });

  test("concurrent checks of one workspace share one request", async () => {
    const remote = fakeConsole();
    remote.state.skills = [teamSkill("nda-review")];
    const [a, b] = await Promise.all([
      syncTeamSkills(config, workspace(), deps(remote.fetchImpl)),
      syncTeamSkills(config, workspace(), deps(remote.fetchImpl)),
    ]);
    expect(a).toEqual(b);
    expect(remote.calls).toHaveLength(1);
  });
});
