import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createRedrobServerClient } from "../src/app/lib/redrob-server";
import { runRedrobDeviceConnect } from "../src/react-app/domains/onboarding/redrob-device-connect";
import { REDROB_BASE_URL } from "../src/react-app/domains/settings/redrob-provider";

/**
 * "Redrob로 연결", driven through the real client against a recording Work server.
 *
 * The point of the flow is that nobody handles the key, so what these cases guard is the shape of
 * that promise rather than the polling itself:
 *
 *  - The renderer never holds the device code. It is given an opaque id, and the key it eventually
 *    causes to be written is one it never sees either.
 *  - Every refusal ends the loop. A denial, an expiry, or a console that will not honour the code
 *    stops, and nothing in here starts a second authorization on the user's behalf.
 *  - The paste path is still wired up, because a machine that cannot open a browser is a real case.
 */

const HOST_TOKEN = "owt_test_host_token";

type RecordedRequest = { method: string; pathname: string; body: unknown };

type PollAnswer = Record<string, unknown> | { __status: number; body: Record<string, unknown> };

function isFailure(answer: PollAnswer): answer is { __status: number; body: Record<string, unknown> } {
  return "__status" in answer;
}

const stops: Array<() => void> = [];

afterEach(() => {
  while (stops.length) stops.pop()?.();
});

/**
 * Stands in for Work's own server: it answers the two device routes from a script, so a suite can
 * queue the sequence it wants to see handled and then assert exactly which requests were made.
 */
function startRecordingServer(options: {
  polls: PollAnswer[];
  startStatus?: number;
  userCode?: string;
}) {
  const requests: RecordedRequest[] = [];
  let pollIndex = 0;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const raw = await request.text().catch(() => "");
      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      requests.push({ method: request.method, pathname: url.pathname, body });

      if (url.pathname === "/redrob-auth/device") {
        if (options.startStatus && options.startStatus >= 400) {
          return Response.json(
            { code: "console_unreachable", message: "no" },
            { status: options.startStatus },
          );
        }
        return Response.json({
          id: "conn-1",
          userCode: options.userCode ?? "K7QM-2XR9",
          verificationUri: "https://console.redrob.ai/connect",
          verificationUriComplete: "https://console.redrob.ai/connect?code=K7QM-2XR9",
          expiresAt: Date.now() + 600_000,
          intervalMs: 5_000,
        });
      }

      if (url.pathname === "/redrob-auth/device/poll") {
        const answer = options.polls[pollIndex] ?? options.polls[options.polls.length - 1];
        pollIndex += 1;
        if (answer && isFailure(answer)) {
          return Response.json(answer.body, { status: answer.__status });
        }
        return Response.json(answer ?? { status: "pending" });
      }

      if (url.pathname === "/redrob-auth/device/cancel") {
        return Response.json({ ok: true, cancelled: true });
      }

      return Response.json({ code: "not_found", message: "Not found" }, { status: 404 });
    },
  });
  stops.push(() => void server.stop(true));

  return { baseUrl: `http://127.0.0.1:${server.port}`, requests };
}

function client(baseUrl: string) {
  return createRedrobServerClient({ baseUrl, hostToken: HOST_TOKEN });
}

/** Runs the loop with no real waiting, and records what the step would have been shown. */
async function run(
  baseUrl: string,
  overrides: Partial<Parameters<typeof runRedrobDeviceConnect>[0]> = {},
) {
  const prompts: Array<{ userCode: string; verificationUriComplete: string }> = [];
  const opened: string[] = [];
  const waits: number[] = [];

  const outcome = await runRedrobDeviceConnect({
    client: client(baseUrl),
    onPrompt: (prompt) => prompts.push(prompt),
    openLink: (url) => opened.push(url),
    wait: async (ms) => {
      waits.push(ms);
    },
    ...overrides,
  });

  return { outcome, prompts, opened, waits };
}

