import { describe, expect, test } from "bun:test";
import type { Session } from "@redrob-labs/sdk/v2/client";
import type { Memory } from "@redrob/types/memory";

import type { RedrobWorkspaceInfo } from "../src/app/lib/redrob-server";
import type { DeskServices } from "../src/react-app/desk/services/desk-services";
import { createFixtureDeskServices, runScripted } from "../src/react-app/desk/services/fixture-services";
import { createDeskServices, createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import type { DeskTimers, TimerHandle } from "../src/react-app/desk/timers";

/** A manual clock: timers fire only when the test advances time. */
function fakeClock() {
  let now = 0;
  let nextId = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const handles = new Map<TimerHandle, number>();
  const timers: DeskTimers = {
    setTimeout(fn, ms) {
      const id = ++nextId;
      pending.set(id, { at: now + ms, fn });
      // Reuse a real handle value as the opaque token so the type stays honest.
      const handle = globalThis.setTimeout(() => {}, 1e9);
      globalThis.clearTimeout(handle);
      handles.set(handle, id);
      return handle;
    },
    clearTimeout(handle) {
      const id = handles.get(handle);
      if (id !== undefined) pending.delete(id);
    },
  };
  const advanceTo = (time: number) => {
    for (;;) {
      const due = [...pending.entries()].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = time;
  };
  return { timers, advanceTo };
}

async function everyResult(services: DeskServices) {
  return [
    await services.chats.list(),
    await services.chats.get("notice"),
    await services.projects.list(),
    await services.notes.list(),
    await services.playbooks.list(),
    await services.playbooks.get("first-review"),
    await services.schedules.list(),
    await services.history.list(),
    await services.connectors.list(),
    await services.privacy.get(),
    await services.privacy.setLevel("strict"),
    await services.catalog.get(),
    await services.files.list(),
  ];
}

describe("desk fixture services", () => {
  test("every fixture result is marked preview", async () => {
    const results = await everyResult(createFixtureDeskServices());
    for (const result of results) expect(result.preview).toBe(true);
  });

  test("counts match the prototype sidebar", async () => {
    const services = createFixtureDeskServices();
    const connectors = (await services.connectors.list()).data;
    expect(connectors.filter((connector) => connector.state === "connected")).toHaveLength(6);
    expect((await services.schedules.list()).data.waiting).toHaveLength(2);
    expect((await services.privacy.get()).data.level).toBe("high");

    const notes = (await services.notes.list()).data;
    expect(notes.length).toBe(22);
    expect((await services.projects.list()).data).toHaveLength(5);
  });

  test("notes add, edit and remove; admin notes stay locked", async () => {
    const services = createFixtureDeskServices({ now: () => 42 });
    const before = (await services.notes.list()).data.length;

    const added = await services.notes.add({ text: "Seorin's CFO signs off on price changes", scope: "project:seorin" });
    expect(added).toMatchObject({ preview: true, data: { scope: "project:seorin", when: 42, how: "told" } });
    expect((await services.notes.list()).data).toHaveLength(before + 1);

    const edited = await services.notes.edit(added.data.id, "Seorin's CFO signs off");
    expect(edited.data.text).toBe("Seorin's CFO signs off");

    await services.notes.remove(added.data.id);
    expect((await services.notes.list()).data).toHaveLength(before);

    await expect(services.notes.remove("n21")).rejects.toThrow();
    await expect(services.notes.edit("n22", "x")).rejects.toThrow();
    // Another instance starts from the fixture again.
    expect((await createFixtureDeskServices().notes.list()).data).toHaveLength(22);
  });

  test("chats are newest first and filter by project", async () => {
    const services = createFixtureDeskServices();
    const all = (await services.chats.list()).data;
    expect(all[0]?.id).toBe("notice");
    const hanbit = (await services.chats.list({ projectId: "hanbit" })).data;
    expect(hanbit.every((chat) => chat.projectId === "hanbit")).toBe(true);
    expect(hanbit).toHaveLength(5);
    expect((await services.chats.get("style")).data).toMatchObject({ projectId: null, mode: "run", memory: "all" });
    expect((await services.files.list({ projectId: "seorin" })).data).toHaveLength(3);
  });
});

describe("desk scripted runs", () => {
  test("steps land stepMs*(i+1) apart and the answer at stepMs*(steps+1)", () => {
    const clock = fakeClock();
    const seen: string[] = [];
    runScripted(["read", "check", "draft"], { onStep: (step, index) => seen.push(`${index}:${step}`), onAnswer: () => seen.push("answer") }, { stepMs: 650, timers: clock.timers });

    clock.advanceTo(649);
    expect(seen).toEqual([]);
    clock.advanceTo(650);
    expect(seen).toEqual(["0:read"]);
    clock.advanceTo(1950);
    expect(seen).toEqual(["0:read", "1:check", "2:draft"]);
    clock.advanceTo(2599);
    expect(seen).toHaveLength(3);
    clock.advanceTo(2600);
    expect(seen.at(-1)).toBe("answer");
  });

  test("the fixture service uses its stepMs, and cancel stops the run", () => {
    const clock = fakeClock();
    const services = createFixtureDeskServices({ stepMs: 100, timers: clock.timers });
    const seen: number[] = [];
    let answered = false;
    const cancel = services.runScripted([1, 2, 3], { onStep: (step) => seen.push(step), onAnswer: () => { answered = true; } });

    clock.advanceTo(200);
    expect(seen).toEqual([1, 2]);
    cancel();
    clock.advanceTo(10_000);
    expect(seen).toEqual([1, 2]);
    expect(answered).toBe(false);
  });
});

function fakeClient() {
  const calls: string[] = [];
  const workspace: RedrobWorkspaceInfo = { id: "ws_1", name: "seorin-msa", displayName: "Seorin MSA", path: "/w", preset: "starter", workspaceType: "local" };
  const session: Session = {
    id: "ses_1",
    slug: "ses-1",
    projectID: "p",
    directory: "/w",
    title: "Notice by email - valid?",
    version: "1",
    time: { created: 1, updated: 5 },
  };
  const older: Session = { ...session, id: "ses_0", title: "Older", time: { created: 1, updated: 2 } };
  let memories: Memory[] = [
    { id: "m1", content: "Call me Jiwoo", tags: null, source: "user", scope: "local", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", contexts: [] },
    { id: "m2", content: "Filings by 17:00", tags: ["desk-scope:project:hanbit"], source: "agent", scope: "local", createdAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z", contexts: [] },
  ];
  let nextMemory = 3;
  let redrob: Record<string, unknown> = {};
  const client: DeskServerClient = {
    listWorkspaces: async () => {
      calls.push("listWorkspaces");
      return { items: [workspace] };
    },
    listSessions: async (workspaceId, options) => {
      calls.push(`listSessions:${workspaceId}:${String(options?.roots)}`);
      return { items: [older, session] };
    },
    getSession: async (workspaceId, sessionId) => {
      calls.push(`getSession:${workspaceId}:${sessionId}`);
      return { item: session };
    },
    listMemories: async () => {
      calls.push("listMemories");
      return memories;
    },
    saveMemory: async (payload) => {
      calls.push(`saveMemory:${payload.content}:${(payload.tags ?? []).join(",")}`);
      const memory: Memory = { id: `m${nextMemory++}`, content: payload.content, tags: payload.tags ?? null, source: payload.source ?? "user", scope: "local", createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z", contexts: [] };
      memories = [...memories, memory];
      return memory;
    },
    updateMemory: async (memoryId, payload) => {
      calls.push(`updateMemory:${memoryId}:${payload.content ?? ""}`);
      const current = memories.find((memory) => memory.id === memoryId);
      if (!current) throw new Error("not found");
      const memory: Memory = { ...current, ...(payload.content ? { content: payload.content } : {}), updatedAt: "2026-09-28T00:00:00.000Z" };
      memories = memories.map((entry) => (entry.id === memoryId ? memory : entry));
      return memory;
    },
    deleteMemory: async (memoryId) => {
      calls.push(`deleteMemory:${memoryId}`);
      memories = memories.filter((memory) => memory.id !== memoryId);
    },
    listArtifacts: async (workspaceId) => {
      calls.push(`listArtifacts:${workspaceId}`);
      return { items: [{ id: "a1", path: "outbox/Exhibit index.xlsx", updatedAt: 9 }, { id: "a2", name: "Note.docx" }] };
    },
    getConfig: async (workspaceId) => {
      calls.push(`getConfig:${workspaceId}`);
      return { opencode: {}, redrob };
    },
    patchConfig: async (workspaceId, payload) => {
      calls.push(`patchConfig:${workspaceId}`);
      redrob = { ...redrob, ...payload.redrob };
      return { updatedAt: 1 };
    },
    listMcp: async (workspaceId) => {
      calls.push(`listMcp:${workspaceId}`);
      return { items: [{ name: "notion", config: { type: "remote", url: "https://mcp.notion.com/mcp" }, source: "config.project" }] };
    },
  };
  return { client, calls };
}

describe("desk real services", () => {
  test("projects, chats, notes and files come from the client, not previews", async () => {
    const { client, calls } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });

    const projects = await services.projects.list();
    expect(projects).toMatchObject({ preview: false, data: [{ id: "ws_1", name: "Seorin MSA" }] });

    const chats = await services.chats.list();
    expect(chats.preview).toBe(false);
    expect(chats.data.map((chat) => chat.id)).toEqual(["ses_1", "ses_0"]);
    expect(chats.data[0]).toMatchObject({ projectId: "ws_1", updatedAt: 5, mode: "plan", memory: "project" });
    expect((await services.chats.get("ses_1")).data?.title).toBe("Notice by email - valid?");

    const notes = await services.notes.list();
    expect(notes.preview).toBe(false);
    expect(notes.data).toEqual([
      { id: "m1", scope: "you", text: "Call me Jiwoo", when: Date.parse("2026-09-01T00:00:00.000Z"), how: "told" },
      { id: "m2", scope: "project:hanbit", text: "Filings by 17:00", when: Date.parse("2026-09-22T00:00:00.000Z"), how: "learned" },
    ]);

    const files = await services.files.list();
    expect(files).toMatchObject({
      preview: false,
      data: [
        {
          id: "file:.opencode/redrob/outbox/outbox/exhibit index.xlsx",
          name: "Exhibit index.xlsx",
          kind: "sheet",
          icon: "fileSheet",
          projectName: "Seorin MSA",
          when: 9,
          path: ".opencode/redrob/outbox/outbox/Exhibit index.xlsx",
        },
        { id: "a2", name: "Note.docx", kind: "file", icon: "fileText" },
      ],
    });

    expect(calls).toEqual([
      "listWorkspaces",
      "listSessions:ws_1:true",
      "getSession:ws_1:ses_1",
      "listMemories",
      "listArtifacts:ws_1",
      "listWorkspaces",
    ]);
  });

  test("notes add, edit in place and remove go through the memory calls", async () => {
    const { client, calls } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });

    const added = await services.notes.add({ text: "CFO signs off", scope: "project:seorin" });
    expect(added).toMatchObject({ preview: false, data: { id: "m3", scope: "project:seorin", how: "told" } });

    // The note keeps its id, scope and date.
    const edited = await services.notes.edit("m2", "Filings by 16:00");
    expect(edited.data).toMatchObject({ id: "m2", scope: "project:hanbit", text: "Filings by 16:00", how: "learned", when: Date.parse("2026-09-22T00:00:00.000Z") });

    await services.notes.remove("m1");
    expect(calls).toEqual([
      "saveMemory:CFO signs off:desk-scope:project:seorin",
      "updateMemory:m2:Filings by 16:00",
      "deleteMemory:m1",
    ]);
  });

  test("areas without a backend fall back to fixtures with preview true", async () => {
    const { client, calls } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });

    expect((await services.schedules.list()).preview).toBe(true);

    expect((await services.catalog.get()).preview).toBe(true);
    expect(calls).toEqual([]);
  });

  test("privacy is the workspace's own: Standard until set, then what was set", async () => {
    const { client, calls } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    const first = await services.privacy.get();
    expect(first.preview).toBe(false);
    expect(first.data).toMatchObject({ level: "standard", names: [], setBy: null, locked: false });
    await services.privacy.setLevel("strict");
    await services.privacy.setNames(["Kim Minjun"]);
    expect((await services.privacy.get()).data).toMatchObject({ level: "strict", names: ["Kim Minjun"] });
    expect(calls.filter((call) => call.startsWith("patchConfig"))).toEqual(["patchConfig:ws_1", "patchConfig:ws_1"]);
  });

  test("a level set by a team file cannot be changed here", async () => {
    const { client } = fakeClient();
    const services = createRealDeskServices({ client, workspaceId: "ws_1" });
    await client.patchConfig("ws_1", { redrob: { deskPrivacy: { level: "high", names: [], setBy: "Park", locked: true } } });
    expect((await services.privacy.get()).data).toMatchObject({ level: "high", setBy: "Park", locked: true });
    await expect(services.privacy.setLevel("off")).rejects.toThrow();
  });

  test("connectors are the configured servers, real once a client is known", async () => {
    const { client, calls } = fakeClient();
    const services = createRealDeskServices({
      client,
      workspaceId: "ws_1",
      mcpStatus: async () => ({ notion: { status: "connected" } }),
    });
    const connectors = await services.connectors.list();
    expect(connectors.preview).toBe(false);
    expect(connectors.data).toMatchObject([{ id: "notion", name: "Notion", state: "connected", custom: false }]);
    expect(calls).toEqual(["listMcp:ws_1"]);
  });

  test("createDeskServices is real with a client and project, fixtures otherwise", async () => {
    const { client } = fakeClient();
    expect((await createDeskServices({ client, workspaceId: "ws_1" }).projects.list()).preview).toBe(false);
    expect((await createDeskServices({ client, workspaceId: "ws_1" }).catalog.get()).preview).toBe(true);
    expect((await createDeskServices({ client: null, workspaceId: "ws_1" }).projects.list()).preview).toBe(true);
    expect((await createDeskServices({ client, workspaceId: null }).chats.list()).preview).toBe(true);
  });
});
