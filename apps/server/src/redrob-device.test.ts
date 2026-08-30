import { describe, expect, test } from "bun:test";

import {
  createRedrobDeviceConnections,
  REDROB_CONSOLE_API_BASE_URL,
  REDROB_DEVICE_PRODUCT,
} from "./redrob-device.js";

/**
 * The conversation with the console's device authorization endpoints.
 *
 * What is worth pinning down here is not the happy path, which is three requests, but the refusals.
 * This module is the only thing between "the console said no" and Work writing a credential into the
 * engine, so every refusal has to come out of it as itself, exactly once, and never as another
 * attempt. The cases below are written against a stand-in console so each answer can be produced
 * deliberately, including the ones a real console would only give under a race.
 */

// Never a real credential. Asserted on by value, so it has to stay a fixture.
const FAKE_KEY = "rrk_test_not_a_real_key";
const DEVICE_CODE = "device-code-fixture";

type ConsoleAnswer =
  | { kind: "authorize"; body: Record<string, unknown>; status?: number }
  | { kind: "token"; body: Record<string, unknown>; status?: number }
  | { kind: "network-error" };

/**
 * A console that answers from a script, so a suite can queue "pending, pending, approved" and assert
 * what Work did with each. Records every request, which is how the device code is checked to be the
 * only thing sent and the caller's product to be forwarded.
 */
function fakeConsole(script: ConsoleAnswer[]) {
  const requests: Array<{ path: string; body: unknown }> = [];
  let index = 0;

  const fetchImpl = async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    requests.push({ path, body });

    const answer = script[index] ?? script[script.length - 1];
    index += 1;
    if (!answer || answer.kind === "network-error") {
      throw new Error("network is down");
    }
    return Response.json(answer.body, { status: answer.status ?? 200 });
  };

  return { fetchImpl, requests };
}

const authorized = (overrides: Record<string, unknown> = {}): ConsoleAnswer => ({
  kind: "authorize",
  body: {
    deviceCode: DEVICE_CODE,
    userCode: "K7QM-2XR9",
    verificationUri: "https://console.redrob.ai/connect",
    verificationUriComplete: "https://console.redrob.ai/connect?code=K7QM-2XR9",
    expiresIn: 600,
    interval: 5,
    ...overrides,
  },
});

const refused = (error: string, status = 400): ConsoleAnswer => ({
  kind: "token",
  body: { error, error_description: "because" },
  status,
});

function connections(script: ConsoleAnswer[], now?: () => number) {
  const console_ = fakeConsole(script);
  let seq = 0;
  return {
    ...console_,
    device: createRedrobDeviceConnections({
      fetchImpl: console_.fetchImpl,
      baseUrl: "https://console.example.test/api/backend/v1",
      now,
      newId: () => `conn-${(seq += 1)}`,
    }),
  };
}

describe("the console this points at", () => {
  test("is the same host the inference calls use", () => {
    // A device flow against one console and inference against another fails as if the key were bad.
    expect(REDROB_CONSOLE_API_BASE_URL).toBe("https://console.redrob.ai/api/backend/v1");
    expect(REDROB_DEVICE_PRODUCT).toBe("work");
  });
});

describe("start", () => {
  test("asks for a code, forwards the product, and keeps the device code to itself", async () => {
    const { device, requests } = connections([authorized()]);

    const started = await device.start();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe("/api/backend/v1/device/authorize");
    expect(requests[0]?.body).toEqual({ product: "work" });

    expect(started.userCode).toBe("K7QM-2XR9");
    expect(started.verificationUriComplete).toBe(
      "https://console.redrob.ai/connect?code=K7QM-2XR9",
    );
    expect(started.intervalMs).toBe(5_000);
    expect(started.expiresAt).toBeGreaterThan(Date.now());
    // The renderer gets an opaque id. The device code is the bearer of the connection.
    expect(JSON.stringify(started)).not.toContain(DEVICE_CODE);
  });

  test("names a different product when one is given", async () => {
    const { device, requests } = connections([authorized()]);
    await device.start("office");
    expect(requests[0]?.body).toEqual({ product: "office" });
  });

  test("falls back to the bare page when the console sends no prefilled form", async () => {
    const { device } = connections([authorized({ verificationUriComplete: "" })]);
    const started = await device.start();
    // Typing the code into the bare page is the same flow, so this is not worth failing over.
    expect(started.verificationUriComplete).toBe("https://console.redrob.ai/connect");
  });

  test("refuses to pretend a connection started when the console left out the code", async () => {
    const { device } = connections([authorized({ userCode: "" })]);
    await expect(device.start()).rejects.toThrow(/usable connection code/i);
    expect(device.pendingCount()).toBe(0);
  });

  test("reports a console that could not be reached, and holds nothing", async () => {
    const { device } = connections([{ kind: "network-error" }]);
    await expect(device.start()).rejects.toThrow(/console.redrob.ai/);
    expect(device.pendingCount()).toBe(0);
  });

  test("reports a console that refused to start one", async () => {
    const { device } = connections([{ kind: "authorize", body: { message: "no" }, status: 400 }]);
    await expect(device.start()).rejects.toThrow(/would not start/i);
  });

  test("stops a caller from stacking up pending connections without end", async () => {
    const { device } = connections([authorized()]);
    for (let attempt = 0; attempt < 8; attempt += 1) await device.start();
    expect(device.pendingCount()).toBe(8);
    await expect(device.start()).rejects.toThrow(/already waiting/i);
  });
});

