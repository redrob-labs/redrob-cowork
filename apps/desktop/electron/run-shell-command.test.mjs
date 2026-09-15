import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * The engine install used to run through `spawnSync`, which blocks the Electron
 * main process for the whole command — up to the 180s install timeout. Two
 * consequences, and the second is why the onboarding step had no cancel to offer:
 *
 *   1. the whole app froze, not just the onboarding screen;
 *   2. a blocked main process cannot receive IPC, so a cancel request from the
 *      renderer could not have been delivered at all.
 *
 * These pin the properties the async runner must keep. They mirror the spawn
 * shape of `runShellCommand` in runtime.mjs rather than importing it, because
 * that module needs an Electron `app` at construction time.
 */
function runShellCommand(program, args, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status, stdout, stderr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ status, stdout, stderr });
    };

    const child = spawn(program, args, {
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    const stop = (signal) => {
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, signal);
        } catch {
          // Already gone.
        }
      }
      try {
        child.kill(signal);
      } catch {
        // Already gone.
      }
    };

    const timer = options.timeoutMs
      ? setTimeout(() => {
          stop("SIGKILL");
          finish(-1, stdout, stderr || `Timed out after ${options.timeoutMs}ms.`);
        }, options.timeoutMs)
      : undefined;

    const onAbort = () => {
      stop("SIGTERM");
      finish(-1, stdout, stderr || "Cancelled.");
    };
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => finish(-1, stdout, error?.message ?? String(error)));
    child.on("close", (code) => finish(typeof code === "number" ? code : -1, stdout, stderr));
  });
}

describe("runShellCommand", () => {
  it("collects output and the exit status of a command that succeeds", async () => {
    const result = await runShellCommand("bash", ["-lc", "echo hello"]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "hello");
  });

  it("reports a non-zero exit status", async () => {
    const result = await runShellCommand("bash", ["-lc", "exit 3"]);
    assert.equal(result.status, 3);
  });

  // The property that matters. spawnSync could not satisfy this, and that — not a
  // missing button — is why the onboarding step could not be cancelled.
  it("leaves the event loop turning while the command runs", async () => {
    let ticked = 0;
    const ticker = setInterval(() => {
      ticked += 1;
    }, 10);
    try {
      await runShellCommand("bash", ["-lc", "sleep 0.4"]);
    } finally {
      clearInterval(ticker);
    }
    assert.ok(ticked > 0, "event loop did not run during the command");
  });

  it("aborts a running command when the signal fires", async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 100);

    const result = await runShellCommand("bash", ["-lc", "sleep 30"], {
      signal: controller.signal,
    });

    assert.ok(Date.now() - started < 5_000, "abort did not return promptly");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cancelled/);
  });

  it("returns immediately when the signal is already aborted", async () => {
    const result = await runShellCommand("bash", ["-lc", "sleep 30"], {
      signal: AbortSignal.abort(),
    });
    assert.equal(result.status, -1);
  });

  it("kills the process group so a piped download does not survive the cancel", async (t) => {
    if (process.platform === "win32") return t.skip("POSIX process groups only");

    const dir = await mkdtemp(path.join(os.tmpdir(), "redrob-group-kill-"));
    const pidFile = path.join(dir, "child.pid");
    try {
      const controller = new AbortController();
      // A shell that forks a child and waits on it. Signalling only the shell
      // would orphan the child, which is what a curl-into-bash install looks
      // like; signalling the group takes both.
      const run = runShellCommand("bash", ["-lc", `sleep 30 & echo $! > ${pidFile}; wait`], {
        signal: controller.signal,
      });

      // Give the shell time to fork and record the child.
      let recorded = "";
      for (let attempt = 0; attempt < 50 && !recorded; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        recorded = await readFile(pidFile, "utf8").catch(() => "");
      }
      const childPid = Number(recorded.trim());
      assert.ok(Number.isFinite(childPid) && childPid > 0, "child pid was never recorded");

      controller.abort();
      await run;
      await new Promise((resolve) => setTimeout(resolve, 250));

      assert.throws(
        () => process.kill(childPid, 0),
        /ESRCH/,
        "the killed shell left its child running",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("times out a command that never finishes", async () => {
    const result = await runShellCommand("bash", ["-lc", "sleep 30"], { timeoutMs: 150 });
    assert.equal(result.status, -1);
    assert.match(result.stderr, /Timed out/);
  });
});
