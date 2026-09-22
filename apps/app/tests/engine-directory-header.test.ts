import { afterEach, describe, expect, mock, test } from "bun:test";

type CapturedClientOptions = {
  baseUrl?: string;
  directory?: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
};

let capturedOptions: CapturedClientOptions | null = null;

async function unusedSessionMethod() {
  throw new Error("SDK mock method should not be called");
}

mock.module("@redrob-labs/sdk/v2/client", () => ({
  createRedrobClient: (options: CapturedClientOptions) => {
    capturedOptions = options;
    return {
      session: {
        list: unusedSessionMethod,
        get: unusedSessionMethod,
        messages: unusedSessionMethod,
        todo: unusedSessionMethod,
        promptAsync: unusedSessionMethod,
        command: unusedSessionMethod,
      },
    };
  },
}));

const { createClient } = await import("../src/app/lib/opencode");

const originalFetch = globalThis.fetch;

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
  capturedOptions = null;
});

/**
 * Redrob Code routes every request on `x-redrob-directory`. The upstream SDK's
 * `directory` option emits `x-opencode-directory`, which the engine silently
 * ignores, so the app must set the Redrob header itself and must not hand the
 * directory to the SDK.
 */
describe("browser engine client directory header", () => {
  test("sets x-redrob-directory and never passes directory to the SDK", () => {
    createClient("http://127.0.0.1:4096", "/tmp/redrob-workspace");

    expect(capturedOptions?.headers?.["x-redrob-directory"]).toBe("/tmp/redrob-workspace");
    expect(capturedOptions?.headers?.["x-opencode-directory"]).toBeUndefined();
    expect(capturedOptions?.directory).toBeUndefined();
  });

  test("percent-encodes a non-ASCII workspace directory", () => {
    createClient("http://127.0.0.1:4096", "/tmp/작업공간");

    expect(capturedOptions?.headers?.["x-redrob-directory"]).toBe(encodeURIComponent("/tmp/작업공간"));
  });

  test("omits the header when no directory is supplied", () => {
    createClient("http://127.0.0.1:4096");

    expect(capturedOptions?.headers?.["x-redrob-directory"]).toBeUndefined();
  });

  test("sends x-redrob-directory on the direct prompt_async POST path", async () => {
    const seen: Array<{ url: string; redrob: string | null; opencode: string | null }> = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen.push({
          url: String(input),
          redrob: headers.get("x-redrob-directory"),
          opencode: headers.get("x-opencode-directory"),
        });
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    const client = createClient("http://127.0.0.1:4096", "/tmp/redrob-workspace");
    const session = client.session as unknown as {
      promptAsync: (parameters: { sessionID: string; reasoning_effort?: string }) => Promise<unknown>;
    };
    await session.promptAsync({ sessionID: "ses_1", reasoning_effort: "high" });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("http://127.0.0.1:4096/session/ses_1/prompt_async");
    expect(seen[0]?.redrob).toBe("/tmp/redrob-workspace");
    expect(seen[0]?.opencode).toBeNull();
  });
});
