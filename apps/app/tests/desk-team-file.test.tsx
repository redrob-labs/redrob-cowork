import { describe, expect, test } from "bun:test";
import type { Memory } from "@redrob/types/memory";
import { renderToStaticMarkup } from "react-dom/server";

import { RedrobServerError, type RedrobWorkspaceImportPreview } from "../src/app/lib/redrob-server";
import { t } from "../src/i18n";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import { applyTeamFile, buildTeamFile, readTeamSettings, reviewTeamFile } from "../src/react-app/desk/team/team-file";
import { TeamFileView, TeamReviewBody, teamFileRefusalText } from "../src/react-app/desk/team/team-file-group";

const memory = (id: string, content: string, tags: string[]): Memory => ({
  id,
  content,
  tags,
  source: "user",
  scope: "local",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  contexts: [],
});

/** Two workspaces' worth of server: the admin's, then a teammate's. */
function fakeServer(start: { memories: Memory[]; redrob: Record<string, unknown>; opencode?: Record<string, unknown> }) {
  const calls: string[] = [];
  let memories = [...start.memories];
  let redrob = { ...start.redrob };
  let next = 100;
  const preview: RedrobWorkspaceImportPreview = {
    fingerprint: "fp-1",
    summary: { total: 1, create: 1, update: 0, replace: 0, delete: 0, unchanged: 0 },
    changes: [],
  };
  const client = {
    exportWorkspace: async () => ({
      workspaceId: "ws_admin",
      exportedAt: 1,
      redrob: { ...redrob },
      ...(start.opencode ? { opencode: start.opencode } : {}),
      commands: [{ name: "weekly-update", template: "# Weekly\n\nDo it." }],
    }),
    previewWorkspaceImport: async (_workspaceId: string, payload: Record<string, unknown>) => {
      calls.push(`preview:${Object.keys(payload).sort().join(",")}`);
      return preview;
    },
    importWorkspace: async (_workspaceId: string, payload: Record<string, unknown>) => {
      calls.push(`import:${String(payload.previewFingerprint)}`);
      return { ok: true };
    },
    listMemories: async () => memories,
    saveMemory: async (payload: { content: string; tags?: string[] | null; source?: string }) => {
      calls.push(`save:${payload.content}:${(payload.tags ?? []).join(",")}`);
      const saved = memory(`m${next++}`, payload.content, payload.tags ?? []);
      memories = [...memories, saved];
      return saved;
    },
    deleteMemory: async (memoryId: string) => {
      calls.push(`delete:${memoryId}`);
      memories = memories.filter((entry) => entry.id !== memoryId);
    },
    getConfig: async () => ({ opencode: {}, redrob }),
    patchConfig: async (_workspaceId: string, payload: { redrob?: Record<string, unknown> }) => {
      calls.push("patch");
      redrob = { ...redrob, ...payload.redrob };
      return { updatedAt: 1 };
    },
  };
  return { client, calls, memories: () => memories, redrob: () => redrob };
}

