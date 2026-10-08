import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EngineCliError,
  engineCliEnv,
  exportEngineSession,
  importEngineSession,
  runEngineCli,
  setEngineCliTemplate,
} from "./engine-cli.js";
import { engineId, isEngineId } from "./engine-ids.js";
import {
  SessionExportError,
  engineVersionCompatibility,
  parseEngineExportOutput,
  parseEngineImportOutput,
  readEngineSessionExport,
  rekeyEngineSessionExport,
  type EngineSessionExport,
} from "./session-export.js";

const dirs: string[] = [];
afterEach(async () => {
  setEngineCliTemplate(null);
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

async function temp(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function sample(): EngineSessionExport {
  const ses = "ses_ee36fcaa0ffevmj3LcBiEdo1iR";
  const user = "msg_11c9035f5001B7YIkut7V4Uo5W";
  const reply = "msg_11c9035f6001B7YIkut7V4Uo5X";
  return {
    info: { id: ses, title: "Lease review", version: "0.1.0", directory: "/a", projectID: "global", share: { url: "x" } },
    messages: [
      {
        info: { id: user, role: "user", sessionID: ses },
        parts: [{ id: "prt_11c9035f5002AAAAAAAAAAAAAA", type: "text", text: "Read clause 4", messageID: user, sessionID: ses }],
      },
      {
        info: { id: reply, role: "assistant", sessionID: ses, parentID: user },
        parts: [
          { id: "prt_11c9035f6002AAAAAAAAAAAAAA", type: "text", text: "Done", messageID: reply, sessionID: ses },
          { id: "prt_11c9035f6003AAAAAAAAAAAAAA", type: "tool", tool: "read", messageID: reply, sessionID: ses },
        ],
      },
    ],
  };
}

/**
 * A stand-in for `redrob` that keeps sessions as JSON files under $XDG_DATA_HOME/fake, and
 * records the directory it was run in: enough to prove the CLI gets the engine's env and cwd.
 */
async function fakeEngine(): Promise<string> {
  const dir = await temp("redrob-fake-engine-");
  const bin = join(dir, "redrob");
  await writeFile(
    bin,
    `#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const store = path.join(process.env.XDG_DATA_HOME || "/nonexistent", "fake");
fs.mkdirSync(store, { recursive: true });
const [command, arg] = process.argv.slice(2);
if (process.env.REDROB_SERVER_PASSWORD) { console.error("password leaked"); process.exit(9); }
if (command === "export") {
  process.stderr.write("Exporting session: " + arg + "\\n");
  const file = path.join(store, arg + ".json");
  if (!fs.existsSync(file)) { console.error("Session not found: " + arg); process.exit(1); }
  process.stdout.write(fs.readFileSync(file, "utf8") + "\\n");
} else if (command === "import") {
  const data = JSON.parse(fs.readFileSync(arg, "utf8"));
  data.info.directory = process.cwd();
  fs.writeFileSync(path.join(store, data.info.id + ".json"), JSON.stringify(data, null, 2));
  process.stdout.write("Imported session: " + data.info.id + "\\n");
} else if (command === "sleep") {
  setTimeout(() => {}, 60000);
} else {
  process.exit(2);
}
`,
  );
  await chmod(bin, 0o755);
  return bin;
}

describe("engine ids", () => {
  test("match the engine's shape and direction", () => {
    const a = engineId("msg", "ascending", 1_000);
    const b = engineId("msg", "ascending", 1_000);
    expect(isEngineId(a, "msg")).toBe(true);
    expect(a.slice(0, 16) < b.slice(0, 16)).toBe(true);
    const older = engineId("ses", "descending", 1_000);
    const newer = engineId("ses", "descending", 2_000);
    expect(newer.slice(0, 16) < older.slice(0, 16)).toBe(true);
    expect(isEngineId("ses_ee36fcaa0ffevmj3LcBiEdo1iR", "ses")).toBe(true);
    expect(isEngineId("ses_short", "ses")).toBe(false);
  });
});

describe("session exports", () => {
  test("a part or message from another session is refused", () => {
    const bad = sample();
    bad.messages[1]!.parts[0]!.messageID = bad.messages[0]!.info.id;
    expect(() => readEngineSessionExport(bad)).toThrow(SessionExportError);
    const other = sample();
    other.messages[0]!.info.sessionID = "ses_other";
    expect(() => readEngineSessionExport(other)).toThrow(SessionExportError);
    expect(() => readEngineSessionExport({ info: {}, messages: [] })).toThrow(SessionExportError);
  });

  test("stdout parses past anything before the JSON", () => {
    expect(parseEngineExportOutput(`noise\n${JSON.stringify(sample())}\n`).info.id).toBe(sample().info.id);
    expect(() => parseEngineExportOutput("nothing")).toThrow(SessionExportError);
    expect(parseEngineImportOutput("Imported session: ses_abc123\n")).toBe("ses_abc123");
    expect(parseEngineImportOutput("Failed")).toBeNull();
  });

  test("rekeying gives new ids everywhere, keeps order and links, and drops the share", () => {
    const source = sample();
    const rekeyed = rekeyEngineSessionExport(source, { title: "Kim's continuation" });
    expect(rekeyed.info.id).not.toBe(source.info.id);
    expect(isEngineId(rekeyed.info.id, "ses")).toBe(true);
    expect(rekeyed.info.title).toBe("Kim's continuation");
    expect("share" in rekeyed.info).toBe(false);
    const [user, reply] = rekeyed.messages;
    expect(user!.info.id).not.toBe(source.messages[0]!.info.id);
    expect(user!.info.id < reply!.info.id).toBe(true);
    expect(reply!.info.parentID).toBe(user!.info.id);
    for (const message of rekeyed.messages) {
      expect(message.info.sessionID).toBe(rekeyed.info.id);
      for (const part of message.parts) {
        expect(part.messageID).toBe(message.info.id);
        expect(part.sessionID).toBe(rekeyed.info.id);
        expect(isEngineId(part.id, "prt")).toBe(true);
      }
    }
    expect(reply!.parts.map((part) => part.type)).toEqual(["text", "tool"]);
    expect(reply!.parts[0]!.id < reply!.parts[1]!.id).toBe(true);
    expect(() => readEngineSessionExport(rekeyed)).not.toThrow();
  });

  test("versions are compatible within a minor", () => {
    expect(engineVersionCompatibility("0.1.0", "v0.1.4")).toBe("same");
    expect(engineVersionCompatibility("0.1.0", "0.2.0")).toBe("different");
    expect(engineVersionCompatibility(undefined, "0.1.0")).toBe("unknown");
  });
});

describe("engine CLI", () => {
  test("runs with the engine's environment, never its server credentials", async () => {
    setEngineCliTemplate({ bin: "redrob", env: { XDG_DATA_HOME: "/engine/data", REDROB_SERVER_TOKEN: "t" } });
    const env = engineCliEnv({ PATH: "/bin", REDROB_SERVER_PASSWORD: "p", REDROB_ENCRYPTION_KEY: "k" });
    expect(env.XDG_DATA_HOME).toBe("/engine/data");
    expect(env.PATH).toBe("/bin");
    expect(env.REDROB_SERVER_PASSWORD).toBeUndefined();
    expect(env.REDROB_SERVER_TOKEN).toBeUndefined();
    expect(env.REDROB_ENCRYPTION_KEY).toBeUndefined();
  });

  test("exports from one data dir and imports into another, under the target folder", async () => {
    const bin = await fakeEngine();
    const dataA = await temp("redrob-data-a-");
    const dataB = await temp("redrob-data-b-");
    const target = await temp("redrob-target-");
    await mkdir(join(dataA, "fake"), { recursive: true });
    await writeFile(join(dataA, "fake", `${sample().info.id}.json`), JSON.stringify(sample()));

    setEngineCliTemplate({ bin, env: { XDG_DATA_HOME: dataA, REDROB_SERVER_PASSWORD: "secret" } });
    const exported = await exportEngineSession(sample().info.id, { cwd: target });
    expect(exported.messages).toHaveLength(2);

    setEngineCliTemplate({ bin, env: { XDG_DATA_HOME: dataB } });
    const imported = await importEngineSession(exported, { cwd: target });
    expect(imported).toBe(sample().info.id);
    const stored = JSON.parse(await readFile(join(dataB, "fake", `${imported}.json`), "utf8")) as EngineSessionExport;
    expect(String(stored.info.directory)).toEndWith(target.split("/").pop() ?? "");
  });

  test("a failing command reports its exit code and the tail of stderr", async () => {
    const bin = await fakeEngine();
    const data = await temp("redrob-data-");
    setEngineCliTemplate({ bin, env: { XDG_DATA_HOME: data } });
    const error = await exportEngineSession("ses_missing00000000000000000", { cwd: data }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(EngineCliError);
    expect((error as EngineCliError).detail.code).toBe(1);
    expect((error as EngineCliError).detail.stderr).toContain("Session not found");
  });

  test("a command that hangs is killed at the timeout", async () => {
    const bin = await fakeEngine();
    const error = await runEngineCli(["sleep"], { cwd: tmpdir(), bin, timeoutMs: 300 }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(EngineCliError);
    expect(String((error as Error).message)).toContain("within 300ms");
  });

  test("a missing binary is an error, not a crash", async () => {
    const error = await runEngineCli(["export"], { cwd: tmpdir(), bin: "/nonexistent/redrob" }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(EngineCliError);
  });
});
