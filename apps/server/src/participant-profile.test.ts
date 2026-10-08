import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DISPLAY_NAME_MAX_LENGTH,
  createParticipantId,
  isParticipantId,
  normalizeDisplayName,
  participantProfileInternals,
  readParticipantProfile,
  updateParticipantProfile,
} from "./participant-profile.js";
import type { ServerConfig } from "./types.js";

const roots: string[] = [];
const previousRuntimeDb = process.env.REDROB_RUNTIME_DB;

afterEach(async () => {
  while (roots.length) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true }).catch(() => {});
  }
  if (previousRuntimeDb === undefined) delete process.env.REDROB_RUNTIME_DB;
  else process.env.REDROB_RUNTIME_DB = previousRuntimeDb;
});

function serverConfig(root: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: "token",
    hostToken: "host-token",
    configPath: join(root, "server.json"),
    approval: { mode: "auto", timeoutMs: 0 },
    corsOrigins: [],
    workspaces: [],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
    ...overrides,
  };
}

async function tempConfig(overrides: Partial<ServerConfig> = {}): Promise<ServerConfig> {
  const root = await mkdtemp(join(tmpdir(), "redrob-participant-profile-"));
  roots.push(root);
  process.env.REDROB_RUNTIME_DB = join(root, "runtime.sqlite");
  return serverConfig(root, overrides);
}

describe("participant profile", () => {
  test("creates an id on first read and keeps it", async () => {
    const config = await tempConfig();
    const first = await readParticipantProfile(config);
    expect(isParticipantId(first.participantId)).toBe(true);
    expect(first.displayName).toBe("");
    const second = await readParticipantProfile(config);
    expect(second.participantId).toBe(first.participantId);
  });

  test("renaming keeps the id", async () => {
    const config = await tempConfig();
    const before = await readParticipantProfile(config);
    const after = await updateParticipantProfile(config, { displayName: "Kim Jiwon" });
    expect(after.participantId).toBe(before.participantId);
    expect((await readParticipantProfile(config)).displayName).toBe("Kim Jiwon");
  });

  test("a read-only server answers without writing", async () => {
    const config = await tempConfig({ readOnly: true });
    const first = await readParticipantProfile(config);
    const second = await readParticipantProfile(config);
    expect(isParticipantId(first.participantId)).toBe(true);
    expect(second.participantId).not.toBe(first.participantId);
  });

  test("ids have one shape", () => {
    expect(isParticipantId(createParticipantId())).toBe(true);
    expect(isParticipantId("par_123")).toBe(false);
    expect(isParticipantId("usr_0123456789abcdef01234567")).toBe(false);
  });
});

describe("normalizeDisplayName", () => {
  test("collapses whitespace and trims", () => {
    expect(normalizeDisplayName("  Park   Hyunjin ")).toEqual({ ok: true, value: "Park Hyunjin" });
  });

  test("keeps Korean names whole", () => {
    expect(normalizeDisplayName("김지원")).toEqual({ ok: true, value: "김지원" });
  });

  test("allows clearing the name", () => {
    expect(normalizeDisplayName("   ")).toEqual({ ok: true, value: "" });
  });

  test("refuses control and direction-override characters", () => {
    expect(normalizeDisplayName("Kim\nJiwon").ok).toBe(false);
    expect(normalizeDisplayName("Kim\u202eJiwon").ok).toBe(false);
  });

  test("counts characters, not UTF-16 units", () => {
    expect(normalizeDisplayName("가".repeat(DISPLAY_NAME_MAX_LENGTH)).ok).toBe(true);
    expect(normalizeDisplayName("가".repeat(DISPLAY_NAME_MAX_LENGTH + 1)).ok).toBe(false);
  });

  test("refuses non-strings", () => {
    expect(normalizeDisplayName(42).ok).toBe(false);
  });
});

describe("parseProfile", () => {
  test("keeps the id of a row whose name is damaged", () => {
    const id = createParticipantId();
    const parsed = participantProfileInternals.parseProfile(JSON.stringify({ participantId: id, displayName: "a\u0000b" }));
    expect(parsed?.participantId).toBe(id);
    expect(parsed?.displayName).toBe("");
  });

  test("drops a row without a valid id", () => {
    expect(participantProfileInternals.parseProfile(JSON.stringify({ participantId: "x" }))).toBeUndefined();
    expect(participantProfileInternals.parseProfile("{")).toBeUndefined();
  });
});

describe("profile routes", () => {
  test("any client reads the profile; only the host renames it", async () => {
    const { startRouteTestServer } = await import("./test-support/route-test-server.js");
    const harness = await startRouteTestServer();
    try {
      const read = await harness.collaborator("GET", "/profile");
      expect(read.status).toBe(200);
      const { profile } = (await read.json()) as { profile: { participantId: string } };
      expect(isParticipantId(profile.participantId)).toBe(true);

      expect((await harness.collaborator("PUT", "/profile", { displayName: "Guest" })).status).toBe(401);

      const renamed = await harness.owner("PUT", "/profile", { displayName: " Park  Hyunjin " });
      expect(renamed.status).toBe(200);
      const body = (await renamed.json()) as { profile: { participantId: string; displayName: string } };
      expect(body.profile).toMatchObject({ participantId: profile.participantId, displayName: "Park Hyunjin" });

      expect((await harness.host("PUT", "/profile", { displayName: "a\nb" })).status).toBe(400);
    } finally {
      await harness.cleanup();
    }
  });
});
