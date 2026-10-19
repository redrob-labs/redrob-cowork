import { afterEach, describe, expect, test } from "bun:test";

import type { ChatMemory } from "../services/types";
import { moveChatToProject, projectChoices } from "../projects/projects";
import { connectorMenuRow, takeNewChatWorkspace, useNewChatProjectStore } from "./add-menu";

afterEach(() => useNewChatProjectStore.getState().choose(null));

describe("composer Add menu: new chat's project", () => {
  test("send goes to the hero's workspace when no project was picked", () => {
    expect(takeNewChatWorkspace("personal")).toBe("personal");
  });

  test("a picked project gets the new chat, once", () => {
    useNewChatProjectStore.getState().choose({ id: "ws_hello", name: "Hello" });
    expect(takeNewChatWorkspace("personal")).toBe("ws_hello");
    // Taking it clears the pick, so the next new chat starts on the hero's workspace again.
    expect(useNewChatProjectStore.getState().project).toBeNull();
    expect(takeNewChatWorkspace("personal")).toBe("personal");
  });
});

describe("composer Add menu: project choices", () => {
  const rows = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
  ];

  test("marks the project the chat is already in, keeps order", () => {
    expect(projectChoices(rows, "b")).toEqual([
      { id: "a", name: "Alpha", current: false },
      { id: "b", name: "Beta", current: true },
    ]);
  });

  test("nothing is current outside a project", () => {
    expect(projectChoices(rows, null).some((choice) => choice.current)).toBe(false);
  });
});

describe("composer Add menu: moving the open chat", () => {
  function deps(moveSession: () => Promise<unknown>) {
    const calls = { toasts: [] as [string, string | undefined, string | undefined][], paths: [] as string[], memory: [] as [string, ChatMemory][] };
    return {
      calls,
      deps: {
        client: { moveSession: moveSession as never },
        navigate: (path: string) => calls.paths.push(path),
        toast: (title: string, text?: string, tone?: "success" | "danger") => calls.toasts.push([title, text, tone]),
        setMemory: (chatId: string, memory: ChatMemory) => calls.memory.push([chatId, memory]),
      },
    };
  }

  test("moves it, puts its memory on the project, says so and opens it there", async () => {
    let args: unknown[] = [];
    const { deps: d, calls } = deps(async (...received: unknown[]) => {
      args = received;
      return {};
    });
    const moved = await moveChatToProject(d, { chatId: "chat1", workspaceId: "personal", project: { id: "ws_hello", name: "Hello" } });
    expect(moved).toBe(true);
    expect(args).toEqual(["personal", "chat1", "ws_hello"]);
    expect(calls.memory).toEqual([["chat1", "project"]]);
    expect(calls.toasts[0]?.[1]).toContain("Hello");
    expect(calls.paths).toEqual(["/workspace/ws_hello/session/chat1"]);
  });

  test("a failed move leaves the chat where it was and says so", async () => {
    const { deps: d, calls } = deps(async () => {
      throw new Error("nope");
    });
    const moved = await moveChatToProject(d, { chatId: "chat1", workspaceId: "personal", project: { id: "ws_hello", name: "Hello" } });
    expect(moved).toBe(false);
    expect(calls.toasts[0]?.[2]).toBe("danger");
    expect(calls.paths).toEqual([]);
    expect(calls.memory).toEqual([]);
  });

  test("without a server it does nothing but say why", async () => {
    const { deps: d, calls } = deps(async () => ({}));
    const moved = await moveChatToProject({ ...d, client: null }, { chatId: "c", workspaceId: "w", project: { id: "p", name: "P" } });
    expect(moved).toBe(false);
    expect(calls.toasts[0]?.[2]).toBe("danger");
  });
});

describe("composer Add menu: connector rows", () => {
  test("connected and off connectors get a switch", () => {
    expect(connectorMenuRow({ state: "connected" }, false)).toBe("switch");
    expect(connectorMenuRow({ state: "off" }, false)).toBe("switch");
  });

  test("one that needs a sign-in or failed opens the Connectors page", () => {
    expect(connectorMenuRow({ state: "needs-sign-in" }, false)).toBe("open");
    expect(connectorMenuRow({ state: "failed" }, false)).toBe("open");
  });

  test("blocked ones and sample data cannot be changed here", () => {
    expect(connectorMenuRow({ state: "blocked" }, false)).toBe("disabled");
    expect(connectorMenuRow({ state: "connected" }, true)).toBe("disabled");
  });
});
