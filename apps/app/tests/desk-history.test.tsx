import { describe, expect, test } from "bun:test";
import type { Session } from "@redrob-labs/sdk/v2/client";
import { renderToStaticMarkup } from "react-dom/server";

import type { RedrobSessionSnapshot } from "../src/app/lib/redrob-server";
import { formatTook, historyEntryFrom, stepsDone } from "../src/react-app/desk/history/history";
import { HistoryView } from "../src/react-app/desk/preview/desk-history";
import { createRealDeskServices, type DeskServerClient } from "../src/react-app/desk/services/real-services";

const session = (id: string, updated: number, extra: Partial<Session> = {}): Session => ({
  id,
  slug: id,
  projectID: "p",
  directory: "/w",
  title: `Chat ${id}`,
  version: "1",
  time: { created: updated - 185_000, updated },
  ...extra,
});

const todos = (statuses: string[]) => statuses.map((status, index) => ({ content: `Step ${index + 1}`, status, priority: "medium" }));

describe("a chat as a History row", () => {
  test("a run with steps: what it did, how long, and how far it got", () => {
    const entry = historyEntryFrom({
      session: { ...session("s1", 1_000_000), summary: { files: 2 } },
      projectId: "ws_1",
      mode: null,
      snapshot: { todos: todos(["completed", "completed", "in_progress"]), status: { type: "idle" } },
    });
    expect(entry).toMatchObject({ id: "s1", kind: "run", what: "Chat s1", projectId: "ws_1", state: "stopped", label: "Not finished", took: "3m 05s", filesChanged: 2, approvedBy: null });
    expect(entry.steps?.map((step) => step.state)).toEqual(["done", "done", "active"]);
    expect(stepsDone(entry.steps)).toBe("2 of 3 steps");
  });

  test("a chat in Run mode is a run; a busy one is working; a plain one is a chat that is done", () => {
    expect(historyEntryFrom({ session: session("s2", 10_000), projectId: "w", mode: "run" }).kind).toBe("run");
    expect(historyEntryFrom({ session: session("s3", 10_000), projectId: "w", mode: null, snapshot: { todos: [], status: { type: "busy" } } })).toMatchObject({ state: "blocked", label: "Working" });
    expect(historyEntryFrom({ session: session("s4", 10_000), projectId: "w", mode: "plan" })).toMatchObject({ kind: "chat", state: "done", label: "Done" });
  });

  test("took reads like a clock", () => {
    expect(formatTook(48_000)).toBe("48s");
    expect(formatTook(3_725_000)).toBe("1h 02m");
    expect(formatTook(200)).toBeNull();
  });
});

describe("real History", () => {
  test("every project's root chats, newest first, with steps for the latest", async () => {
    const calls: string[] = [];
    const unused = async (): Promise<never> => {
      throw new Error("not used");
    };
    const snapshot = (statuses: string[]): RedrobSessionSnapshot => ({ session: session("x", 0), messages: [], todos: todos(statuses), status: { type: "idle" } });
    const client: DeskServerClient = {
      listWorkspaces: async () => ({
        items: [
          { id: "ws_1", name: "seorin", path: "/a", preset: "starter", workspaceType: "local" },
          { id: "ws_2", name: "hanbit", path: "/b", preset: "starter", workspaceType: "local" },
          { id: "ws_bad", name: "gone", path: "/c", preset: "starter", workspaceType: "local" },
        ],
      }),
      listSessions: async (workspaceId, options) => {
        calls.push(`list:${workspaceId}:${String(options?.roots)}`);
        if (workspaceId === "ws_bad") throw new Error("offline");
        return { items: workspaceId === "ws_1" ? [session("old", 1_000), session("new", 9_000)] : [session("mid", 5_000)] };
      },
      getSessionSnapshot: async (workspaceId, sessionId) => {
        calls.push(`snapshot:${workspaceId}:${sessionId}`);
        return { item: snapshot(sessionId === "new" ? ["completed", "pending"] : []) };
      },
      getSession: unused,
      listMemories: unused,
      saveMemory: unused,
      updateMemory: unused,
      deleteMemory: unused,
      listArtifacts: unused,
      listMcp: unused,
      getConfig: unused,
      patchConfig: unused,
    };
    const result = await createRealDeskServices({ client, workspaceId: "ws_1" }).history.list();
    expect(result.preview).toBe(false);
    expect(result.data.map((entry) => [entry.id, entry.projectId])).toEqual([["new", "ws_1"], ["mid", "ws_2"], ["old", "ws_1"]]);
    expect(result.data[0]).toMatchObject({ kind: "run", state: "stopped" });
    // Only root chats: a check or a variant is a child and stays out.
    expect(calls.filter((call) => call.startsWith("list:"))).toEqual(["list:ws_1:true", "list:ws_2:true", "list:ws_bad:true"]);
  });
});

describe("the History screen", () => {
  test("real entries name the project and leave out who approved", () => {
    const entry = historyEntryFrom({ session: session("s1", Date.UTC(2026, 9, 5, 9)), projectId: "ws_1", mode: "run" });
    const html = renderToStaticMarkup(<HistoryView entries={[entry]} locale="en" preview={false} projectName={() => "Seorin MSA"} />);
    expect(html).toContain("Seorin MSA");
    expect(html).toContain("Chat s1");
    expect(html).not.toContain("On its own");
  });

  test("nothing yet says so", () => {
    expect(renderToStaticMarkup(<HistoryView entries={[]} locale="en" preview={false} />)).toContain("Nothing here yet");
  });
});
