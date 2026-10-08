import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REDROB_CODE_BIN_NAME, resolveRedrobCodeBinEnv } from "./managed-opencode.js";
import {
  SessionExportError,
  parseEngineExportOutput,
  parseEngineImportOutput,
  type EngineSessionExport,
} from "./session-export.js";

/**
 * One-off engine commands (`redrob export`, `redrob import`) against the same data the managed
 * engine serves.
 *
 * The CLI has to see what `redrob serve` sees: the same binary and the same environment, since
 * HOME and XDG_DATA_HOME are what place the engine's database. The embedded server registers the
 * template it spawns the engine with; without one (a server pointed at an engine it did not start)
 * the CLI falls back to REDROB_CODE_BIN or `redrob` on PATH with this process's environment, which
 * is what that engine was started with as far as this server can know.
 */
export type EngineCliTemplate = { bin?: string; env: Record<string, string | undefined> };

let template: EngineCliTemplate | null = null;

export function setEngineCliTemplate(next: EngineCliTemplate | null): void {
  template = next;
}

export function engineCliTemplate(): EngineCliTemplate | null {
  return template;
}

/** Never handed to a one-off command: credentials the CLI has no use for. */
const WITHHELD_ENV = ["REDROB_ENCRYPTION_KEY", "REDROB_SERVER_USERNAME", "REDROB_SERVER_PASSWORD", "REDROB_SERVER_TOKEN"];

export function engineCliEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, ...(template?.env ?? {}) };
  for (const key of WITHHELD_ENV) delete env[key];
  return env;
}

export function engineCliBin(): string {
  return template?.bin?.trim() || resolveRedrobCodeBinEnv() || REDROB_CODE_BIN_NAME;
}

export class EngineCliError extends Error {
  constructor(
    message: string,
    readonly detail: { code: number | null; stderr: string },
  ) {
    super(message);
    this.name = "EngineCliError";
  }
}

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

/** Runs one engine command to completion. Output is collected, bounded, and never echoed. */
export function runEngineCli(
  args: string[],
  options: { cwd: string; timeoutMs?: number; bin?: string; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string }> {
  const bin = options.bin ?? engineCliBin();
  const timeoutMs = options.timeoutMs ?? 60_000;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env ?? engineCliEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
    };
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new EngineCliError("Redrob Code printed more than this server will read", { code: null, stderr: "" }));
        return;
      }
      into.push(chunk);
    };
    child.stdout?.on("data", collect(out));
    child.stderr?.on("data", collect(err));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new EngineCliError(`Redrob Code did not finish ${args[0]} within ${timeoutMs}ms`, { code: null, stderr: "" }));
    }, timeoutMs);
    child.once("error", (error) =>
      finish(new EngineCliError(`Redrob Code could not start: ${error.message}`, { code: null, stderr: "" })),
    );
    child.once("close", (code) => {
      if (code === 0) return finish(null);
      const stderr = Buffer.concat(err).toString("utf8").slice(-4000);
      finish(new EngineCliError(`Redrob Code ${args[0]} exited with code ${code}`, { code, stderr }));
    });
  });
}

/**
 * The session as the engine exports it, unsanitised. Safe while the engine is serving: the engine's
 * database is shared by its own rollover pool already, and export only reads.
 */
export async function exportEngineSession(
  sessionId: string,
  options: { cwd: string; timeoutMs?: number; bin?: string; env?: NodeJS.ProcessEnv },
): Promise<EngineSessionExport> {
  const { stdout } = await runEngineCli(["export", sessionId], options);
  const exported = parseEngineExportOutput(stdout);
  if (exported.info.id !== sessionId) throw new SessionExportError("The engine exported a different session");
  return exported;
}

/**
 * Imports an export into the project of `cwd`, which is how the engine picks the project and the
 * session's directory. Returns the session id the engine reports.
 */
export async function importEngineSession(
  exported: EngineSessionExport,
  options: { cwd: string; timeoutMs?: number; bin?: string; env?: NodeJS.ProcessEnv },
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "redrob-import-"));
  try {
    const file = join(dir, "session.json");
    await writeFile(file, JSON.stringify(exported), { mode: 0o600 });
    const { stdout } = await runEngineCli(["import", file], options);
    const imported = parseEngineImportOutput(stdout);
    if (!imported) throw new SessionExportError("The engine did not report an imported session");
    return imported;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
