import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { isPathInside, resolveWorkspaceFile } from "./workspace-file-access.mjs";

const win = path.win32;
const posix = path.posix;

test("a file inside a known workspace resolves to its absolute path", () => {
  assert.equal(
    resolveWorkspaceFile({ root: "C:\\Users\\x\\Seorin", relativePath: ".opencode/redrob/outbox/notice.docx", knownRoots: ["C:\\Users\\x\\Seorin"], pathApi: win }),
    "C:\\Users\\x\\Seorin\\.opencode\\redrob\\outbox\\notice.docx",
  );
  assert.equal(
    resolveWorkspaceFile({ root: "/home/x/seorin", relativePath: "reports/q3/plan.md", knownRoots: ["/home/x/seorin"], pathApi: posix }),
    "/home/x/seorin/reports/q3/plan.md",
  );
});

test("a root inside an authorized folder is allowed; Windows compares without case", () => {
  assert.equal(
    resolveWorkspaceFile({ root: "c:\\users\\x\\documents\\seorin msa", relativePath: "a.md", knownRoots: ["C:\\Users\\x\\Documents"], pathApi: win }),
    "c:\\users\\x\\documents\\seorin msa\\a.md",
  );
});

test("a relative escape with .. is rejected", () => {
  const known = ["/home/x/seorin"];
  assert.equal(resolveWorkspaceFile({ root: "/home/x/seorin", relativePath: "../secrets.txt", knownRoots: known, pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "/home/x/seorin", relativePath: "a/../../b.txt", knownRoots: known, pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "C:\\w", relativePath: "..\\..\\Windows\\system.ini", knownRoots: ["C:\\w"], pathApi: win }), null);
});

test("an absolute file path, or a root Desk does not know, is rejected", () => {
  assert.equal(resolveWorkspaceFile({ root: "/home/x/seorin", relativePath: "/etc/passwd", knownRoots: ["/home/x/seorin"], pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "C:\\w", relativePath: "D:\\x.txt", knownRoots: ["C:\\w"], pathApi: win }), null);
  assert.equal(resolveWorkspaceFile({ root: "/etc", relativePath: "passwd", knownRoots: ["/home/x/seorin"], pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "/home/x/seorin-other", relativePath: "a.md", knownRoots: ["/home/x/seorin"], pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "relative/root", relativePath: "a.md", knownRoots: ["relative/root"], pathApi: posix }), null);
});

test("empty input, the root itself and null bytes are rejected", () => {
  const known = ["/w"];
  assert.equal(resolveWorkspaceFile({ root: "", relativePath: "a.md", knownRoots: known, pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "/w", relativePath: "", knownRoots: known, pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "/w", relativePath: ".", knownRoots: known, pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "/w", relativePath: "a\0.md", knownRoots: known, pathApi: posix }), null);
  assert.equal(resolveWorkspaceFile({ root: "/w", relativePath: "a.md", knownRoots: [], pathApi: posix }), null);
});

test("isPathInside keeps a name that starts with two dots", () => {
  assert.equal(isPathInside("/w", "/w/..notes/a.md", posix), true);
  assert.equal(isPathInside("/w", "/w", posix), true);
  assert.equal(isPathInside("/w", "/", posix), false);
});
