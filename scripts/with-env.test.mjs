import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parseWithEnv } from "./with-env.mjs";

test("sets assignments and splits off the command", () => {
  const { env, command } = parseWithEnv(["A=1", "--", "pnpm", "dev"], {});
  assert.equal(env.A, "1");
  assert.deepEqual(command, ["pnpm", "dev"]);
});

test("NAME?=value keeps a value that is already set, like ${NAME:-value}", () => {
  assert.equal(parseWithEnv(["P?=9823", "--", "x"], { P: "0" }).env.P, "0");
  assert.equal(parseWithEnv(["P?=9823", "--", "x"], {}).env.P, "9823");
  assert.equal(parseWithEnv(["P?=9823", "--", "x"], { P: "" }).env.P, "9823");
});

test("NAME=value overrides, and an empty value is allowed", () => {
  assert.equal(parseWithEnv(["P=0", "--", "x"], { P: "9823" }).env.P, "0");
  assert.equal(parseWithEnv(["P=", "--", "x"], { P: "1" }).env.P, "");
});

test("rejects a missing command or a malformed assignment", () => {
  assert.throws(() => parseWithEnv(["A=1"], {}));
  assert.throws(() => parseWithEnv(["A=1", "--"], {}));
  assert.throws(() => parseWithEnv(["not-an-assignment", "--", "x"], {}));
});

test("runs the command with the variables, on this platform's shell", () => {
  const script = fileURLToPath(new URL("./with-env.mjs", import.meta.url));
  const result = spawnSync(
    process.execPath,
    [script, "WITH_ENV_PROBE=ok", "--", `"${process.execPath}"`, "-e", "\"process.exit(process.env.WITH_ENV_PROBE === 'ok' ? 7 : 1)\""],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 7, result.stderr);
});