describe("runRedrobDeviceConnect", () => {
  test("shows the code, opens the browser, and finishes when the key lands", async () => {
    const { baseUrl, requests } = startRecordingServer({
      polls: [{ status: "pending" }, { status: "connected", connected: true, source: "config" }],
    });

    const { outcome, prompts, opened } = await run(baseUrl);

    expect(outcome).toEqual({ status: "connected" });
    // The code reaches the step before the browser takes focus.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.userCode).toBe("K7QM-2XR9");
    expect(opened).toEqual(["https://console.redrob.ai/connect?code=K7QM-2XR9"]);

    expect(requests.map((entry) => `${entry.method} ${entry.pathname}`)).toEqual([
      "POST /redrob-auth/device",
      "POST /redrob-auth/device/poll",
      "POST /redrob-auth/device/poll",
    ]);
    // The renderer polls by opaque id. It is never given a device code.
    expect(requests[1]?.body).toEqual({ id: "conn-1" });
  });

  test("never asks for a key, and is never given one", async () => {
    const { baseUrl, requests } = startRecordingServer({
      polls: [{ status: "connected", connected: true, source: "config" }],
    });

    await run(baseUrl);

    // The old path put the credential in the renderer's hands. This one cannot.
    expect(requests.some((entry) => entry.pathname === "/redrob-auth" && entry.method === "PUT")).toBe(
      false,
    );
    expect(JSON.stringify(requests)).not.toContain("rrk_");
  });

  test("waits before the first poll, because nobody can have approved it yet", async () => {
    const { baseUrl } = startRecordingServer({
      polls: [{ status: "connected", connected: true, source: "config" }],
    });

    const { waits } = await run(baseUrl);

    // An immediate poll is a guaranteed pending answer, and the next one would be told to slow down.
    expect(waits[0]).toBe(5_000);
  });

  test("backs off when the console asks it to, rather than ignoring it", async () => {
    const { baseUrl } = startRecordingServer({
      polls: [
        { status: "slow_down" },
        { status: "slow_down" },
        { status: "connected", connected: true, source: "config" },
      ],
    });

    const { waits, outcome } = await run(baseUrl);

    expect(outcome).toEqual({ status: "connected" });
    expect(waits).toEqual([5_000, 10_000, 20_000]);
  });

  test("stops on a denial, and does not start another attempt", async () => {
    const { baseUrl, requests } = startRecordingServer({ polls: [{ status: "denied" }] });

    const { outcome } = await run(baseUrl);

    expect(outcome).toEqual({ status: "denied" });
    // One authorization only. Retrying past a refusal is the user's decision, not this loop's.
    expect(requests.filter((entry) => entry.pathname === "/redrob-auth/device")).toHaveLength(1);
    expect(requests.filter((entry) => entry.pathname === "/redrob-auth/device/poll")).toHaveLength(1);
  });

  test("stops on an expiry", async () => {
    const { baseUrl } = startRecordingServer({ polls: [{ status: "expired" }] });
    expect((await run(baseUrl)).outcome).toEqual({ status: "expired" });
  });

  test("stops on a code the console will not honour, keeping its reason", async () => {
    const { baseUrl } = startRecordingServer({
      polls: [{ status: "failed", code: "invalid_grant" }],
    });
    expect((await run(baseUrl)).outcome).toEqual({ status: "failed", code: "invalid_grant" });
  });

  test("rides out a console it could not reach, then gives up honestly", async () => {
    const { baseUrl, requests } = startRecordingServer({ polls: [{ status: "unreachable" }] });

    const { outcome } = await run(baseUrl);

    // Worth retrying a few times, not worth pretending about forever.
    expect(outcome).toEqual({ status: "failed", code: "console_unreachable" });
    expect(requests.filter((entry) => entry.pathname === "/redrob-auth/device/poll")).toHaveLength(5);
  });

  test("recovers when the console comes back", async () => {
    const { baseUrl } = startRecordingServer({
      polls: [
        { status: "unreachable" },
        { status: "unreachable" },
        { status: "pending" },
        { status: "unreachable" },
        { status: "unreachable" },
        { status: "unreachable" },
        { status: "connected", connected: true, source: "config" },
      ],
    });

    // The count resets on any real answer, so a flaky link does not add up to a false failure.
    expect((await run(baseUrl)).outcome).toEqual({ status: "connected" });
  });

  test("stops when the engine refuses the key it was handed", async () => {
    const { baseUrl } = startRecordingServer({
      polls: [{ __status: 502, body: { code: "engine_auth_unconfirmed", message: "no" } }],
    });

    const { outcome } = await run(baseUrl);

    // The key has already been collected from the console, so retrying could not get it back.
    expect(outcome).toEqual({ status: "failed", code: "engine_auth_unconfirmed" });
  });

  test("stops when the user closes the step, and releases the pending connection", async () => {
    const { baseUrl, requests } = startRecordingServer({ polls: [{ status: "pending" }] });

    let polls = 0;
    const { outcome } = await run(baseUrl, {
      isCancelled: () => polls > 0,
      wait: async () => {
        polls += 1;
      },
    });

    expect(outcome).toEqual({ status: "cancelled" });
    expect(requests.some((entry) => entry.pathname === "/redrob-auth/device/cancel")).toBe(true);
  });

  test("gives up on its own deadline even if the server keeps saying pending", async () => {
    const { baseUrl } = startRecordingServer({ polls: [{ status: "pending" }] });

    const { outcome } = await run(baseUrl, { now: () => Date.now() + 10 * 60_000 });

    expect(outcome).toEqual({ status: "expired" });
  });

  test("surfaces a server that would not start a connection at all", async () => {
    const { baseUrl } = startRecordingServer({ polls: [], startStatus: 502 });
    await expect(run(baseUrl)).rejects.toThrow();
  });
});

