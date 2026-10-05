import { test } from "node:test";
import assert from "node:assert/strict";

import { createKeepAwake } from "./keep-awake.mjs";

function fakeBlocker() {
  const calls = [];
  const started = new Set();
  let next = 1;
  return {
    calls,
    start(type) {
      const id = next++;
      started.add(id);
      calls.push(`start:${type}:${id}`);
      return id;
    },
    stop(id) {
      started.delete(id);
      calls.push(`stop:${id}`);
    },
    isStarted(id) {
      return started.has(id);
    },
  };
}

test("starts one hold however often a busy run asks", () => {
  const blocker = fakeBlocker();
  const keepAwake = createKeepAwake(blocker);
  assert.equal(keepAwake.set(true), true);
  assert.equal(keepAwake.set(true), true);
  assert.deepEqual(blocker.calls, ["start:prevent-app-suspension:1"]);
});

test("stops the hold when the run goes idle, and only once", () => {
  const blocker = fakeBlocker();
  const keepAwake = createKeepAwake(blocker);
  keepAwake.set(true);
  assert.equal(keepAwake.set(false), false);
  assert.equal(keepAwake.set(false), false);
  assert.deepEqual(blocker.calls, ["start:prevent-app-suspension:1", "stop:1"]);
});

test("off with nothing held does nothing, and a later run starts a fresh hold", () => {
  const blocker = fakeBlocker();
  const keepAwake = createKeepAwake(blocker);
  keepAwake.set(false);
  keepAwake.set(true);
  keepAwake.set(false);
  keepAwake.set(true);
  assert.deepEqual(blocker.calls, [
    "start:prevent-app-suspension:1",
    "stop:1",
    "start:prevent-app-suspension:2",
  ]);
});

test("a hold the system already dropped is forgotten without stopping it again", () => {
  const blocker = fakeBlocker();
  const keepAwake = createKeepAwake(blocker);
  keepAwake.set(true);
  blocker.stop(1);
  blocker.calls.length = 0;
  assert.equal(keepAwake.set(false), false);
  assert.deepEqual(blocker.calls, []);
});
