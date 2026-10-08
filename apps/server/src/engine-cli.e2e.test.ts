import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportEngineSession, importEngineSession } from "./engine-cli.js";
import { rekeyEngineSessionExport, type EngineSessionExport } from "./session-export.js";

/**
 * Against the real engine. Opt in with REDROB_ENGINE_E2E_BIN=/path/to/redrob (the release binary
 * for this platform); CI does not download it, so this is skipped there.
 */
const bin = process.env.REDROB_ENGINE_E2E_BIN?.trim();

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

async function temp(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function engineHome() {
  const root = await temp("redrob-engine-home-");
  return {
    HOME: root,
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_STATE_HOME: join(root, "state"),
    XDG_CACHE_HOME: join(root, "cache"),
    PATH: process.env.PATH,
  };
}

function seed(): EngineSessionExport {
  const ses = "ses_ee36fcaa0ffevmj3LcBiEdo1iR";
  const msg = "msg_11c9035f5001B7YIkut7V4Uo5W";
  return {
    info: {
      id: ses,
      slug: "lease-review",
      projectID: "global",
      directory: "/elsewhere",
      title: "Lease review",
      version: "0.1.0",
      time: { created: 1_791_480_575_000, updated: 1_791_480_575_477 },
    },
    messages: [
      {
        info: {
          id: msg,
          role: "user",
          sessionID: ses,
          time: { created: 1_791_480_575_477 },
          agent: "build",
          model: { providerID: "redrob", modelID: "auto" },
        },
        parts: [{ id: "prt_11c9035f5002AAAAAAAAAAAAAA", type: "text", text: "Read clause 4", messageID: msg, sessionID: ses }],
      },
    ],
  };
}

describe.skipIf(!bin)("engine CLI against the real engine", () => {
  test("a session crosses data dirs, and a rekeyed copy lands beside the original", async () => {
    const env = await engineHome();
    const folder = await temp("redrob-engine-ws-");
    const run = { cwd: folder, bin, env, timeoutMs: 60_000 };

    const first = await importEngineSession(seed(), run);
    expect(first).toBe(seed().info.id);
    const exported = await exportEngineSession(first, run);
    expect(exported.info.directory).toBe(folder);
    expect(exported.messages[0]?.parts[0]).toMatchObject({ type: "text", text: "Read clause 4" });

    const copy = rekeyEngineSessionExport(exported, { title: "Kim Jiwon's continuation" });
    const second = await importEngineSession(copy, run);
    expect(second).toBe(copy.info.id);
    const again = await exportEngineSession(second, run);
    expect(again.info.title).toBe("Kim Jiwon's continuation");
    expect(again.messages.map((message) => message.info.id)).toEqual(copy.messages.map((message) => message.info.id));

    // The original is untouched.
    const original = await exportEngineSession(first, run);
    expect(original.info.title).toBe("Lease review");
    expect(original.messages).toHaveLength(1);
  }, 120_000);
});
