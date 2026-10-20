import { describe, expect, test } from "bun:test";

import { createdProjectId, createProject } from "./projects";

describe("createdProjectId", () => {
  test("takes the workspace the route answered with", () => {
    expect(createdProjectId({ workspace: { id: "ws_new" }, activeId: "ws_other" }, "C:/Clients/Acme")).toBe("ws_new");
  });
  test("otherwise the list entry on that folder, whatever the slashes or case", () => {
    expect(
      createdProjectId({ workspaces: [{ id: "a", path: "C:/x" }, { id: "b", path: "C:\\Clients\\Acme\\" }] }, "c:\\clients\\acme"),
    ).toBe("b");
  });
  test("then the active id, else nothing", () => {
    expect(createdProjectId({ activeId: "ws_active", workspaces: [] }, "C:/y")).toBe("ws_active");
    expect(createdProjectId({ workspaces: [] }, "C:/y")).toBeNull();
  });
});

describe("createProject with a chosen folder", () => {
  function deps(overrides: Record<string, unknown> = {}) {
    const calls: unknown[] = [];
    const paths: string[] = [];
    return {
      calls,
      paths,
      deps: {
        client: {
          createManagedProject: async (name: string) => {
            calls.push(["managed", name]);
            return { workspace: { id: "ws_managed" } };
          },
          createLocalWorkspace: async (payload: unknown) => {
            calls.push(["local", payload]);
            return { workspace: { id: "ws_folder" } };
          },
          moveSession: async (...args: unknown[]) => void calls.push(["move", ...args]),
          ...overrides,
        } as never,
        navigate: (path: string) => void paths.push(path),
        toast: () => undefined,
        close: () => undefined,
        setMemory: () => undefined,
      },
    };
  }

  test("a chosen folder makes the project on it", async () => {
    const { deps: d, calls, paths } = deps();
    const result = await createProject(d, { name: " Acme ", from: null, folder: "C:/Clients/Acme" });
    expect(result).toEqual({ status: "created", projectId: "ws_folder" });
    expect(calls).toEqual([["local", { folderPath: "C:/Clients/Acme", name: "Acme", preset: "starter" }]]);
    expect(paths).toEqual(["/project/ws_folder"]);
  });

  test("no folder keeps Cowork's own, as before", async () => {
    const { deps: d, calls } = deps();
    const result = await createProject(d, { name: "Acme", from: null, folder: null });
    expect(result).toEqual({ status: "created", projectId: "ws_managed" });
    expect(calls).toEqual([["managed", "Acme"]]);
  });

  test("Save as a project on a chosen folder moves the chat there", async () => {
    const { deps: d, calls } = deps();
    await createProject(d, { name: "Acme", from: { chatId: "c1", workspaceId: "personal" }, folder: "C:/Clients/Acme" });
    expect(calls[1]).toEqual(["move", "personal", "c1", "ws_folder"]);
  });

  test("a folder the server refuses fails without moving anything", async () => {
    const { deps: d, calls } = deps({
      createLocalWorkspace: async () => {
        throw new Error("not allowed");
      },
    });
    const result = await createProject(d, { name: "Acme", from: { chatId: "c1", workspaceId: "personal" }, folder: "C:/x" });
    expect(result).toEqual({ status: "failed" });
    expect(calls).toEqual([]);
  });
});
