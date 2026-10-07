#!/usr/bin/env node
// Runs a command with environment variables set, the same way on every shell.
//
//   node scripts/with-env.mjs NAME=value OTHER?=default -- command args...
//
// `NAME=value` always sets the variable. `NAME?=value` sets it only when it is unset, which is what
// the old `${NAME:-value}` did. pnpm runs scripts through cmd.exe on Windows, where neither the
// `NAME=value command` prefix nor `${...}` expansion exists, so `pnpm dev` failed there.
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * @param {string[]} argv the arguments after the script name
 * @param {NodeJS.ProcessEnv} env the environment to start from
 * @returns {{ env: NodeJS.ProcessEnv, command: string[] }}
 */
export function parseWithEnv(argv, env) {
  const split = argv.indexOf("--");
  if (split < 0 || split === argv.length - 1) {
    throw new Error("usage: with-env NAME=value [NAME?=default] -- command [args...]");
  }
  const next = { ...env };
  for (const assignment of argv.slice(0, split)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(\?)?=(.*)$/.exec(assignment);
    if (!match) throw new Error(`not an assignment: ${assignment}`);
    const [, name, onlyIfUnset, value] = match;
    if (onlyIfUnset && next[name] !== undefined && next[name] !== "") continue;
    next[name] = value;
  }
  return { env: next, command: argv.slice(split + 1) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { env, command } = parseWithEnv(process.argv.slice(2), process.env);
  // A shell resolves `pnpm` to pnpm.cmd on Windows and keeps quoting the same as the script line.
  const child = spawn(command.join(" "), { env, stdio: "inherit", shell: true });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}
