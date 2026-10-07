import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveRedrobSentryAppVersion,
  resolveRedrobSentryRelease,
} from "./sentry.mjs";

test("unpackaged Sentry release uses the desktop package version", () => {
  const appVersion = resolveRedrobSentryAppVersion({
    app: { isPackaged: false, getVersion: () => "43.2.0" },
    packageMetadata: { version: "0.18.7" },
  });

  assert.equal(appVersion, "0.18.7");
  assert.equal(
    resolveRedrobSentryRelease({ appVersion, environmentRelease: "" }),
    "redrob-desktop@0.18.7",
  );
});

test("packaged Sentry release uses Electron's stamped app version", () => {
  const appVersion = resolveRedrobSentryAppVersion({
    app: { isPackaged: true, getVersion: () => "0.18.8" },
    packageMetadata: { version: "0.18.7" },
  });

  assert.equal(appVersion, "0.18.8");
  assert.equal(
    resolveRedrobSentryRelease({ appVersion, environmentRelease: "" }),
    "redrob-desktop@0.18.8",
  );
});

test("Sentry release still honors an explicit build override", () => {
  assert.equal(
    resolveRedrobSentryRelease({
      appVersion: "0.18.8",
      environmentRelease: "desktop-main@abcdef",
    }),
    "desktop-main@abcdef",
  );
});

test("crash reports send nothing until the person consents, and stop when they turn it off", async () => {
  const { installRedrobSentryForTests, redrobSentryGate, setRedrobSentryConsent } = await import("./sentry.mjs");
  const users = [];
  installRedrobSentryForTests({
    setUser: (user) => users.push(user),
    setTag: () => {},
    setContext: () => {},
  });
  const event = { message: "boom" };
  assert.equal(redrobSentryGate(event), null);
  // Consent without an install id is not enough to send.
  assert.equal(setRedrobSentryConsent({ enabled: true, installId: "" }), false);
  assert.equal(redrobSentryGate(event), null);
  assert.equal(setRedrobSentryConsent({ enabled: true, installId: "install-123" }), true);
  assert.equal(redrobSentryGate(event), event);
  assert.deepEqual(users.at(-1), { id: "install-123" });
  assert.equal(setRedrobSentryConsent({ enabled: false }), false);
  assert.equal(redrobSentryGate(event), null);
  installRedrobSentryForTests(null);
});

test("the install id is made once and kept", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { resolveRedrobInstallId } = await import("./sentry.mjs");
  const dir = mkdtempSync(join(tmpdir(), "redrob-install-id-"));
  try {
    const first = resolveRedrobInstallId(dir);
    assert.match(first, /^[0-9a-f-]{36}$/);
    assert.equal(resolveRedrobInstallId(dir), first);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
