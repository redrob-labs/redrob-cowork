import { expect } from "vitest";
import { clickButton, evalIn, visibleText } from "@redrob/behaviors";
import { desktop } from "@redrob/hosts";
import { eventually, needs, test } from "@redrob/testkit";

const e2eTestsEnabled = process.env.REDROB_EVAL_E2E_TESTS === "1";
const title = e2eTestsEnabled
  ? "recovery offers only recent stable releases with exact compatible artifacts"
  : "compatible release picker skipped — needs: set REDROB_EVAL_E2E_TESTS=1";
const currentArtifact = "https://releases.redrob.test/v2.4.0/Redrob Work-darwin-arm64.dmg";
const previousArtifact = "https://releases.redrob.test/v2.3.1/Redrob Work-darwin-arm64.dmg";

test.skipIf(!e2eTestsEnabled)(title, async ({ evidence, place }) => {
  needs({ optIn: ["REDROB_EVAL_E2E_TESTS"] });
  await using recoveryApp = await desktop({
    name: "compatible-release-picker",
    host: place.host(),
    timeoutMs: 30_000,
    env: {
      REDROB_EVAL_FATAL_DESKTOP_BOOTSTRAP_FAILURE: "EVAL_FATAL_DESKTOP_BOOTSTRAP_FAILURE",
      REDROB_EVAL_RECOVERY_TARGET: "darwin-arm64-public",
      REDROB_EVAL_RECOVERY_RELEASES: JSON.stringify([
        { version: "2.4.0", channel: "stable", artifact: { platform: "darwin", arch: "arm64", distribution: "public", url: currentArtifact } },
        { version: "2.3.1", channel: "stable", artifact: { platform: "darwin", arch: "arm64", distribution: "public", url: previousArtifact } },
        { version: "2.3.0", channel: "stable", artifact: { platform: "linux", arch: "x64", distribution: "public", url: "https://incompatible.invalid/Redrob Work.AppImage" } },
        { version: "2.2.9", channel: "stable", artifact: { platform: "darwin", arch: "arm64", distribution: "enterprise", url: "https://wrong-flavor.invalid/Redrob Work.dmg" } },
        { version: "2.2.8-beta.1", channel: "prerelease", artifact: { platform: "darwin", arch: "arm64", distribution: "public", url: "https://prerelease.invalid/Redrob Work.dmg" } },
      ]),
    },
  });

  const releaseObserverAvailable = await evalIn(
    recoveryApp,
    `typeof window.__redrobRecoveryControl?.snapshot === "function"
      && typeof window.__redrobRecoveryControl?.select === "function"`,
  );
  expect(
    releaseObserverAvailable,
    "testkit cannot yet inject a release catalog or observe exact artifact selection",
  ).toBe(true);

  await clickButton(recoveryApp, "Pick another version", { timeoutMs: 5_000 });
  const text = await visibleText(recoveryApp);
  expect(text).toContain("2.4.0");
  expect(text).toMatch(/2\.4\.0\s+current/i);
  expect(text).not.toMatch(/Use 2\.4\.0/i);
  expect(text).toMatch(/Use 2\.3\.1\s+previous/i);
  expect(text).not.toContain("2.3.0");
  expect(text).not.toContain("2.2.9");
  expect(text).not.toContain("2.2.8-beta.1");
  expect(await evalIn(
    recoveryApp,
    `[...document.querySelectorAll("button")].some((button) => (button.textContent ?? "").trim() === "Use 2.4.0")`,
  )).toBe(false);

  const offeredReleases = await evalIn(
    recoveryApp,
    `window.__redrobRecoveryControl.snapshot().then((snapshot) => snapshot.releases.map((release) => ({
      version: release.version,
      marking: release.marking,
      platform: release.artifact.platform,
      arch: release.artifact.arch,
      distribution: release.artifact.distribution,
      url: release.artifact.url,
    })))`,
    { awaitPromise: true },
  );
  expect(offeredReleases).toEqual([
    { version: "2.4.0", marking: "current", platform: "darwin", arch: "arm64", distribution: "public", url: currentArtifact },
    { version: "2.3.1", marking: "previous", platform: "darwin", arch: "arm64", distribution: "public", url: previousArtifact },
  ]);

  await evalIn(recoveryApp, `window.__redrobRecoveryControl.select("2.3.0")`, { awaitPromise: true });
  await evalIn(recoveryApp, `window.__redrobRecoveryControl.select("9.9.9")`, { awaitPromise: true });
  expect(await evalIn(recoveryApp, `window.__redrobRecoveryControl.snapshot().then((snapshot) => snapshot.openedArtifactUrls)`, { awaitPromise: true })).toEqual([]);

  await clickButton(recoveryApp, "Use 2.3.1", { timeoutMs: 5_000 });
  const openedArtifactUrls = await eventually(
    () => evalIn(recoveryApp, `window.__redrobRecoveryControl.snapshot().then((snapshot) => snapshot.openedArtifactUrls)`, { awaitPromise: true }),
    {
      within: 5_000,
      label: "exact compatible release artifact",
      until: (urls) => Array.isArray(urls) && urls.length === 1,
    },
  );
  expect(openedArtifactUrls).toEqual([previousArtifact]);
  expect(openedArtifactUrls).not.toContain(currentArtifact);
  expect(openedArtifactUrls).not.toContain("https://incompatible.invalid/Redrob Work.AppImage");
  expect(openedArtifactUrls).not.toContain("https://wrong-flavor.invalid/Redrob Work.dmg");
  expect(openedArtifactUrls).not.toContain("https://prerelease.invalid/Redrob Work.dmg");
  evidence.recordAssertionEvidence(
    "The picker opened only the exact compatible previous stable artifact",
    "Current and previous were marked, incompatible and prerelease targets were absent, and arbitrary selection opened nothing.",
    true,
  );
});
