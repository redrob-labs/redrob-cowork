import { randomBytes } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * The files beside a previewed page: its stylesheets, scripts, images and fonts.
 *
 * The page renders from `srcdoc` on the sandbox origin with an opaque origin of its own, so a relative
 * `<link href="style.css">` had nothing to resolve against and a multi-file page rendered bare. The
 * preview now gives the page a `<base>` under `/artifact-preview/files/<grant>/`, and this serves the
 * folder the page sits in, read only.
 *
 * The page cannot present the app's token, so access is a capability: the app, which is authenticated,
 * asks for a grant naming one page, and the grant is an unguessable id for that page's folder, valid for
 * an hour. It reaches that folder and what is below it, and nothing above: `../shared.css` is outside
 * the grant and 404s, like a path that escapes through a symlink. The sandbox still denies the network,
 * so what the page can read here, it can only show.
 */

const GRANT_TTL_MS = 60 * 60 * 1000;
const MAX_GRANTS = 200;

type Grant = { root: string; expiresAt: number };

const grants = new Map<string, Grant>();

/** A grant for the folder holding `pagePath`, reused while it lasts, so reopening a preview adds nothing. */
export function grantArtifactPreviewFolder(pagePath: string, now = Date.now()): string {
  const root = dirname(pagePath);
  for (const [id, grant] of grants) {
    if (grant.expiresAt <= now) grants.delete(id);
    else if (grant.root === root) return id;
  }
  while (grants.size >= MAX_GRANTS) {
    const oldest = grants.keys().next().value;
    if (oldest === undefined) break;
    grants.delete(oldest);
  }
  const id = randomBytes(16).toString("hex");
  grants.set(id, { root, expiresAt: now + GRANT_TTL_MS });
  return id;
}

/**
 * The real path of a page a grant may be issued for: a regular file inside the workspace, after
 * symlinks. Null otherwise, so a grant can never be anchored on a folder outside the workspace.
 */
export async function resolveArtifactPreviewPage(workspaceRoot: string, pagePath: string): Promise<string | null> {
  try {
    const [realRoot, realPage] = await Promise.all([realpath(workspaceRoot), realpath(pagePath)]);
    const rel = relative(realRoot, realPage);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
    if (!(await stat(realPage)).isFile()) return null;
    return realPage;
  } catch {
    return null;
  }
}

export const ARTIFACT_PREVIEW_FILES_PREFIX = "/artifact-preview/files/";

/** The `<base>` a page is given, so its relative references land on its own folder. */
export function artifactPreviewBasePath(grantId: string): string {
  return `${ARTIFACT_PREVIEW_FILES_PREFIX}${grantId}/`;
}

/**
 * The file a granted request names, or null for an unknown or expired grant, a path outside the grant's
 * folder (by `..` or through a symlink), or anything that is not a regular file.
 */
export async function resolveArtifactPreviewFile(grantId: string, requested: string, now = Date.now()): Promise<string | null> {
  const grant = grants.get(grantId);
  if (!grant || grant.expiresAt <= now) return null;
  if (!requested || requested.includes("\0") || isAbsolute(requested)) return null;
  const candidate = resolve(grant.root, requested);
  const inside = (root: string, path: string) => {
    const rel = relative(root, path);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) && !rel.split(sep).includes("..");
  };
  if (!inside(grant.root, candidate)) return null;
  try {
    const [realRoot, realFile] = await Promise.all([realpath(grant.root), realpath(candidate)]);
    if (!inside(realRoot, realFile)) return null;
    if (!(await stat(realFile)).isFile()) return null;
    return realFile;
  } catch {
    return null;
  }
}

/**
 * Types for what a page loads. Its own table, not the workspace file route's: that one serves `.css` and
 * `.js` as text, and with `nosniff` a browser refuses to apply a stylesheet or run a script served so.
 */
const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

export function artifactPreviewContentType(path: string): string {
  const dot = path.lastIndexOf(".");
  return (dot >= 0 && PREVIEW_CONTENT_TYPES[path.slice(dot).toLowerCase()]) || "application/octet-stream";
}

export async function streamArtifactPreviewFile(path: string, contentType: string): Promise<Response> {
  return new Response(await readFile(path), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
