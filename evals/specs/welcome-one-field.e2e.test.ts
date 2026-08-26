import { expect } from "vitest";
import { captureOpenedUrls, clickButton, evalIn, fill, waitFor, waitForText } from "@redrob/behaviors";
import { screenshot, validate } from "@redrob/test-evidence";
import { desktop } from "@redrob/hosts";
import { needs, test, unmetNeeds } from "@redrob/testkit";
import type { TestNeeds } from "@redrob/testkit";

/**
 * The invite points at localhost so the external open the app performs stays
 * harmless on hosts where it reaches a real browser (macOS LaunchServices
 * ignores PATH shims): the tab dies on connection-refused without touching DNS.
 */
const INVITE_URL = "http://localhost:59991/join-org?invite=inv_demo123";
const INVITE_ORIGIN = "http://localhost:59991";

const requirements: TestNeeds = {
  optIn: ["REDROB_EVAL_E2E_TESTS"],
};
const missingRequirements = unmetNeeds(requirements, process.env);
const title = missingRequirements.length > 0
  ? `welcome one-field skipped — needs: ${missingRequirements.join(", ")}`
  : "the welcome join field takes a server URL or web invite and points the app at that organization";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test(title, async ({ evidence }) => {
  needs(requirements);

  // On Linux shell.openExternal shells out to xdg-open, so a PATH shim records
  // every URL the app hands to the OS (same pattern as first-run-cloud-share).
  const capture = await captureOpenedUrls();
  await using app = await desktop({
    name: "welcome-one-field",
    env: { PATH: `${capture.binDir}:${process.env.PATH ?? ""}` },
  });
  expect(app.readiness.route).toContain("/welcome");
  await waitForText(app, "Welcome to OpenWork");

  const doors = await evalIn(app, `(() => {
    const join = document.querySelector('[data-testid="welcome-join-org"]');
    return {
      getStarted: Boolean(document.querySelector('[data-testid="welcome-get-started"]')),
      signIn: Boolean(document.querySelector('[data-testid="welcome-team-signin"]')),
      join: (join?.textContent ?? "").replace(/\\s+/g, " ").trim(),
      onPremLink: document.body.innerText.includes("Using OpenWork on-premises?"),
    };
  })()`);
  if (!isRecord(doors) || typeof doors.join !== "string") {
    throw new Error(`Welcome door facts had an unexpected shape: ${JSON.stringify(doors)}`);
  }

  // Redrob-only onboarding: the cloud-account sign-in door was removed. The
  // welcome page offers Get started (create workspace) plus the join-org door;
  // the Redrob API-key step is presented after workspace creation.
  expect(doors.getStarted).toBe(true);
  expect(doors.signIn).toBe(false);
  expect(doors.join).toContain("Join your organization");
  expect(doors.join).toContain("Paste your invite link, install link, or server URL");
  expect(doors.onPremLink).toBe(false);
  evidence.recordAssertionEvidence(
    "Welcome offers Get started and Join your organization, with no cloud sign-in door",
    `getStarted=${String(doors.getStarted)}; signIn=${String(doors.signIn)}; join=${doors.join}; onPremLink=${String(doors.onPremLink)}`,
    doors.getStarted === true && doors.signIn === false
      && doors.join.includes("Paste your invite link, install link, or server URL")
      && doors.onPremLink === false,
  );

  {
    const shot = await screenshot(app);
    const seen = await validate(shot, [
      "The Welcome to OpenWork heading is visible",
      "A Get started action is offered and there is no Sign in to Cloud door",
      "Join your organization says to paste an invite link, install link, or server URL",
      "The page does not say Using OpenWork on-premises",
    ]);
    expect(seen.ok, seen.why).toBe(true);
  }

  const opened = await evalIn(app, `(() => {
    const join = document.querySelector('[data-testid="welcome-join-org"]');
    if (!(join instanceof HTMLButtonElement)) return false;
    join.click();
    return true;
  })()`);
  expect(opened).toBe(true);
  await waitFor(app, `Boolean(document.getElementById("join-organization-input"))`, {
    timeoutMs: 15_000,
    label: "join organization dialog input",
  });

  // Branch 1: a plain organization server URL is saved as the control plane.
  // On desktop the control plane persists in the shell's desktop-bootstrap.json
  // (not localStorage), so read it back through the bridge.
  await fill(app, "#join-organization-input", "https://openwork.acme.test");
  await clickButton(app, "Connect");
  await waitForText(app, "Connected to openwork.acme.test. Sign in to continue.", { timeoutMs: 20_000 });
  const savedBaseUrl = await evalIn(
    app,
    `window.__REDROB_ELECTRON__.invokeDesktop("getDesktopBootstrapConfig").then((config) => config.baseUrl)`,
    { awaitPromise: true },
  );
  expect(savedBaseUrl).toBe("https://openwork.acme.test");
  evidence.recordAssertionEvidence(
    "Pasting a server URL points the app at that organization server",
    `status=Connected to openwork.acme.test; savedBaseUrl=${String(savedBaseUrl)}`,
    savedBaseUrl === "https://openwork.acme.test",
  );

  {
    const shot = await screenshot(app);
    const seen = await validate(shot, [
      "The join dialog field label mentions invite link, install link, or server URL",
      "The dialog confirms it connected to openwork.acme.test",
    ]);
    expect(seen.ok, seen.why).toBe(true);
  }

  // Branch 2: a Den web invite saves the invite's origin as the control plane
  // and hands the invite to the system browser (the join completes on the web).
  await fill(app, "#join-organization-input", INVITE_URL);
  await clickButton(app, "Connect");
  await waitForText(app, "Trust this organization server?", { timeoutMs: 20_000 });
  const unchangedBaseUrl = await evalIn(
    app,
    `window.__REDROB_ELECTRON__.invokeDesktop("getDesktopBootstrapConfig").then((config) => config.baseUrl)`,
    { awaitPromise: true },
  );
  expect(unchangedBaseUrl).toBe("https://openwork.acme.test");
  await clickButton(app, "Trust and open invite");
  await waitForText(app, "Your invite opened in the browser", { timeoutMs: 20_000 });

  const inviteBaseUrl = await evalIn(
    app,
    `window.__REDROB_ELECTRON__.invokeDesktop("getDesktopBootstrapConfig").then((config) => config.baseUrl)`,
    { awaitPromise: true },
  );
  expect(inviteBaseUrl).toBe(INVITE_ORIGIN);
  evidence.recordAssertionEvidence(
    "Pasting a web invite points the app at the invite's organization and reports the browser handoff",
    `status=Your invite opened in the browser; persisted baseUrl=${String(inviteBaseUrl)}`,
    inviteBaseUrl === INVITE_ORIGIN,
  );

  // Only Linux routes shell.openExternal through xdg-open where the PATH shim
  // can observe it; there the exact opened URL is a hard assertion.
  if (process.platform === "linux") {
    const openedUrl = await capture.waitForUrl((url) => url === INVITE_URL, { timeoutMs: 20_000 });
    expect(openedUrl).toBe(INVITE_URL);
    evidence.recordAssertionEvidence(
      "The OS was asked to open exactly the pasted invite link",
      `xdg-open received ${openedUrl}`,
      openedUrl === INVITE_URL,
    );
  }

  {
    const shot = await screenshot(app);
    const seen = await validate(shot, [
      "The dialog says the invite opened in the browser and to finish joining there",
    ]);
    expect(seen.ok, seen.why).toBe(true);
  }
});
