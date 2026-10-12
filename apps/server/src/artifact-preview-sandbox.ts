import { ARTIFACT_PREVIEW_LIBRARY_RULES } from "./artifact-preview-vendor.js";

/**
 * The sandbox a model-written HTML page is previewed in.
 *
 * The preview used to be an iframe on the app's own origin with `allow-scripts allow-same-origin` and
 * no Content Security Policy, so a page the agent wrote ran with the app's privileges and could reach
 * any host. That matters more here than for a web page: the privacy gate puts real values back into
 * the files the agent writes, so a generated report holds real personal data, and a page shaped by a
 * prompt injection could post it anywhere.
 *
 * The shape follows the MCP Apps sandbox (mcp-app-sandbox.ts): a proxy document served from this
 * server, which is a different origin from the app, mounts the page in an inner iframe with an opaque
 * origin. Its policy denies every network destination. The proxy's own policy is inherited by the
 * inner `srcdoc` document, and the same policy is also written into the page as a meta tag, so a
 * browser that did not inherit it would still apply it.
 */

/**
 * Deny by default. `'self'` is this server, which serves nothing a page can read without a token.
 *
 * `'unsafe-eval'` is allowed because Alpine.js evaluates its `x-data` expressions with `new Function`,
 * and it grants nothing a page does not already have: inline scripts run, so a page can already run
 * any code it likes. What the policy exists for, keeping that code off the network, is unchanged.
 */
export const ARTIFACT_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * Counts what the policy blocked and tells the proxy, so a page that expected a CDN is shown with a
 * note instead of looking silently broken. Runs inside the page; a page that forges the message can
 * only change a number on its own notice.
 */
const BLOCKED_RESOURCE_REPORTER = String.raw`<script>(()=>{let n=0;document.addEventListener("securitypolicyviolation",()=>{n+=1;parent.postMessage({method:"redrob/artifact-preview/blocked",params:{count:n}},"*")})})()</script>`;

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

const PRELUDE = `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(ARTIFACT_PREVIEW_CSP)}">${BLOCKED_RESOURCE_REPORTER}`;

/**
 * The page with the policy and the reporter placed first, after a leading doctype if there is one,
 * and any script tag naming a bundled library pointed at the copy this server ships
 * (artifact-preview-vendor.ts). Its `integrity` and `crossorigin` go with it: they describe the CDN's
 * file, and a hash for a different build would block the bundled one. Plain JavaScript in a string because it runs inside the proxy document; the tests evaluate this
 * same string, so there is one copy of it.
 *
 * Model-written HTML is not always well formed, so this does not look for `<head>`. A `<meta>` or
 * `<script>` before `<html>` is legal: the parser opens `<html>` and `<head>` implicitly and puts both
 * inside, ahead of anything the page itself declares.
 */
export const SECURE_ARTIFACT_PREVIEW_HTML_SOURCE = String.raw`(source) => {
  const prelude = ${JSON.stringify(PRELUDE)};
  const rules = ${JSON.stringify(ARTIFACT_PREVIEW_LIBRARY_RULES)}.map((rule) => ({
    file: rule.file,
    matches: rule.matches.map((pattern) => new RegExp(pattern, "i")),
  }));
  const html = source.replace(/<script\b[^>]*>/gi, (tag) => {
    const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const url = src ? (src[1] ?? src[2] ?? src[3] ?? "").trim() : "";
    const rule = url ? rules.find((candidate) => candidate.matches.some((pattern) => pattern.test(url))) : null;
    if (!rule) return tag;
    return tag
      .replace(src[0], ' src="/artifact-preview/vendor/' + rule.file + '"')
      .replace(/\s(?:integrity|crossorigin)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
  });
  const doctype = /^﻿?\s*<!doctype[^>]*>/i.exec(html);
  if (!doctype) return prelude + html;
  const end = doctype.index + doctype[0].length;
  return html.slice(0, end) + prelude + html.slice(end);
}`;

export const ARTIFACT_PREVIEW_SANDBOX_SCRIPT = String.raw`
(() => {
  if (window.self === window.top) throw new Error("Invalid artifact preview embedding context.");
  const declaredHostOrigin = new URL(window.location.href).searchParams.get("hostOrigin");
  const referrerOrigin = document.referrer ? new URL(document.referrer).origin : null;
  if (declaredHostOrigin && referrerOrigin && declaredHostOrigin !== referrerOrigin) throw new Error("Artifact preview host origin mismatch.");
  const hostOrigin = referrerOrigin || declaredHostOrigin;
  if (!hostOrigin) throw new Error("Artifact preview host origin is unavailable.");
  const hostTargetOrigin = hostOrigin === "null" ? "*" : hostOrigin;
  const secureHtml = ${SECURE_ARTIFACT_PREVIEW_HTML_SOURCE};
  const inner = document.createElement("iframe");
  inner.title = "Preview";
  inner.style.cssText = "display:block;width:100%;height:100%;border:0;background:#fff";
  // Scripts only: the page gets an opaque origin, never this server's.
  inner.setAttribute("sandbox", "allow-scripts");
  inner.setAttribute("referrerpolicy", "no-referrer");
  document.body.appendChild(inner);
  window.addEventListener("message", (event) => {
    if (event.source === window.parent && event.origin === hostOrigin) {
      if (event.data?.method === "redrob/artifact-preview/render" && typeof event.data?.params?.html === "string") {
        inner.srcdoc = secureHtml(event.data.params.html);
      }
      return;
    }
    if (event.source === inner.contentWindow && event.data?.method === "redrob/artifact-preview/blocked") {
      const count = Number(event.data?.params?.count);
      if (Number.isFinite(count) && count > 0) {
        window.parent.postMessage({ method: "redrob/artifact-preview/blocked", params: { count: Math.floor(count) } }, hostTargetOrigin);
      }
    }
  });
  window.parent.postMessage({ method: "redrob/artifact-preview/ready", params: {} }, hostTargetOrigin);
})();
`;

export const ARTIFACT_PREVIEW_SANDBOX_HTML = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden}</style><title>Preview</title></head><body><script src=\"/artifact-preview/sandbox.js\"></script></body></html>";