describe("poll", () => {
  test("sends only the device code, and hands back the key once approved", async () => {
    const { device, requests } = connections([
      authorized(),
      refused("authorization_pending"),
      { kind: "token", body: { apiKey: FAKE_KEY, accountName: "Acme" } },
    ]);

    const started = await device.start();
    expect(await device.poll(started.id)).toEqual({ status: "pending" });
    expect(await device.poll(started.id)).toEqual({ status: "connected", key: FAKE_KEY });

    expect(requests.slice(1).map((entry) => entry.path)).toEqual([
      "/api/backend/v1/device/token",
      "/api/backend/v1/device/token",
    ]);
    expect(requests[1]?.body).toEqual({ deviceCode: DEVICE_CODE });
  });

  test("a key can only be collected once", async () => {
    const { device } = connections([
      authorized(),
      { kind: "token", body: { apiKey: FAKE_KEY } },
    ]);
    const started = await device.start();

    expect(await device.poll(started.id)).toEqual({ status: "connected", key: FAKE_KEY });
    // The record is dropped as the key is handed over, so a repeat cannot produce it again.
    expect(await device.poll(started.id)).toEqual({ status: "expired" });
    expect(device.pendingCount()).toBe(0);
  });

  test("passes the console's pacing request through rather than absorbing it", async () => {
    const { device } = connections([authorized(), refused("slow_down")]);
    const started = await device.start();
    expect(await device.poll(started.id)).toEqual({ status: "slow_down" });
    // Still pending: being told to slow down is not being told to stop.
    expect(device.pendingCount()).toBe(1);
  });

  test("a refusal is final, and stays refused", async () => {
    const { device, requests } = connections([authorized(), refused("access_denied", 403)]);
    const started = await device.start();

    expect(await device.poll(started.id)).toEqual({ status: "denied" });
    // The record is gone, so polling on cannot reach the console again for the same code.
    expect(await device.poll(started.id)).toEqual({ status: "expired" });
    expect(requests.filter((entry) => entry.path.endsWith("/device/token"))).toHaveLength(1);
  });

  test("an expiry the console reports is reported as an expiry", async () => {
    const { device } = connections([authorized(), refused("expired_token")]);
    const started = await device.start();
    expect(await device.poll(started.id)).toEqual({ status: "expired" });
  });

  test("a code the console will never honour fails, rather than being retried", async () => {
    const { device } = connections([authorized(), refused("invalid_grant")]);
    const started = await device.start();
    // invalid_grant means this device code is finished. Nothing here turns it into another attempt.
    expect(await device.poll(started.id)).toEqual({ status: "failed", code: "invalid_grant" });
    expect(device.pendingCount()).toBe(0);
  });

  test("an error the console did not name still stops, with the status to show why", async () => {
    const { device } = connections([authorized(), { kind: "token", body: {}, status: 500 }]);
    const started = await device.start();
    expect(await device.poll(started.id)).toEqual({ status: "failed", code: "http_500" });
  });

  test("a success with no key in it is a failure, not an empty credential", async () => {
    const { device } = connections([authorized(), { kind: "token", body: { apiKey: "  " } }]);
    const started = await device.start();
    expect(await device.poll(started.id)).toEqual({ status: "failed", code: "missing_key" });
  });

  test("a lost network stays pending, because that is worth retrying", async () => {
    const { device } = connections([authorized(), { kind: "network-error" }]);
    const started = await device.start();
    expect(await device.poll(started.id)).toEqual({ status: "unreachable" });
    // Deliberately kept: a blip must not throw away a code the user is about to approve.
    expect(device.pendingCount()).toBe(1);
  });

  test("stops on its own deadline without asking the console", async () => {
    let clock = 1_000;
    const { device, requests } = connections([authorized({ expiresIn: 1 })], () => clock);
    const started = await device.start();

    clock += 1_500;
    expect(await device.poll(started.id)).toEqual({ status: "expired" });
    // Only the authorize call was made: an expired code is not worth a round trip.
    expect(requests).toHaveLength(1);
  });

  test("an id we never issued is answered without reaching the console", async () => {
    const { device, requests } = connections([authorized()]);
    expect(await device.poll("not-a-connection")).toEqual({ status: "expired" });
    expect(requests).toHaveLength(0);
  });
});

describe("cancel", () => {
  test("drops the record, so a later poll cannot land a key", async () => {
    const { device, requests } = connections([
      authorized(),
      { kind: "token", body: { apiKey: FAKE_KEY } },
    ]);
    const started = await device.start();

    expect(device.cancel(started.id)).toBe(true);
    expect(await device.poll(started.id)).toEqual({ status: "expired" });
    expect(requests).toHaveLength(1);
    expect(device.cancel(started.id)).toBe(false);
  });
});
