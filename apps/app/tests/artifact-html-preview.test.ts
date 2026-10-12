import { describe, expect, test } from "bun:test";

import { createRedrobServerClient } from "../src/app/lib/redrob-server";
import { readArtifactPreviewMessage } from "../src/react-app/domains/session/artifacts/preview";

describe("HTML artifact preview", () => {
  test("is served from the server, at an origin that is never the app's", () => {
    const client = createRedrobServerClient({ baseUrl: "http://127.0.0.1:8787", token: "t" });

    const fromApp = client.artifactPreviewSandbox("http://localhost:5173");
    expect(fromApp.url).toStartWith("http://127.0.0.1:8787/artifact-preview/sandbox.html?");
    expect(fromApp.expectedOrigin).toBe("http://127.0.0.1:8787");

    const sameOrigin = client.artifactPreviewSandbox("http://127.0.0.1:8787");
    expect(sameOrigin.expectedOrigin).toBe("http://localhost:8787");
    expect(new URL(sameOrigin.url).searchParams.get("hostOrigin")).toBe("http://127.0.0.1:8787");
  });

  test("reads only the two messages the sandbox sends", () => {
    expect(readArtifactPreviewMessage({ method: "redrob/artifact-preview/ready", params: {} })).toEqual({
      method: "redrob/artifact-preview/ready",
    });
    expect(readArtifactPreviewMessage({ method: "redrob/artifact-preview/blocked", params: { count: 3 } })).toEqual({
      method: "redrob/artifact-preview/blocked",
      count: 3,
    });
    for (const data of [
      null,
      "ready",
      { method: "redrob/artifact-preview/blocked", params: { count: 0 } },
      { method: "redrob/artifact-preview/blocked", params: { count: 1.5 } },
      { method: "redrob/artifact-preview/blocked", params: { count: "3" } },
      { method: "redrob/artifact-preview/render", params: { html: "<p>" } },
    ]) {
      expect(readArtifactPreviewMessage(data)).toBeNull();
    }
  });
});
