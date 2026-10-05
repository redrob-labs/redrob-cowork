import { describe, expect, test } from "bun:test";

import { createPersonalWorkspaceEnsurer, type PersonalWorkspaceClient } from "../src/react-app/desk/shell/personal-workspace";

function fakeClient(fail = false) {
  const client = {
    calls: 0,
    ensurePersonalWorkspace: () => {
      client.calls += 1;
      return fail
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ activeId: "ws_1", workspace: { id: "ws_personal" }, workspaces: [], persisted: true });
    },
  };
  return client;
}

function asClient(client: ReturnType<typeof fakeClient>): PersonalWorkspaceClient {
  return { ensurePersonalWorkspace: client.ensurePersonalWorkspace };
}

describe("ensure the Personal workspace once", () => {
  test("waits for a client, then calls the server exactly once per app session", () => {
    const ensure = createPersonalWorkspaceEnsurer();
    const first = fakeClient();
    const second = fakeClient();

    ensure(null);
    expect(first.calls).toBe(0);

    ensure(asClient(first));
    ensure(asClient(first));
    ensure(asClient(second));

    expect(first.calls).toBe(1);
    expect(second.calls).toBe(0);
  });

  test("a failed call is silent and is not retried", async () => {
    const ensure = createPersonalWorkspaceEnsurer();
    const client = fakeClient(true);

    expect(() => ensure(asClient(client))).not.toThrow();
    await Promise.resolve();
    ensure(asClient(client));

    expect(client.calls).toBe(1);
  });
});
