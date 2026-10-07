import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes } from "react-router";
import type { Session } from "@redrob-labs/sdk/v2/client";

import type { RedrobWorkspaceInfo } from "../src/app/lib/redrob-server";
import { FolderAsk, ProjectView, ProjectsView, type ProjectViewProps } from "../src/react-app/desk/projects/desk-projects";
import {
  allowProjectFolder,
  createFolderAskStore,
  folderAskView,
  type FolderAskView,
} from "../src/react-app/desk/projects/folder-ask";
import { ProjectDialogView, SaveAsProjectButton, type ProjectDialogViewProps } from "../src/react-app/desk/projects/project-dialog";
import {
  createProject,
  folderBaseName,
  loadProjectDetail,
  loadProjectRows,
  nameFromChatTitle,
  offersSaveAsProject,
  projectChatPath,
  sortByLastActive,
  type CreateProjectDeps,
  type ProjectDetail,
  type ProjectsClient,
} from "../src/react-app/desk/projects/projects";
import { CHATS } from "../src/react-app/desk/services/fixtures/chats";
import type { ChatMemory } from "../src/react-app/desk/services/types";
import { DeskLayerView } from "../src/react-app/desk/shell/desk-layer";
import { deskRoutes } from "../src/react-app/desk/shell/desk-routes";
import { createFrameStore } from "../src/react-app/desk/store/frame-store";

