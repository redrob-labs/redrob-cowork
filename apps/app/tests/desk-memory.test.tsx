import { afterEach, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes } from "react-router";
import type { Memory } from "@redrob/types/memory";

import { setLocale } from "../src/i18n";
import { EditNoteDialog, MemoryView } from "../src/react-app/desk/memory/desk-memory";
import {
  canSaveEdit,
  forgetNote,
  invalidateNotes,
  memoryFilterFromParam,
  memoryFilterPath,
  memoryMeta,
  memoryNotesKey,
  memoryScopes,
  memorySections,
  noteSource,
  notesInFilter,
  saveNoteEdit,
  type MemoryActionDeps,
} from "../src/react-app/desk/memory/memory";
import { createFixtureDeskServices } from "../src/react-app/desk/services/fixture-services";
import { NOTES } from "../src/react-app/desk/services/fixtures/notes";
import { PROJECTS } from "../src/react-app/desk/services/fixtures/projects";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";
import type { MemoryNote } from "../src/react-app/desk/services/types";
import { deskRoutes } from "../src/react-app/desk/shell/desk-routes";
import type { ToastAction } from "../src/react-app/desk/store/frame-store";

afterEach(() => setLocale("en"));

function render(node: ReactNode, path = "/memory", client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function text(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]*>/g, " ");
}

const NOW = Date.parse("2026-09-28T12:00:00.000Z");

function memory(id: string, content: string, tags: string[] | null, source = "user"): Memory {
  const at = new Date(NOW).toISOString();
  return { id, content, tags, source, scope: "local", createdAt: at, updatedAt: at, contexts: [] };
}

/** A memory bank in memory, typed against the client the Desk services use. */
function fakeBank() {
  const calls: string[] = [];
  let memories: Memory[] = [
    memory("m1", "Call me Jiwoo", ["desk-scope:you"]),
    memory("m2", "Filings by 17:00", ["desk-scope:project:ws_1"], "agent"),
    memory("m3", "Numbered clauses", ["desk-scope:team"]),
  ];
  let next = 4;
  const unused = async (): Promise<never> => {
    throw new Error("not used");
  };
  const client: DeskServerClient = {
    listWorkspaces: unused,
    listSessions: unused,
    getSession: unused,
    listArtifacts: unused,
    listMcp: unused,
    getConfig: unused,
    patchConfig: unused,
    listMemories: async () => {
      calls.push("list");
      return memories;
    },
    saveMemory: async (draft) => {
      calls.push(`save:${draft.content}:${(draft.tags ?? []).join(",")}`);
      const saved = memory(`m${next++}`, draft.content, draft.tags ?? null, draft.source);
      memories = [...memories, saved];
      return saved;
    },
    updateMemory: async (id, patch) => {
      calls.push(`update:${id}:${patch.content ?? ""}`);
      const current = memories.find((entry) => entry.id === id);
      if (!current) throw new Error("not found");
      const updated = { ...current, ...(patch.content ? { content: patch.content } : {}) };
      memories = memories.map((entry) => (entry.id === id ? updated : entry));
      return updated;
    },
    deleteMemory: async (id) => {
      calls.push(`delete:${id}`);
      memories = memories.filter((entry) => entry.id !== id);
    },
  };
  return { client, calls, contents: () => memories.map((entry) => entry.content) };
}

function recorder(notes: MemoryActionDeps["notes"]) {
  const toasts: Array<{ title: string; text?: string; tone?: string; action?: ToastAction }> = [];
  let invalidated = 0;
  const deps: MemoryActionDeps = {
    notes,
    invalidate: () => {
      invalidated += 1;
    },
    showToast: (title, text, tone, action) => toasts.push({ title, text, tone, action }),
  };
  return { deps, toasts, invalidated: () => invalidated };
}

