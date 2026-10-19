import { describe, expect, test } from "bun:test";

import { createCheckStore, readKeptChecks, settleChecks, startChecks } from "../src/react-app/cowork/thread/check-store";

// The check store: one pending run per session, checks that start and settle, and settled chips
// kept on the device without the person's question.

const memory = () => {
  const data = new Map<string, string>();
  return { data, storage: () => ({ getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }) };
};

describe("check store", () => {
  test("pending is taken once; checks run, then settle", () => {
    const store = createCheckStore({ storage: () => null });
    store.getState().expect("s1", { question: "Q", planned: true });
    expect(store.getState().take("s1")).toEqual({ question: "Q", planned: true });
    expect(store.getState().take("s1")).toBeNull();

    store.getState().start("m1", { planned: true, fact: true, challenge: false });
    expect(store.getState().answers.m1).toEqual({ planned: true, fact: "running", challenge: "off" });
    store.getState().settle("m1", { fact: { claims: [], missed: [] } });
    expect(store.getState().answers.m1).toMatchObject({ fact: "done", challenge: "off" });

    const running = startChecks({ planned: false, fact: true, challenge: true });
    expect(settleChecks(running, null)).toEqual({ planned: false, fact: "failed", challenge: "failed" });
    store.getState().settle("unknown", null);
    expect(store.getState().answers.unknown).toBeUndefined();
  });

  test("a settled result is read back by a fresh store without its retry request; a running one is not kept", () => {
    const { data, storage } = memory();
    const first = createCheckStore({ storage });
    const request = { sessionId: "s1", question: "Can we end the MSA by email?", planned: false };
    first.getState().start("m1", { planned: false, fact: true, challenge: true, request });
    first.getState().start("m2", { planned: false, fact: true, challenge: false });
    first.getState().settle("m1", { fact: { claims: [], missed: [] } });
    expect([...data.values()].join("")).not.toContain("Can we end the MSA");
    const reopened = createCheckStore({ storage });
    expect(reopened.getState().answers.m1).toEqual({ planned: false, fact: "done", challenge: "failed", result: { fact: { claims: [], missed: [] } } });
    expect(reopened.getState().answers.m2).toBeUndefined();
  });

  test("unreadable storage is ignored", () => {
    const storage = () => ({ getItem: () => "{not json", setItem: () => {} });
    expect(createCheckStore({ storage }).getState().answers).toEqual({});
    expect(readKeptChecks(() => null)).toEqual({});
  });
});
