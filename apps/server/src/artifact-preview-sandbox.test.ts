import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ARTIFACT_PREVIEW_CSP,
  ARTIFACT_PREVIEW_SANDBOX_SCRIPT,
  SECURE_ARTIFACT_PREVIEW_HTML_SOURCE,
} from "./artifact-preview-sandbox.js";
import { ARTIFACT_PREVIEW_LIBRARIES } from "./artifact-preview-vendor.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

const stops: Array<() => void | Promise<void>> = [];
const roots: string[] = [];

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

/** The exact function the proxy runs, evaluated from the same source it is served from. */
const secureHtml: (html: string) => string = new Function(`return ${SECURE_ARTIFACT_PREVIEW_HTML_SOURCE}`)();

describe("artifact preview sandbox", () => {
  test("denies every network destination by default", () => {
    expect(ARTIFACT_PREVIEW_CSP).toContain("default-src 'none'");
    expect(ARTIFACT_PREVIEW_CSP).toContain("connect-src 'none'");
    expect(ARTIFACT_PREVIEW_CSP).toContain("frame-src 'none'");
    expect(ARTIFACT_PREVIEW_CSP).toContain("form-action 'none'");
    expect(ARTIFACT_PREVIEW_CSP).not.toContain("https:");
    expect(ARTIFACT_PREVIEW_CSP).not.toMatch(/(?:^|\s)\*(?:\s|;|$)/);
  });

  test("mounts the page with an opaque origin, never the server's", () => {
    expect(ARTIFACT_PREVIEW_SANDBOX_SCRIPT).toContain('inner.setAttribute("sandbox", "allow-scripts")');
    expect(ARTIFACT_PREVIEW_SANDBOX_SCRIPT).not.toContain("allow-same-origin");
    expect(ARTIFACT_PREVIEW_SANDBOX_SCRIPT).toContain("inner.srcdoc = secureHtml(");
  });

  test("writes the policy and the blocked-resource reporter ahead of the page", () => {
    const page = '<html><head><script src="https://cdn.example.com/widgets.js"></script></head><body>Hi</body></html>';
    const secured = secureHtml(page);
    expect(secured.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(secured).toContain("connect-src 'none'");
    expect(secured).toContain("securitypolicyviolation");
    expect(secured.indexOf("Content-Security-Policy")).toBeLessThan(secured.indexOf("cdn.example.com"));
    expect(secured.endsWith(page)).toBe(true);
  });

  test("points a CDN script tag for a bundled library at the bundled copy", () => {
    const cases: Array<[string, string]> = [
      ['<script src="https://cdn.tailwindcss.com"></script>', "tailwind.js"],
      ['<script src="https://cdn.tailwindcss.com/3.4.1?plugins=forms"></script>', "tailwind.js"],
      ['<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>', "tailwind.js"],
      ['<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>', "chart.js"],
      ['<script src="https://unpkg.com/chart.js@4.4.0/dist/chart.umd.js"></script>', "chart.js"],
      ["<script src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'></script>", "chart.js"],
      ['<script src="https://d3js.org/d3.v7.min.js"></script>', "d3.js"],
      ['<script src="//cdn.jsdelivr.net/npm/d3@7"></script>', "d3.js"],
      ['<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>', "alpine.js"],
      ['<script src="https://unpkg.com/lucide@latest"></script>', "lucide.js"],
    ];
    for (const [tag, file] of cases) {
      expect(secureHtml(tag)).toContain(`src="/artifact-preview/vendor/${file}"`);
    }
  });

  test("drops the CDN's integrity hash with the URL, and keeps the tag's other attributes", () => {
    const secured = secureHtml(
      '<script defer src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0" integrity="sha384-abc" crossorigin="anonymous" data-x="1"></script>',
    );
    const tag = secured.slice(secured.lastIndexOf("<script"));
    expect(tag).toContain('src="/artifact-preview/vendor/chart.js"');
    expect(tag).toContain("defer");
    expect(tag).toContain('data-x="1"');
    expect(tag).not.toContain("integrity");
    expect(tag).not.toContain("crossorigin");
  });

  test("leaves anything that is not a bundled library alone, for the policy to block", () => {
    for (const tag of [
      '<script src="https://cdn.jsdelivr.net/npm/d3-scale@4"></script>',
      '<script src="https://unpkg.com/lucide-react"></script>',
      '<script src="https://cdn.jsdelivr.net/npm/chart.jsx"></script>',
      '<script src="https://evil.example.com/cdn.tailwindcss.com.js"></script>',
      '<script src="https://cdn.tailwindcss.com.evil.example/x.js"></script>',
      '<script src="./local.js"></script>',
    ]) {
      expect(secureHtml(tag).endsWith(tag)).toBe(true);
    }
  });

  test("keeps a leading doctype first, so the page does not drop into quirks mode", () => {
    const secured = secureHtml("<!DOCTYPE html>\n<html><body>Hi</body></html>");
    expect(secured.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(secured.indexOf("Content-Security-Policy")).toBeGreaterThan(0);
    expect(secured.indexOf("Content-Security-Policy")).toBeLessThan(secured.indexOf("<html>"));
  });

  test("serves the proxy unauthenticated with the policy as an HTTP header", async () => {
    const root = await mkdtemp(join(tmpdir(), "redrob-artifact-preview-"));
    roots.push(root);
    const config: ServerConfig = {
      host: "127.0.0.1",
      port: 0,
      token: "client-token",
      hostToken: "host-token",
      configPath: join(root, "server.json"),
      approval: { mode: "auto", timeoutMs: 0 },
      corsOrigins: ["*"],
      workspaces: [{ id: "ws_preview", name: "Preview", path: root, preset: "starter", workspaceType: "local" }],
      authorizedRoots: [root],
      readOnly: false,
      startedAt: Date.now(),
      tokenSource: "generated",
      hostTokenSource: "generated",
      logFormat: "pretty",
      logRequests: false,
    };
    const server = await startServer(config);
    stops.push(() => server.stop());
    const base = `http://127.0.0.1:${server.port}`;

    const response = await fetch(`${base}/artifact-preview/sandbox.html?hostOrigin=${encodeURIComponent("http://localhost:5173")}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(ARTIFACT_PREVIEW_CSP);
    expect(await response.text()).toContain("/artifact-preview/sandbox.js");

    const script = await fetch(`${base}/artifact-preview/sandbox.js`);
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(await script.text()).toBe(ARTIFACT_PREVIEW_SANDBOX_SCRIPT);

    for (const library of ARTIFACT_PREVIEW_LIBRARIES) {
      const response = await fetch(`${base}/artifact-preview/vendor/${library.file}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/javascript");
      expect((await response.text()).length).toBeGreaterThan(10_000);
    }
    expect((await fetch(`${base}/artifact-preview/vendor/..%2F..%2Fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/artifact-preview/vendor/react.js`)).status).toBe(404);
  });
});
