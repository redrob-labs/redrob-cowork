import { describe, expect, test } from "bun:test";

import { deleteChat, deleteProject, nameToSave, renameChat, renameProject } from "./chat-actions";

function recorder() {
  const toasts: [string, string | undefined, string | undefined][] = [];
  return { toasts, toast: (title: string, text?: string, tone?: "success" | "danger") => void toasts.push([title, text, tone]) };
}

describe("nameToSave", () => {
  test("trims and collapses inner whitespace", () => {
    expect(nameToSave("  Q3   board  memo ", "old")).toBe("Q3 board memo");
  });
  test("nothing to save when empty or unchanged", () => {
    expect(nameToSave("   ", "old")).toBeNull();
    expect(nameToSave(" Same ", "Same")).toBeNull();
  });
});

describe("renameChat", () => {
  test("renames in the chat's folder", async () => {
    const calls: unknown[] = [];
    const { toast, toasts } = recorder();
    const ok = await renameChat(
      { rename: async (input) => void calls.push(input), toast },
      { chatId: "c1", value: " New name ", previous: "Old", directory: "C:/Work" },
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([{ chatId: "c1", title: "New name", directory: "C:/Work" }]);
    expect(toasts).toEqual([]);
  });
  test("an unchanged name does not call the engine", async () => {
    let called = false;
    const { toast } = recorder();
    const ok = await renameChat({ rename: async () => void (called = true), toast }, { chatId: "c1", value: "Old", previous: "Old", directory: null });
    expect(ok).toBe(false);
    expect(called).toBe(false);
  });
  test("a failure keeps the old name and says so", async () => {
    const { toast, toasts } = recorder();
    const ok = await renameChat(
      { rename: async () => { throw new Error("x"); }, toast },
      { chatId: "c1", value: "New", previous: "Old", directory: null },
    );
    expect(ok).toBe(false);
    expect(toasts[0]?.[2]).toBe("danger");
  });
});

describe("deleteChat", () => {
  test("deletes it from its project and says so", async () => {
    const calls: unknown[] = [];
    const { toast, toasts } = recorder();
    const ok = await deleteChat({ client: { deleteSession: async (...args: unknown[]) => void calls.push(args) } as never, toast }, { workspaceId: "w", chatId: "c" });
    expect(ok).toBe(true);
    expect(calls).toEqual([["w", "c"]]);
    expect(toasts[0]?.[2]).toBeUndefined();
  });
  test("a failure says so", async () => {
    const { toast, toasts } = recorder();
    const ok = await deleteChat({ client: { deleteSession: async () => { throw new Error("x"); } } as never, toast }, { workspaceId: "w", chatId: "c" });
    expect(ok).toBe(false);
    expect(toasts[0]?.[2]).toBe("danger");
  });
});

describe("renameProject", () => {
  test("saves the new display name", async () => {
    const calls: unknown[] = [];
    const { toast } = recorder();
    const ok = await renameProject(
      { client: { updateWorkspaceDisplayName: async (...args: unknown[]) => void calls.push(args) } as never, toast },
      { projectId: "p", value: "Board", previous: "Old" },
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([["p", "Board"]]);
  });
});

describe("deleteProject", () => {
  test("deletes its chats one by one, then the project, then forgets it", async () => {
    const order: string[] = [];
    const { toast, toasts } = recorder();
    const ok = await deleteProject(
      {
        client: {
          deleteSession: async (_w: string, id: string) => void order.push(`chat:${id}`),
          deleteWorkspace: async (id: string) => void order.push(`project:${id}`),
        } as never,
        forget: async (id) => void order.push(`forget:${id}`),
        toast,
      },
      { projectId: "p", chatIds: ["a", "b"] },
    );
    expect(ok).toBe(true);
    expect(order).toEqual(["chat:a", "chat:b", "project:p", "forget:p"]);
    expect(toasts[0]?.[1]).toContain("still on your computer");
  });

  test("a chat that will not delete keeps the project, so it can be tried again", async () => {
    const order: string[] = [];
    const { toast, toasts } = recorder();
    const ok = await deleteProject(
      {
        client: {
          deleteSession: async (_w: string, id: string) => {
            if (id === "b") throw new Error("x");
            order.push(`chat:${id}`);
          },
          deleteWorkspace: async (id: string) => void order.push(`project:${id}`),
        } as never,
        toast,
      },
      { projectId: "p", chatIds: ["a", "b", "c"] },
    );
    expect(ok).toBe(false);
    expect(order).toEqual(["chat:a"]);
    expect(toasts[0]?.[2]).toBe("danger");
  });
});