describe("onboarding wiring", () => {
  const appSrc = join(import.meta.dir, "..", "src");

  test("the key step offers connect first and keeps paste as the fallback", () => {
    const step = readFileSync(
      join(appSrc, "react-app", "domains", "onboarding", "redrob-key-step.tsx"),
      "utf8",
    );
    // The connect button is the primary control; the paste field is behind one press.
    expect(step).toContain('data-testid="redrob-connect"');
    expect(step).toContain('data-testid="redrob-paste-instead"');
    // The paste path is not removed. A machine with no browser still has to be connectable.
    expect(step).toContain('data-testid="redrob-submit-key"');
    expect(step).toContain("welcome.redrob_connect_cta");
  });

  test("the welcome route runs the device loop and still wires the paste path", () => {
    const route = readFileSync(join(appSrc, "react-app", "shell", "welcome-route.tsx"), "utf8");
    expect(route).toContain("runRedrobDeviceConnect");
    expect(route).toContain("connectRedrobKey");
    // Neither path may go back to persisting the credential in Work.
    expect(route).not.toContain("upsertUserEnv");
  });

  test("the Korean primary call to action is the one the product asks for", () => {
    const ko = readFileSync(join(appSrc, "i18n", "locales", "ko.ts"), "utf8");
    const en = readFileSync(join(appSrc, "i18n", "locales", "en.ts"), "utf8");
    expect(ko).toContain('"welcome.redrob_connect_cta": "Redrob로 연결"');
    // Both locales carry every new key, which the locale parity suite also enforces.
    for (const key of [
      "welcome.redrob_connect_cta",
      "welcome.redrob_connect_waiting",
      "welcome.redrob_connect_error_denied",
      "welcome.redrob_connect_error_expired",
      "welcome.redrob_connect_error_failed",
    ]) {
      expect(ko).toContain(key);
      expect(en).toContain(key);
    }
  });

  test("no em dashes in the copy this flow added", () => {
    for (const file of [
      join(appSrc, "i18n", "locales", "ko.ts"),
      join(appSrc, "i18n", "locales", "en.ts"),
    ]) {
      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.includes("welcome.redrob_connect_"));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line).not.toContain("\u2014");
    }
  });

  test("the app and the server agree on which console this is", () => {
    // Two packages, one host. They cannot import from each other, so this is the guard.
    const serverModule = readFileSync(
      join(import.meta.dir, "..", "..", "server", "src", "redrob-device.ts"),
      "utf8",
    );
    expect(serverModule).toContain(`"${REDROB_BASE_URL}"`);
  });
});
