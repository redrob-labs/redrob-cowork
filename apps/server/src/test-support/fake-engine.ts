import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineSessionExport } from "../session-export.js";

/**
 * A stand-in for `redrob` that keeps sessions as JSON files under `$XDG_DATA_HOME/fake`. Its
 * `export` and `import` behave like the engine's: import takes the session's directory from the
 * working directory, and refuses a file whose `info.version` is "refuse" (to test the fallback).
 */
export async function createFakeEngine(): Promise<{ bin: string; dataHome: string; root: string; seed(session: EngineSessionExport): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "redrob-fake-engine-"));
  const bin = join(root, "redrob");
  const dataHome = join(root, "data");
  await mkdir(join(dataHome, "fake"), { recursive: true });
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
  if (data.info.version === "refuse") { console.error("SchemaError: missing keys"); process.exit(1); }
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
  return {
    bin,
    dataHome,
    root,
    seed: async (session) => {
      await writeFile(join(dataHome, "fake", `${session.info.id}.json`), JSON.stringify(session));
    },
  };
}

/** A two-message session in the engine's shape, with optional tool parts. */
export function sampleSession(options: { directory?: string; tools?: Array<{ tool: string; filePath: string }>; text?: string } = {}): EngineSessionExport {
  const ses = "ses_ee36fcaa0ffevmj3LcBiEdo1iR";
  const user = "msg_11c9035f5001B7YIkut7V4Uo5W";
  const reply = "msg_11c9035f6001B7YIkut7V4Uo5X";
  const tools = (options.tools ?? []).map((entry, index) => ({
    id: `prt_11c9035f6${String(index + 10).padStart(3, "0")}AAAAAAAAAAAAAA`,
    type: "tool",
    tool: entry.tool,
    state: { status: "completed", input: { filePath: entry.filePath }, output: "ok" },
    messageID: reply,
    sessionID: ses,
  }));
  return {
    info: { id: ses, title: "Lease review", version: "0.1.0", directory: options.directory ?? "/tmp", projectID: "global" },
    messages: [
      {
        info: { id: user, role: "user", sessionID: ses },
        parts: [{ id: "prt_11c9035f5002AAAAAAAAAAAAAA", type: "text", text: "Read clause 4", messageID: user, sessionID: ses }],
      },
      {
        info: { id: reply, role: "assistant", sessionID: ses, parentID: user },
        parts: [
          { id: "prt_11c9035f6002AAAAAAAAAAAAAA", type: "text", text: options.text ?? "Done", messageID: reply, sessionID: ses },
          ...tools,
        ],
      },
    ],
  };
}