describe("the team file", () => {
  test("the admin's file carries the team notes and the level, named for who set it", async () => {
    const admin = fakeServer({
      memories: [memory("m1", "House style: numbered clauses", ["desk-scope:team"]), memory("m2", "Call me Jiwoo", ["desk-scope:you"])],
      redrob: { deskPrivacy: { level: "high", names: ["Seorin"] } },
    });
    const file = await buildTeamFile(admin.client, "ws_admin", " Park Hyunjin ");
    expect(file.redrob.team).toEqual({
      privacy: { level: "high", names: ["Seorin"], setBy: "Park Hyunjin" },
      notes: [{ text: "House style: numbered clauses" }],
    });
    // The personal note and the workspace's own privacy entry stay home; playbooks travel.
    expect(JSON.stringify(file)).not.toContain("Call me Jiwoo");
    expect(file.redrob.deskPrivacy).toBeUndefined();
    expect(file.commands?.[0]?.name).toBe("weekly-update");
    expect(readTeamSettings(file)?.privacy.setBy).toBe("Park Hyunjin");
    expect(readTeamSettings({ workspaceId: "x" })).toBeNull();
  });

  test("a teammate's import: the workspace, then the team notes once each and the level, locked", async () => {
    const admin = fakeServer({ memories: [memory("m1", "House style", ["desk-scope:team"])], redrob: { deskPrivacy: { level: "strict", names: ["Seorin"] } } });
    const file = await buildTeamFile(admin.client, "ws_admin", "Park");
    const mate = fakeServer({ memories: [], redrob: {} });
    // Reviewing changes nothing: only the server's preview is asked.
    const review = await reviewTeamFile(mate.client, "ws_mate", file);
    expect(mate.calls).toEqual(["preview:commands,exportedAt,redrob,workspaceId"]);
    expect(review).toMatchObject({ fingerprint: "fp-1", changes: 1, playbooks: 1, notesAdded: 1, notesRemoved: 0, connectors: [], plugins: [], permissions: false });
    expect(await applyTeamFile(mate.client, "ws_mate", review)).toEqual({ notesAdded: 1, notesRemoved: 0, level: "strict", setBy: "Park" });
    // The locked level goes first: it is the step a refusal comes at, so a refusal changes nothing.
    expect(mate.calls).toEqual(["preview:commands,exportedAt,redrob,workspaceId", "patch", "import:fp-1", "save:House style:desk-scope:team,desk-locked"]);
    expect(mate.redrob().deskPrivacy).toEqual({ level: "strict", names: ["Seorin"], setBy: "Park", locked: true });

    // Using it again adds nothing twice.
    expect((await applyTeamFile(mate.client, "ws_mate", await reviewTeamFile(mate.client, "ws_mate", file))).notesAdded).toBe(0);

    // And on the teammate's screens: locked notes, a locked level that says who set it.
    const unused = async (): Promise<never> => {
      throw new Error("not used");
    };
    const deskClient: DeskServerClient = {
      ...mate.client,
      updateMemory: unused,
      deleteMemory: unused,
      listWorkspaces: unused,
      listSessions: unused,
      getSession: unused,
      getSessionSnapshot: unused,
      listArtifacts: unused,
      listMcp: unused,
      listCommands: unused,
      upsertCommand: unused,
      deleteCommand: unused,
      listSchedules: unused,
      addSchedule: unused,
      updateSchedule: unused,
      answerScheduleWaiting: unused,
    };
    const services = createRealDeskServices({ client: deskClient, workspaceId: "ws_mate" });
    expect((await services.notes.list()).data).toMatchObject([{ text: "House style", scope: "team", locked: true }]);
    expect((await services.privacy.get()).data).toMatchObject({ level: "strict", setBy: "Park", locked: true });
    await expect(services.privacy.setLevel("off")).rejects.toThrow();
  });

  test("a refused privacy lock stops the file before the project is imported, and says why", async () => {
    const admin = fakeServer({ memories: [memory("m1", "House style", ["desk-scope:team"])], redrob: { deskPrivacy: { level: "high", names: [] } } });
    const file = await buildTeamFile(admin.client, "ws_admin", "Park");
    for (const [error, text] of [
      [new RedrobServerError(403, "forbidden", "Insufficient token scope"), t("desk.team_use_failed_owner")],
      [new RedrobServerError(403, "team_policy_locked", "locked"), t("desk.team_use_failed_policy")],
    ] as const) {
      const mate = fakeServer({ memories: [], redrob: {} });
      const refusing = {
        ...mate.client,
        patchConfig: async () => {
          mate.calls.push("patch");
          throw error;
        },
      };
      const review = await reviewTeamFile(refusing, "ws_mate", file);
      const failure = await applyTeamFile(refusing, "ws_mate", review).catch((reason: unknown) => reason);
      expect(failure).toBe(error);
      expect(mate.calls).toEqual(["preview:commands,exportedAt,redrob,workspaceId", "patch"]);
      expect(teamFileRefusalText(failure)).toBe(text);
    }
    expect(teamFileRefusalText(new Error("network"))).toBe(t("desk.team_use_failed_text"));
  });

  test("a file that is not a team file is refused before anything changes", async () => {
    const mate = fakeServer({ memories: [], redrob: {} });
    await expect(reviewTeamFile(mate.client, "ws_mate", { workspaceId: "x", redrob: {} })).rejects.toThrow();
    expect(mate.calls).toEqual([]);
  });

  test("a newer file drops the locked notes it no longer carries, and leaves personal notes alone", async () => {
    const mate = fakeServer({
      memories: [
        memory("old", "Old rule", ["desk-scope:team", "desk-locked"]),
        memory("kept", "House style", ["desk-scope:team", "desk-locked"]),
        memory("mine", "Call me Jiwoo", ["desk-scope:you"]),
      ],
      redrob: {},
    });
    const admin = fakeServer({ memories: [memory("m1", "House style", ["desk-scope:team"]), memory("m2", "New rule", ["desk-scope:team"])], redrob: {} });
    const review = await reviewTeamFile(mate.client, "ws_mate", await buildTeamFile(admin.client, "ws_admin", "Park"));
    expect(review).toMatchObject({ notesAdded: 1, notesRemoved: 1 });
    expect(await applyTeamFile(mate.client, "ws_mate", review)).toMatchObject({ notesAdded: 1, notesRemoved: 1 });
    expect(mate.calls).toContain("delete:old");
    expect(mate.memories().map((entry) => entry.content).sort()).toEqual(["Call me Jiwoo", "House style", "New rule"]);
  });

  test("the review names connectors that start programs, add-ons and permission changes before anything changes", async () => {
    const admin = fakeServer({
      memories: [],
      redrob: {},
      opencode: {
        mcp: { notes: { type: "remote", url: "https://example.com/mcp" }, helper: { type: "local", command: ["node", "helper.js"] } },
        plugin: ["some-addon"],
        permission: { bash: "allow" },
      },
    });
    const file = await buildTeamFile(admin.client, "ws_admin", "");
    const mate = fakeServer({ memories: [], redrob: {} });
    const review = await reviewTeamFile(mate.client, "ws_mate", file);
    expect(review.connectors).toEqual([{ name: "notes", runsProgram: false }, { name: "helper", runsProgram: true }]);
    expect(review.plugins).toEqual(["some-addon"]);
    expect(review.permissions).toBe(true);
    expect(mate.calls.some((call) => call.startsWith("import"))).toBe(false);

    const html = renderToStaticMarkup(<TeamReviewBody review={review} />);
    expect(html).toContain("This file can run things on this computer");
    expect(html).toContain("start programs on this computer: helper");
    expect(html).toContain("some-addon");
    expect(html).toContain("what the AI may do without asking");
    expect(html).toContain("Doesn&#x27;t say who set it.");
    expect(html).toContain("Nothing has changed yet.");

    // A file with nothing that runs carries no warning, and says who it claims set it.
    const plain = await reviewTeamFile(mate.client, "ws_mate", await buildTeamFile(fakeServer({ memories: [], redrob: {} }).client, "ws_admin", "Park"));
    const quiet = renderToStaticMarkup(<TeamReviewBody review={plain} />);
    expect(quiet).not.toContain("This file can run things");
    expect(quiet).toContain("Says it was set by Park. The file can&#x27;t prove who made it.");
  });

  test("Settings offers both, in words", () => {
    const html = renderToStaticMarkup(<TeamFileView name="" busy={false} onName={() => {}} onShare={() => {}} onUse={() => {}} />);
    expect(html).toContain("Save team file");
    expect(html).toContain("Choose team file");
    expect(html).toContain("Keys and passwords are left out.");
  });
});
