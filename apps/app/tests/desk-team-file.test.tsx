import { describe, expect, test } from "bun:test";
import type { Memory } from "@redrob/types/memory";
import { renderToStaticMarkup } from "react-dom/server";

import type { RedrobWorkspaceImportPreview } from "../src/app/lib/redrob-server";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import { applyTeamFile, buildTeamFile, readTeamSettings } from "../src/react-app/desk/team/team-file";
import { TeamFileView } from "../src/react-app/desk/team/team-file-group";

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
function fakeServer(start: { memories: Memory[]; redrob: Record<string, unknown> }) {
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
    exportWorkspace: async () => ({ workspaceId: "ws_admin", exportedAt: 1, redrob: { ...redrob }, commands: [{ name: "weekly-update", template: "# Weekly\n\nDo it." }] }),
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
    expect(await applyTeamFile(mate.client, "ws_mate", file)).toEqual({ notesAdded: 1, level: "strict", setBy: "Park" });
    expect(mate.calls).toEqual(["preview:commands,exportedAt,redrob,workspaceId", "import:fp-1", "save:House style:desk-scope:team,desk-locked", "patch"]);
    expect(mate.redrob().deskPrivacy).toEqual({ level: "strict", names: ["Seorin"], setBy: "Park", locked: true });

    // Using it again adds nothing twice.
    expect((await applyTeamFile(mate.client, "ws_mate", file)).notesAdded).toBe(0);

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

  test("a file that is not a team file is refused before anything changes", async () => {
    const mate = fakeServer({ memories: [], redrob: {} });
    await expect(applyTeamFile(mate.client, "ws_mate", { workspaceId: "x", redrob: {} })).rejects.toThrow();
    expect(mate.calls).toEqual([]);
  });

  test("Settings offers both, in words", () => {
    const html = renderToStaticMarkup(<TeamFileView name="" busy={false} onName={() => {}} onShare={() => {}} onUse={() => {}} />);
    expect(html).toContain("Save team file");
    expect(html).toContain("Choose team file");
    expect(html).toContain("Keys and passwords are left out.");
  });
});