function render(node: ReactNode, path = "/projects") {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const workspace = (id: string, patch: Partial<RedrobWorkspaceInfo> = {}): RedrobWorkspaceInfo => ({
  id,
  name: id,
  path: `/data/${id}`,
  preset: "starter",
  workspaceType: "local",
  ...patch,
});

const session = (id: string, updated: number, title = id): Session => ({
  id,
  slug: id,
  projectID: "p",
  directory: "/w",
  title,
  version: "1",
  time: { created: 1, updated },
});

type FakeOptions = {
  workspaces?: RedrobWorkspaceInfo[];
  sessions?: Record<string, Session[]>;
  folders?: Record<string, string[]>;
  failCreate?: boolean;
  failMove?: boolean;
};

function fakeClient(options: FakeOptions = {}) {
  const calls: string[] = [];
  const folders = { ...options.folders };
  const client: ProjectsClient = {
    listWorkspaces: async () => {
      calls.push("listWorkspaces");
      return { items: options.workspaces ?? [] };
    },
    listSessions: async (workspaceId) => {
      calls.push(`listSessions:${workspaceId}`);
      return { items: options.sessions?.[workspaceId] ?? [] };
    },
    listArtifacts: async (workspaceId) => {
      calls.push(`listArtifacts:${workspaceId}`);
      return { items: [{ id: "a1" }, { id: "a2" }] };
    },
    listAuthorizedFolders: async (workspaceId) => {
      calls.push(`listAuthorizedFolders:${workspaceId}`);
      return { folders: folders[workspaceId] ?? [], hiddenCount: 0, workspaceRoot: `/data/${workspaceId}` };
    },
    setAuthorizedFolders: async (workspaceId, next) => {
      calls.push(`setAuthorizedFolders:${workspaceId}:${next.join("|")}`);
      folders[workspaceId] = next;
      return { folders: next, hiddenCount: 0, updatedAt: 1 };
    },
    createManagedProject: async (name) => {
      calls.push(`createManagedProject:${name}`);
      if (options.failCreate) throw new Error("down");
      const created = workspace("ws_new", { name, kind: "managed" });
      return { activeId: "ws_1", workspace: created, workspaces: [created], persisted: true };
    },
    moveSession: async (workspaceId, sessionId, targetWorkspaceId) => {
      calls.push(`moveSession:${workspaceId}:${sessionId}:${targetWorkspaceId}`);
      if (options.failMove) throw new Error("engine refused");
      return { ok: true, session: { id: sessionId, workspaceId: targetWorkspaceId } };
    },
  };
  return { client, calls };
}

describe("projects list", () => {
  test("leaves out Personal and puts the most recently active first", async () => {
    const { client, calls } = fakeClient({
      workspaces: [
        workspace("ws_quiet", { displayName: "Quiet" }),
        workspace("personal", { kind: "personal" }),
        workspace("ws_a", { name: "Acme" }),
        workspace("ws_b", { name: "Busy", kind: "managed" }),
      ],
      sessions: { ws_a: [session("a1", 5), session("a2", 3)], ws_b: [session("b1", 9)], personal: [session("p1", 99)] },
    });

    const { data, preview } = await loadProjectRows(client);

    expect(preview).toBe(false);
    expect(data.map((row) => row.id)).toEqual(["ws_b", "ws_a", "ws_quiet"]);
    expect(data.map((row) => [row.name, row.chatCount, row.lastActiveAt, row.managed])).toEqual([
      ["Busy", 1, 9, true],
      ["Acme", 2, 5, false],
      ["Quiet", 0, null, false],
    ]);
    expect(calls).not.toContain("listSessions:personal");
  });

  test("a project whose chats cannot be read still lists, without counts", async () => {
    const { client } = fakeClient({ workspaces: [workspace("ws_a")] });
    const failing: ProjectsClient = { ...client, listSessions: async () => Promise.reject(new Error("offline")) };

    const { data } = await loadProjectRows(failing);

    expect(data).toMatchObject([{ id: "ws_a", chatCount: null, lastActiveAt: null }]);
  });

  test("sample projects without a server, in the order their chats were last active", async () => {
    const { data, preview } = await loadProjectRows(null);

    expect(preview).toBe(true);
    expect(data.map((row) => row.id)).toEqual(["seorin", "hanbit", "supplier", "nara", "clauses"]);
    expect(data[0]?.chatCount).toBe(CHATS.filter((chat) => chat.projectId === "seorin").length);
    expect(data.find((row) => row.id === "clauses")?.lastActiveAt).toBeNull();
  });

  test("sorting keeps projects with no activity in their order, at the end", () => {
    const rows = [{ id: "a", lastActiveAt: null }, { id: "b", lastActiveAt: 2 }, { id: "c", lastActiveAt: null }, { id: "d", lastActiveAt: 7 }];
    expect(sortByLastActive(rows).map((row) => row.id)).toEqual(["d", "b", "a", "c"]);
  });

  test("each row opens its project, with its name, one line, counts and when", () => {
    const html = render(
      <ProjectsView
        now={10}
        locale="en"
        projects={[
          { id: "ws b", name: "Busy", about: null, chatCount: 2, fileCount: 1, lastActiveAt: 9, managed: true },
          { id: "ws_a", name: "Acme", about: "For the lead investor", chatCount: null, fileCount: null, lastActiveAt: null, managed: false },
        ]}
      />,
    );

    expect(html).toContain('href="/project/ws%20b"');
    expect(html).toContain("<b>Busy</b>");
    expect(html).toContain("Add files, or start a chat here");
    expect(html).toContain("2 chats");
    expect(html).toContain("1 file<");
    expect(html).toContain("For the lead investor");
    expect(html).toContain("A project keeps the files");
  });

  test("no projects says how to start one", () => {
    const html = render(<ProjectsView projects={[]} now={0} locale="en" />);
    expect(html).toContain("rr-empty");
    expect(html).toContain("No projects yet");
  });

  test("/projects and /project/:id are the Projects screens now, not placeholders", () => {
    const projects = render(<Routes>{deskRoutes(<span>chat</span>)}</Routes>, "/projects");
    expect(projects).toContain('<h1 class="rr-shell__title">Projects</h1>');
    expect(projects).toContain("New project");
    expect(projects).not.toContain("is on its way");
    expect(projects).toContain('href="/projects" aria-current="page"');

    const project = render(<Routes>{deskRoutes(<span>chat</span>)}</Routes>, "/project/seorin");
    expect(project).toContain('<h1 class="rr-shell__title">Project</h1>');
    expect(project).not.toContain("is on its way");
    expect(project).toContain('href="/projects" aria-current="page"');
  });
});

describe("one project", () => {
  test("reads its chats, files and folders without opening it", async () => {
    const { client, calls } = fakeClient({
      workspaces: [workspace("ws_m", { name: "Acme", kind: "managed", path: "C:\\data\\projects\\acme" })],
      sessions: { ws_m: [session("old", 2, "Older"), session("new", 8, "Newer")] },
    });

    const { data } = await loadProjectDetail(client, "ws_m");

    expect(data?.project).toMatchObject({ id: "ws_m", name: "Acme", managed: true, chatCount: 2, fileCount: 2, lastActiveAt: 8 });
    expect(data?.chats.map((chat) => chat.title)).toEqual(["Newer", "Older"]);
    expect(data?.folders).toEqual([]);
    expect(data?.folderName).toBe("acme");
    expect(calls).toEqual(["listWorkspaces", "listSessions:ws_m", "listArtifacts:ws_m", "listAuthorizedFolders:ws_m"]);
    expect(calls.some((call) => call.startsWith("activate"))).toBe(false);
  });

  test("a project with a folder of the person's has nothing to ask", async () => {
    const { client, calls } = fakeClient({ workspaces: [workspace("ws_a")] });
    const { data } = await loadProjectDetail(client, "ws_a");
    expect(data?.folders).toBeNull();
    expect(calls).not.toContain("listAuthorizedFolders:ws_a");
  });

  test("an unknown project is null, with or without a server", async () => {
    expect((await loadProjectDetail(fakeClient().client, "nope")).data).toBeNull();
    expect((await loadProjectDetail(null, "nope")).data).toBeNull();
    expect((await loadProjectDetail(null, "seorin")).data?.chats[0]?.id).toBe("notice");
  });

  const detail: ProjectDetail = {
    project: { id: "ws_m", name: "Acme", about: null, chatCount: 1, fileCount: 3, lastActiveAt: 5, managed: true },
    chats: [{ id: "ses 1", title: "Notice by email", updatedAt: 5 }],
    folders: [],
    folderName: "acme",
  };
  const view = (patch: Partial<ProjectViewProps> = {}, folder: FolderAskView = { kind: "ask" }) =>
    render(
      <ProjectView
        detail={detail}
        now={10}
        locale="en"
        onShowFiles={null}
        folderAsk={{ view: folder, busy: false, onAllow: () => {}, onNotNow: () => {} }}
        {...patch}
      />,
      "/project/ws_m",
    );

  test("its chats open in the project, and New chat starts one there", () => {
    const html = view();
    expect(html).toContain(`href="${projectChatPath("ws_m", "ses 1")}"`);
    expect(html).toContain('href="/workspace/ws_m/session/ses%201"');
    expect(html).toContain('href="/workspace/ws_m/session"');
    expect(html).toContain("New chat in this project");
    expect(html).toContain("Notice by email");
    expect(html).toContain("3 files in this project");
    expect(html).not.toContain("Show files");
    expect(view({ onShowFiles: () => {} })).toContain("Show files");
  });

  test("the folder ask, the alert after Allow, and nothing after Not now", () => {
    const ask = view();
    expect(ask).toContain("rr-approval");
    expect(ask).toContain("Let Desk use a folder for Acme?");
    expect(ask).toContain("in a folder called acme on this computer");
    expect(ask).toContain("asks before deleting any");
    expect(ask).toContain(">Allow<");
    expect(ask).toContain(">Not now<");
    expect(ask).not.toMatch(/[A-Z]:\\|\/data\//);

    const allowed = view({}, { kind: "allowed", folder: "Contracts" });
    expect(allowed).not.toContain("rr-approval");
    expect(allowed).toContain("rr-alert");
    expect(allowed).toContain("Desk can use the Contracts folder");

    const hidden = view({}, { kind: "none" });
    expect(hidden).not.toContain("rr-approval");
    expect(hidden).not.toContain("rr-alert");
  });

  test("a busy ask does not answer twice", () => {
    let answered = 0;
    const html = render(
      <FolderAsk view={{ kind: "ask" }} projectName="Acme" folderName="acme" busy onAllow={() => answered++} onNotNow={() => answered++} />,
    );
    expect(html).toContain("rr-approval");
    expect(answered).toBe(0);
  });
});

describe("folder ask", () => {
  test("asks only in a project whose folder Desk made, until a folder or a Not now", () => {
    expect(folderAskView({ managed: true, folders: [], answer: undefined })).toEqual({ kind: "ask" });
    expect(folderAskView({ managed: false, folders: [], answer: undefined })).toEqual({ kind: "none" });
    expect(folderAskView({ managed: true, folders: null, answer: undefined })).toEqual({ kind: "none" });
    expect(folderAskView({ managed: true, folders: ["C:\\x"], answer: undefined })).toEqual({ kind: "none" });
    expect(folderAskView({ managed: true, folders: [], answer: { kind: "not-now" } })).toEqual({ kind: "none" });
    expect(folderAskView({ managed: true, folders: ["C:\\x"], answer: { kind: "allowed", folder: "x" } })).toEqual({
      kind: "allowed",
      folder: "x",
    });
  });

  test("Not now hides it for this visit; the next time Desk needs the folder it asks again", () => {
    const store = createFolderAskStore();
    store.getState().notNow("ws_m");
    expect(store.getState().answers.ws_m).toEqual({ kind: "not-now" });
    expect(folderAskView({ managed: true, folders: [], answer: store.getState().answers.ws_m }).kind).toBe("none");

    store.getState().needFolder("ws_m");
    expect(store.getState().answers.ws_m).toBeUndefined();
    expect(folderAskView({ managed: true, folders: [], answer: store.getState().answers.ws_m }).kind).toBe("ask");
  });

  test("Allow picks a folder and adds it to the ones the project had", async () => {
    const { client, calls } = fakeClient({ folders: { ws_m: ["D:\\Old"] } });
    const picks: string[] = [];

    const folder = await allowProjectFolder(
      {
        client,
        pick: async () => {
          picks.push("pick");
          return "C:\\Users\\me\\Contracts";
        },
      },
      "ws_m",
    );

    expect(folder).toBe("Contracts");
    expect(picks).toEqual(["pick"]);
    expect(calls).toEqual(["listAuthorizedFolders:ws_m", "setAuthorizedFolders:ws_m:D:\\Old|C:\\Users\\me\\Contracts"]);

    const store = createFolderAskStore();
    store.getState().allowed("ws_m", folder ?? "");
    expect(folderAskView({ managed: true, folders: ["C:\\Users\\me\\Contracts"], answer: store.getState().answers.ws_m })).toEqual({
      kind: "allowed",
      folder: "Contracts",
    });
  });

  test("closing the picker changes nothing; a folder already there is not added twice", async () => {
    const { client, calls } = fakeClient({ folders: { ws_m: ["/home/me/acme"] } });
    expect(await allowProjectFolder({ client, pick: async () => null }, "ws_m")).toBeNull();
    expect(calls).toEqual([]);

    expect(await allowProjectFolder({ client, pick: async () => "/home/me/acme" }, "ws_m")).toBe("acme");
    expect(calls).toEqual(["listAuthorizedFolders:ws_m", "setAuthorizedFolders:ws_m:/home/me/acme"]);
  });

  test("folder names, never paths", () => {
    expect(folderBaseName("C:\\Users\\me\\Contracts\\")).toBe("Contracts");
    expect(folderBaseName("/home/me/acme")).toBe("acme");
  });
});

function deps(client: CreateProjectDeps["client"]) {
  const events: string[] = [];
  const memory: Array<[string, ChatMemory]> = [];
  const value: CreateProjectDeps = {
    client,
    navigate: (path) => events.push(`navigate:${path}`),
    toast: (title, text, tone) => events.push(`toast:${tone ?? "success"}:${title}:${text ?? ""}`),
    close: () => events.push("close"),
    setMemory: (chatId, next) => memory.push([chatId, next]),
  };
  return { deps: value, events, memory };
}

describe("new project and save as a project", () => {
  test("an empty name keeps the dialog open with the error, and calls nothing", async () => {
    const { client, calls } = fakeClient();
    const { deps: input, events } = deps(client);

    const result = await createProject(input, { name: "   ", from: null });

    expect(result).toEqual({ status: "invalid", error: "Give it a name, like the client or the matter." });
    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  test("Create makes the project, says so and opens it", async () => {
    const { client, calls } = fakeClient();
    const { deps: input, events, memory } = deps(client);

    const result = await createProject(input, { name: "  Hansol supply agreement ", from: null });

    expect(result).toEqual({ status: "created", projectId: "ws_new" });
    expect(calls).toEqual(["createManagedProject:Hansol supply agreement"]);
    expect(events).toEqual([
      "close",
      "toast:success:Project created:Hansol supply agreement is ready.",
      "navigate:/project/ws_new",
    ]);
    expect(memory).toEqual([]);
  });

  test("Save moves the chat from its workspace into the new project, with memory on the project", async () => {
    const { client, calls } = fakeClient();
    const { deps: input, events, memory } = deps(client);

    const result = await createProject(input, { name: "Notice", from: { chatId: "ses_1", workspaceId: "personal" } });

    expect(result).toEqual({ status: "created", projectId: "ws_new" });
    expect(calls).toEqual(["createManagedProject:Notice", "moveSession:personal:ses_1:ws_new"]);
    expect(memory).toEqual([["ses_1", "project"]]);
    expect(events).toEqual(["close", "toast:success:Project created:The chat moved into Notice.", "navigate:/project/ws_new"]);
  });

  test("if the chat cannot move, the project stays, the chat stays put and Desk says so plainly", async () => {
    const { client, calls } = fakeClient({ failMove: true });
    const { deps: input, events, memory } = deps(client);

    const result = await createProject(input, { name: "Notice", from: { chatId: "ses_1", workspaceId: "personal" } });

    expect(result).toEqual({ status: "not-moved", projectId: "ws_new" });
    expect(calls).toEqual(["createManagedProject:Notice", "moveSession:personal:ses_1:ws_new"]);
    expect(memory).toEqual([]);
    expect(events).toEqual(["close", "toast:danger:The chat did not move:Notice is ready, but the chat stayed where it was."]);
  });

  test("if the project cannot be made, the dialog stays open", async () => {
    const { client } = fakeClient({ failCreate: true });
    const { deps: input, events } = deps(client);
    expect(await createProject(input, { name: "Acme", from: null })).toEqual({ status: "failed" });
    expect(events).toEqual(["toast:danger:Desk could not create the project:Try again in a moment."]);

    const offline = deps(null);
    expect(await createProject(offline.deps, { name: "Acme", from: null })).toEqual({ status: "failed" });
    expect(offline.events).toEqual(["toast:danger:Desk is not connected yet:Open a chat first, then try again."]);
  });

  test("the chat's title fills in the name, without a trailing ...", () => {
    expect(nameFromChatTitle("Draft v3 against our sta...")).toBe("Draft v3 against our sta");
    expect(nameFromChatTitle("Draft v3 against our sta\u2026 ")).toBe("Draft v3 against our sta");
    expect(nameFromChatTitle("Notice by email - valid?")).toBe("Notice by email - valid?");
  });

  const dialog = (patch: Partial<ProjectDialogViewProps>) =>
    render(
      <ProjectDialogView
        saving={false}
        name=""
        error={null}
        busy={false}
        onNameChange={() => {}}
        onCancel={() => {}}
        onSubmit={() => {}}
        {...patch}
      />,
    );

  test("New project asks only for a name, with Cancel and Create", () => {
    const html = dialog({});
    expect(html).toContain("New project");
    expect(html).toContain("A project keeps the files and the memory");
    expect(html).toContain(">Name<");
    expect(html).toContain('placeholder="Hansol supply agreement"');
    expect(html).toContain(">Cancel<");
    expect(html).toContain(">Create<");
    expect(html).not.toContain("Give it a name");
  });

  test("Save as a project has the name filled in, says the chat moves, and shows the error", () => {
    const html = dialog({ saving: true, name: "Notice by email", error: "Give it a name, like the client or the matter." });
    expect(html).toContain("Save as a project");
    expect(html).toContain("The chat moves into the project");
    expect(html).toContain('value="Notice by email"');
    expect(html).toContain(">Save<");
    expect(html).toContain("Give it a name, like the client or the matter.");
  });

  test("the frame renders the project dialog it is asked for", () => {
    const html = render(
      <DeskLayerView modal={{ kind: "project", chatId: null }} toast={null} mac={false} onCloseModal={() => {}} onCloseToast={() => {}} />,
    );
    expect(html).toContain("desk-dialog");
    expect(html).toContain("New project");
  });

  test("Save as a project is offered only for a chat in Personal", () => {
    expect(offersSaveAsProject({ chatId: "ses_1", workspace: { kind: "personal" } })).toBe(true);
    expect(offersSaveAsProject({ chatId: "ses_1", workspace: { kind: "managed" } })).toBe(false);
    expect(offersSaveAsProject({ chatId: "ses_1", workspace: {} })).toBe(false);
    expect(offersSaveAsProject({ chatId: null, workspace: { kind: "personal" } })).toBe(false);
    expect(offersSaveAsProject({ chatId: "ses_1", workspace: null })).toBe(false);
    expect(render(<SaveAsProjectButton onClick={() => {}} />)).toContain("Save as a project");
  });

  test("a toast can say something went wrong", () => {
    const store = createFrameStore({ storage: () => null });
    store.getState().showToast("Done", "Text");
    expect(store.getState().toast).toEqual({ id: 1, title: "Done", text: "Text" });
    store.getState().showToast("Failed", undefined, "danger");
    expect(store.getState().toast).toEqual({ id: 2, title: "Failed", tone: "danger" });
    store.getState().hideToast();
  });
});
