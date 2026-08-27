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
