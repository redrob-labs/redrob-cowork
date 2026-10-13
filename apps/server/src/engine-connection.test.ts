import { describe, expect, test } from "bun:test";

import {
  clearSharedEngineForConfig,
  isEngineConnectionFailure,
  reportEngineRequestFailure,
  setSharedEngineForConfig,
  sharedEngineForConfig,
} from "./engine-connection.js";
import type { SharedEngineHandle } from "./shared-engine.js";
import type { ServerConfig } from "./types.js";

function fakeEngine(): { handle: SharedEngineHandle; refreshes: () => number; release: () => void } {
  let refreshes = 0;
  let release: () => void = () => undefined;
  const handle: SharedEngineHandle = {
    url: "http://127.0.0.1:4096",
    username: "redrob",
    password: "secret",
    pid: 1,
    execution: { mode: "attached", command: "redrob", args: [], cwd: "", env: [], daemon: { id: "d1", version: "0.6.2", url: "http://127.0.0.1:4096", pid: 1 } },
    identity: "d1",
    isAlive: () => true,
    refresh: () =>
      new Promise<boolean>((resolve) => {
        refreshes += 1;
        release = () => resolve(true);
      }),
    close: async () => undefined,
  };
  return { handle, refreshes: () => refreshes, release: () => release() };
}

describe("engine connection", () => {
  test("classifies transport failures and ignores HTTP-level errors", () => {
    expect(isEngineConnectionFailure(new TypeError("fetch failed"))).toBe(true);
    expect(isEngineConnectionFailure(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }))).toBe(true);
    expect(isEngineConnectionFailure(Object.assign(new Error("x"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }))).toBe(true);
    expect(isEngineConnectionFailure(new Error("Redrob Code rejected the request"))).toBe(false);
    expect(isEngineConnectionFailure("not an error")).toBe(false);
  });

  test("a transport failure refreshes the handle once for concurrent reporters", async () => {
    const config = {} as ServerConfig;
    const engine = fakeEngine();
    setSharedEngineForConfig(config, engine.handle);
    try {
      expect(sharedEngineForConfig(config)).toBe(engine.handle);
      const failure = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } });
      const first = reportEngineRequestFailure(config, failure);
      const second = reportEngineRequestFailure(config, failure);
      expect(second).toBe(first);
      expect(engine.refreshes()).toBe(1);
      engine.release();
      expect(await first).toBe(true);
      // After the refresh settles, the next report starts a new one.
      void reportEngineRequestFailure(config, failure);
      expect(engine.refreshes()).toBe(2);
      engine.release();
    } finally {
      clearSharedEngineForConfig(config);
    }
  });

  test("an application error, or a config without an engine, refreshes nothing", async () => {
    const config = {} as ServerConfig;
    expect(await reportEngineRequestFailure(config, new TypeError("fetch failed"))).toBe(false);
    const engine = fakeEngine();
    setSharedEngineForConfig(config, engine.handle);
    try {
      expect(await reportEngineRequestFailure(config, new Error("502 from the engine"))).toBe(false);
      expect(engine.refreshes()).toBe(0);
    } finally {
      clearSharedEngineForConfig(config);
    }
  });
});
