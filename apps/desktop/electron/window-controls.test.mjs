import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * The renderer-drawn title bar (Windows and Linux) drives the window only through the desktop
 * bridge: `__windowControl` for its buttons and `__windowState` for Maximise vs Restore, plus the
 * `redrob:window:state` push the preload turns into a DOM event. The bar shipped before any of
 * those existed on the main side, so its buttons silently did nothing: the bridge answered
 * "not implemented" and the renderer swallowed the rejection. This pins the contract from both
 * ends so the bar and the process it talks to cannot drift apart again.
 */

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, "main.mjs"), "utf8");
const preload = readFileSync(join(here, "preload.mjs"), "utf8");
const titleBar = readFileSync(
  join(here, "..", "..", "app", "src", "react-app", "shell", "window-title-bar.tsx"),
  "utf8",
);
const ipcTypes = readFileSync(join(here, "..", "..", "..", "packages", "types", "src", "desktop-ipc.ts"), "utf8");

/** Every `invokeDesktop("<command>"...)` the title bar makes. */
const invoked = [...titleBar.matchAll(/invokeDesktop\?\.\(\s*"(__[A-Za-z]+)"/g)].map((m) => m[1]);

test("the title bar invokes the two window commands", () => {
  assert.deepEqual([...new Set(invoked)].sort(), ["__windowControl", "__windowState"]);
});

test("every command the title bar invokes has a main-process handler", () => {
  for (const command of new Set(invoked)) {
    assert.match(main, new RegExp(`^\\s*"${command}":\\s*async \\(`, "m"), `${command} handler in main.mjs`);
    assert.match(ipcTypes, new RegExp(`^\\s*${command}:\\s*\\{`, "m"), `${command} declared in DesktopCommandMap`);
  }
});

test("__windowControl covers every action the title bar can send", () => {
  const actions = [...titleBar.matchAll(/control\("([a-zA-Z]+)"\)/g)].map((m) => m[1]);
  assert.ok(actions.length >= 3, "title bar has minimise / maximise / close buttons");
  const handler = main.slice(main.indexOf('"__windowControl": async'), main.indexOf('"__windowState": async'));
  for (const action of new Set(actions)) {
    assert.match(handler, new RegExp(`case "${action}":`), `__windowControl handles ${action}`);
  }
});

test("window state changes are pushed from main and forwarded by the preload", () => {
  const event = '"redrob:window:state"';
  assert.ok(main.includes(`const WINDOW_STATE_EVENT = ${event}`), "main names the event");
  for (const name of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) {
    assert.ok(main.includes(`"${name}"`), `main listens for ${name}`);
  }
  assert.ok(main.includes("forwardWindowStateChanges(mainWindow)"), "main wires the forwarder to the window");
  assert.ok(preload.includes(`const WINDOW_STATE_EVENT = ${event}`), "preload names the event");
  assert.match(preload, /ipcRenderer\.on\(WINDOW_STATE_EVENT, \(_event, state\)/, "preload receives the push");
  assert.match(preload, /new CustomEvent\(WINDOW_STATE_EVENT, \{ detail: state \}\)/, "preload re-dispatches it as a DOM event");
  assert.ok(titleBar.includes(`const WINDOW_STATE_EVENT = ${event}`), "title bar listens to the same name");
});