describe("memory scopes", () => {
  test("the param names a scope; the path goes back to it", () => {
    expect(memoryFilterFromParam(undefined)).toBe("all");
    expect(memoryFilterFromParam("you")).toBe("you");
    expect(memoryFilterFromParam("team")).toBe("team");
    expect(memoryFilterFromParam("seorin")).toBe("project:seorin");
    expect(memoryFilterPath("all")).toBe("/memory");
    expect(memoryFilterPath("you")).toBe("/memory/you");
    expect(memoryFilterPath("project:a b")).toBe("/memory/a%20b");
  });

  test("filtering: all, about you, team and one project", () => {
    expect(notesInFilter(NOTES, "all")).toHaveLength(22);
    expect(notesInFilter(NOTES, "you").map((note) => note.id)).toEqual(["n16", "n17", "n18", "n19", "n20"]);
    expect(notesInFilter(NOTES, "team").map((note) => note.id)).toEqual(["n21", "n22"]);
    expect(notesInFilter(NOTES, "project:hanbit")).toHaveLength(4);
  });

  test("the picker counts each scope, projects with notes only, named from the project list", () => {
    const scopes = memoryScopes(NOTES, PROJECTS);
    expect(scopes.map((scope) => [scope.label, scope.count, scope.href])).toEqual([
      ["All my work", 22, "/memory"],
      ["About you", 5, "/memory/you"],
      ...PROJECTS.filter((project) => NOTES.some((note) => note.scope === `project:${project.id}`)).map((project) => [
        project.name,
        NOTES.filter((note) => note.scope === `project:${project.id}`).length,
        `/memory/${project.id}`,
      ]),
      ["Your team", 2, "/memory/team"],
    ]);
    const project = scopes.find((scope) => scope.id === "project:seorin");
    expect(project?.count).toBe(7);
  });

  test("a project the list does not know still gets a name, never its id", () => {
    const notes: MemoryNote[] = [{ id: "x", scope: "project:ws_9", text: "A", when: NOW, how: "told" }];
    expect(memoryScopes(notes, []).map((scope) => scope.label)).toEqual(["All my work", "About you", "Another project", "Your team"]);
  });

  test("sections: one per scope with notes for all, one for a single scope", () => {
    expect(memorySections(NOTES, "all", PROJECTS).map((section) => section.scope)[0]).toBe("you");
    expect(memorySections(NOTES, "all", PROJECTS).reduce((sum, section) => sum + section.notes.length, 0)).toBe(22);
    const you = memorySections(NOTES, "you", PROJECTS);
    expect(you).toHaveLength(1);
    expect(you[0]?.lede).toBe("How you like to work. Read in every chat, in every project.");
    expect(memorySections([], "team", PROJECTS)).toEqual([]);
  });

  test("where a note came from, and the meta count", () => {
    const note: MemoryNote = { id: "a", scope: "you", text: "A", when: NOW, how: "told" };
    expect(noteSource(note, "How I like drafts", "en")).toBe("You told it in How I like drafts, Sep 28, 2026.");
    expect(noteSource({ ...note, how: "learned" }, null, "en")).toBe("Desk learned it, Sep 28, 2026.");
    expect(noteSource({ ...note, when: Number.NaN }, null, "en")).toBe("You told it.");
    expect(memoryMeta(22)).toBe("22 notes");
    expect(memoryMeta(1)).toBe("1 note");
  });
});

