import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  artifactPreviewBasePath,
  artifactPreviewContentType,
  grantArtifactPreviewFolder,
  resolveArtifactPreviewFile,
  resolveArtifactPreviewPage,
} from "./artifact-preview-files.js";
import { SECURE_ARTIFACT_PREVIEW_HTML_SOURCE } from "./artifact-preview-sandbox.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

const stops: Array<() => void | Promise<void>> = [];
const roots: string[] = [];

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

/** A workspace with a multi-file site, a secret above it, and a symlink that tries to leave. */
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "redrob-preview-files-"));
  roots.push(root);
  await mkdir(join(root, "site", "img"), { recursive: true });
  await writeFile(join(root, "site", "index.html"), '<link rel="stylesheet" href="style.css"><img src="img/logo.png">');
  await writeFile(join(root, "site", "style.css"), "h1{color:red}");
  await writeFile(join(root, "site", "img", "logo.png"), "png");
  await writeFile(join(root, "secret.env"), "TOKEN=1");
  await symlink(join(root, "secret.env"), join(root, "site", "leak.css"));
  return root;
}

const secureHtml: (html: string, base?: unknown) => string = new Function(`return ${SECURE_ARTIFACT_PREVIEW_HTML_SOURCE}`)();

describe("artifact preview files", () => {
  test("a grant reaches the page's folder and below, and nothing above or through a symlink", async () => {
    const root = await workspace();
    const grant = grantArtifactPreviewFolder(join(root, "site", "index.html"));

    expect(await resolveArtifactPreviewFile(grant, "style.css")).toEndWith(join("site", "style.css"));
    expect(await resolveArtifactPreviewFile(grant, "img/logo.png")).toEndWith(join("site", "img", "logo.png"));
    for (const path of ["../secret.env", "img/../../secret.env", "/etc/passwd", "leak.css", "img", "missing.css", "a\0b"]) {
      expect(await resolveArtifactPreviewFile(grant, path)).toBeNull();
    }
    expect(await resolveArtifactPreviewFile("0".repeat(32), "style.css")).toBeNull();
  });

  test("a grant expires, and reopening the same page reuses it", async () => {
    const root = await workspace();
    const page = join(root, "site", "index.html");
    const now = Date.now();
    const grant = grantArtifactPreviewFolder(page, now);
    expect(grantArtifactPreviewFolder(page, now + 1000)).toBe(grant);
    expect(await resolveArtifactPreviewFile(grant, "style.css", now + 61 * 60 * 1000)).toBeNull();
  });

  test("a grant is only issued for a file inside the workspace", async () => {
    const root = await workspace();
    expect(await resolveArtifactPreviewPage(root, join(root, "site", "index.html"))).toEndWith(join("site", "index.html"));
    expect(await resolveArtifactPreviewPage(join(root, "site"), join(root, "secret.env"))).toBeNull();
    expect(await resolveArtifactPreviewPage(join(root, "site"), join(root, "site", "leak.css"))).toBeNull();
    expect(await resolveArtifactPreviewPage(root, join(root, "site"))).toBeNull();
  });

  test("stylesheets and scripts get types a browser applies under nosniff", () => {
    expect(artifactPreviewContentType("a/style.css")).toBe("text/css; charset=utf-8");
    expect(artifactPreviewContentType("app.js")).toBe("text/javascript; charset=utf-8");
    expect(artifactPreviewContentType("logo.PNG")).toBe("image/png");
    expect(artifactPreviewContentType("font.woff2")).toBe("font/woff2");
    expect(artifactPreviewContentType("data.bin")).toBe("application/octet-stream");
  });

  test("the page gets a <base> only for a well-formed grant path", () => {
    const base = artifactPreviewBasePath("a".repeat(32));
    expect(secureHtml("<p>", base)).toContain(`<base href="${base}">`);
    for (const bad of ["https://evil.example/", "/artifact-preview/files/x/", '/artifact-preview/files/"><script>/', 7]) {
      expect(secureHtml("<p>", bad)).not.toContain("<base");
    }
  });

  test("the grant route needs the app's token, and the files route serves only what the grant reaches", async () => {
    const root = await workspace();
    const config: ServerConfig = {
      host: "127.0.0.1",
      port: 0,
      token: "client-token",
      hostToken: "host-token",
      configPath: join(root, "server.json"),
      approval: { mode: "auto", timeoutMs: 0 },
      corsOrigins: ["*"],
      workspaces: [{ id: "ws_files", name: "Files", path: root, preset: "starter", workspaceType: "local" }],
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
    const grantUrl = `${base}/workspace/ws_files/artifact-preview/grant`;
    const body = JSON.stringify({ path: "site/index.html" });

    expect((await fetch(grantUrl, { method: "POST", body, headers: { "content-type": "application/json" } })).status).toBe(401);

    const granted = await fetch(grantUrl, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", authorization: "Bearer client-token" },
    });
    expect(granted.status).toBe(200);
    const { basePath } = (await granted.json()) as { basePath: string };
    expect(basePath).toMatch(/^\/artifact-preview\/files\/[0-9a-f]{32}\/$/);

    const css = await fetch(`${base}${basePath}style.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await css.text()).toBe("h1{color:red}");
    expect((await fetch(`${base}${basePath}img/logo.png`)).status).toBe(200);
    expect((await fetch(`${base}${basePath}..%2Fsecret.env`)).status).toBe(404);
    expect((await fetch(`${base}${basePath}leak.css`)).status).toBe(404);

    const outside = await fetch(grantUrl, {
      method: "POST",
      body: JSON.stringify({ path: "../../etc/passwd" }),
      headers: { "content-type": "application/json", authorization: "Bearer client-token" },
    });
    expect(outside.status).toBeGreaterThanOrEqual(400);
  });
});
