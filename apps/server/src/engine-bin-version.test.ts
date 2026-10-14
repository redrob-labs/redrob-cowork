import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { engineSupportsSharedDaemon, parseEngineVersion } from "./engine-daemon.js";
import { resolveEngineBin } from "./shared-engine.js";

describe("engineSupportsSharedDaemon", () => {
  test("accepts engines from 0.6.0 on", async () => {
    expect(await engineSupportsSharedDaemon("x", async () => "0.6.0\n")).toBe(true);
    expect(await engineSupportsSharedDaemon("x", async () => "redrob 0.6.3")).toBe(true);
    expect(await engineSupportsSharedDaemon("x", async () => "1.0.0")).toBe(true);
  });

  test("rejects engines older than 0.6.0 and unreadable versions", async () => {
    expect(await engineSupportsSharedDaemon("x", async () => "0.5.1")).toBe(false);
    expect(await engineSupportsSharedDaemon("x", async () => "0.5.29")).toBe(false);
    expect(await engineSupportsSharedDaemon("x", async () => "")).toBe(false);
    expect(await engineSupportsSharedDaemon("x", async () => undefined)).toBe(false);
    expect(await engineSupportsSharedDaemon("x", async () => "dev")).toBe(false);
  });

  test("parseEngineVersion reads the first x.y.z", () => {
    expect(parseEngineVersion("0.6.2")).toEqual([0, 6, 2]);
    expect(parseEngineVersion("nope")).toBeUndefined();
  });
});

describe("resolveEngineBin", () => {
  async function withHomeRedrob(run: (home: string, bin: string) => Promise<void>): Promise<void> {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "cowork-engine-bin-"));
    const bin = path.join(home, ".redrob", "bin", "redrob");
    await fs.mkdir(path.dirname(bin), { recursive: true });
    await fs.writeFile(bin, "");
    try {
      await run(home, bin);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  }

  test("an old user install loses to the bundled engine", async () => {
    await withHomeRedrob(async (home, bin) => {
      const warnings: string[] = [];
      const probed: string[] = [];
      const chosen = await resolveEngineBin({
        bundledBin: "/bundle/redrob",
        env: { PATH: "" },
        homedir: home,
        probe: async (candidate) => {
          probed.push(candidate);
          return "0.5.1";
        },
        logger: { log: (level, message) => void (level === "warn" && warnings.push(message)) },
      });
      expect(probed).toEqual([bin]);
      expect(chosen).toBe("/bundle/redrob");
      expect(warnings).toHaveLength(1);
    });
  });

  test("a current user install is kept so one daemon serves every app", async () => {
    await withHomeRedrob(async (home, bin) => {
      const chosen = await resolveEngineBin({
        bundledBin: "/bundle/redrob",
        env: { PATH: "" },
        homedir: home,
        probe: async () => "0.6.3",
      });
      expect(chosen).toBe(bin);
    });
  });

  test("without a bundled engine the user install is used as-is", async () => {
    await withHomeRedrob(async (home, bin) => {
      const chosen = await resolveEngineBin({ env: { PATH: "" }, homedir: home, probe: async () => "0.5.1" });
      expect(chosen).toBe(bin);
    });
  });

  test("an explicit binary is never second-guessed", async () => {
    const chosen = await resolveEngineBin({ explicit: "/custom/redrob", bundledBin: "/bundle/redrob", env: {}, probe: async () => "0.1.0" });
    expect(chosen).toBe("/custom/redrob");
  });
});