describe("memory actions", () => {
  test("edit changes the note in place, then refreshes the count", async () => {
    const bank = fakeBank();
    const services = createRealDeskServices({ client: bank.client, workspaceId: "ws_1" });
    const note = (await services.notes.list()).data.find((entry) => entry.id === "m2");
    if (!note) throw new Error("no note");
    const { deps, toasts, invalidated } = recorder(services.notes);
    expect(await saveNoteEdit(deps, note, "  Filings by 16:00 ")).toBe(true);
    expect(bank.calls.slice(-2)).toEqual(["list", "update:m2:Filings by 16:00"]);
    expect(bank.contents()).toContain("Filings by 16:00");
    expect(bank.contents()).not.toContain("Filings by 17:00");
    expect(invalidated()).toBe(1);
    expect(toasts.map((toast) => toast.title)).toEqual(["Note saved"]);
  });

  test("edit does nothing for empty, unchanged or locked text", async () => {
    const note: MemoryNote = { id: "a", scope: "you", text: "A", when: NOW, how: "told" };
    expect(canSaveEdit(note, " ")).toBe(false);
    expect(canSaveEdit(note, "A")).toBe(false);
    expect(canSaveEdit(note, "B")).toBe(true);
    expect(canSaveEdit({ ...note, locked: true }, "B")).toBe(false);
    const { deps, invalidated } = recorder(createFixtureDeskServices().notes);
    expect(await saveNoteEdit(deps, note, "A")).toBe(false);
    expect(invalidated()).toBe(0);
  });

  test("forget deletes, toasts with Undo, and Undo saves it back in its scope", async () => {
    const bank = fakeBank();
    const services = createRealDeskServices({ client: bank.client, workspaceId: "ws_1" });
    const note = (await services.notes.list()).data.find((entry) => entry.id === "m1");
    if (!note) throw new Error("no note");
    const { deps, toasts, invalidated } = recorder(services.notes);
    expect(await forgetNote(deps, note)).toBe(true);
    expect(bank.calls).toContain("delete:m1");
    expect(bank.contents()).not.toContain("Call me Jiwoo");
    expect(invalidated()).toBe(1);
    const toast = toasts[0];
    expect(toast?.title).toBe("Forgotten");
    expect(toast?.text).toBe("Call me Jiwoo");
    expect(toast?.action?.label).toBe("Undo");

    toast?.action?.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bank.calls).toContain("save:Call me Jiwoo:desk-scope:you");
    expect(bank.contents()).toContain("Call me Jiwoo");
    expect(invalidated()).toBe(2);
  });

  test("a locked note cannot be forgotten", async () => {
    const services = createFixtureDeskServices();
    const locked = (await services.notes.list()).data.find((note) => note.locked);
    if (!locked) throw new Error("no locked note");
    const { deps, toasts, invalidated } = recorder(services.notes);
    expect(await forgetNote(deps, locked)).toBe(false);
    expect((await services.notes.list()).data).toHaveLength(22);
    expect(toasts).toEqual([]);
    expect(invalidated()).toBe(0);
  });

  test("a failed forget says so and keeps the count", async () => {
    const { deps, toasts, invalidated } = recorder({
      ...createFixtureDeskServices().notes,
      remove: async () => {
        throw new Error("offline");
      },
    });
    expect(await forgetNote(deps, { id: "a", scope: "you", text: "A", when: NOW, how: "told" })).toBe(false);
    expect(toasts.map((toast) => toast.tone)).toEqual(["danger"]);
    expect(invalidated()).toBe(0);
  });

  test("invalidateNotes marks the screen's list and the menu's notes count stale", async () => {
    const client = new QueryClient();
    client.setQueryData(memoryNotesKey("ws_1"), { data: [], preview: false });
    client.setQueryData(["desk-nav", "ws_1", "notes"], 3);
    client.setQueryData(["desk-nav", "ws_1", "privacy"], "high");
    await invalidateNotes(client, "ws_1");
    expect(client.getQueryState(memoryNotesKey("ws_1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(["desk-nav", "ws_1", "notes"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["desk-nav", "ws_1", "privacy"])?.isInvalidated).toBe(false);
  });
});

describe("MemoryView", () => {
  const view = (notes: readonly MemoryNote[], filter: Parameters<typeof memorySections>[1] = "all", preview = false) =>
    render(
      <MemoryView
        filter={filter}
        notes={notes}
        projects={PROJECTS}
        chatTitles={{ style: "How I like drafts" }}
        locale="en"
        preview={preview}
        onEdit={() => {}}
        onForget={() => {}}
      />,
    );

  test("lists the notes with where they came from, the how-it-works line and the scope links", () => {
    const html = view(NOTES);
    expect(html).toContain("Notes are kept on this computer, outside any AI.");
    expect(html).toContain("Call me Jiwoo");
    expect(html).toContain("You told it in How I like drafts,");
    expect(html).toContain('href="/memory/you"');
    expect(html).toContain('aria-current="page" href="/memory"');
    expect(html).toContain("Set by your admin");
    expect(html).toContain("Forget");
  });

  test("shows no tags, ids or JSON, even for real notes", async () => {
    const bank = fakeBank();
    const notes = (await createRealDeskServices({ client: bank.client, workspaceId: "ws_1" }).notes.list()).data;
    const visible = text(view(notes));
    expect(visible).toContain("Filings by 17:00");
    expect(visible).not.toContain("desk-scope");
    expect(visible).not.toContain("ws_1");
    expect(visible).not.toMatch(/[{}[\]]/);
    expect(visible).not.toMatch(/Multi-Model/);
  });

  test("an empty scope says how notes get there", () => {
    const html = view([], "team");
    expect(html).toContain("No notes here yet");
    expect(html).toContain('aria-current="page" href="/memory/team"');
  });

  test("the preview says it is sample notes", () => {
    expect(view(NOTES, "all", true)).toContain("Sample notes");
  });

  test("Korean has the screen's words in Korean", () => {
    setLocale("ko");
    const html = view(NOTES);
    expect(html).toContain("메모는 AI 밖, 이 컴퓨터에 보관됩니다");
    expect(html).toContain("잊기");
    expect(html).toContain("나에 관한 메모");
  });

  test("the edit dialog offers Save only for new text", () => {
    const note = NOTES[15];
    if (!note) throw new Error("no note");
    const same = render(<EditNoteDialog note={note} text={note.text} busy={false} onTextChange={() => {}} onCancel={() => {}} onSave={() => {}} />);
    expect(same).toContain("Edit this note");
    expect(same).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Save/);
    const changed = render(<EditNoteDialog note={note} text="New" busy={false} onTextChange={() => {}} onCancel={() => {}} onSave={() => {}} />);
    expect(changed).not.toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Save/);
  });
});

describe("/memory routes", () => {
  test("render inside the shell with Memory current and the count as meta", () => {
    const routes: Array<[string, Parameters<typeof memoryFilterPath>[0]]> = [
      ["/memory", "all"],
      ["/memory/you", "you"],
    ];
    for (const [path, filter] of routes) {
      const client = new QueryClient();
      client.setQueryData(memoryNotesKey("preview"), { data: NOTES, preview: true });
      const html = render(<Routes>{deskRoutes(<span>chat screen</span>)}</Routes>, path, client);
      expect(html).toContain('<h1 class="rr-shell__title">Memory</h1>');
      expect(html).toContain("22 notes");
      expect(html).toContain('href="/memory" aria-current="page"');
      // The menu marks Memory; the scope picker marks the scope.
      expect(html).toContain(`aria-current="page" href="${memoryFilterPath(filter)}"`);
      expect(html).not.toContain("This part of Redrob Cowork is on its way.");
      expect(html).not.toContain("chat screen");
    }
  });
});
