import path from "node:path";

/** True when `target` is `root` itself or inside it. `path.relative` is case-insensitive on Windows. */
export function isPathInside(root, target, pathApi = path) {
  const rel = pathApi.relative(root, target);
  if (rel === "") return true;
  if (pathApi.isAbsolute(rel)) return false;
  return rel !== ".." && !rel.startsWith(`..${pathApi.sep}`);
}

/**
 * The absolute file a workspace-relative path names, for Open and Show in folder from the
 * Desk side panel. Null unless `root` is absolute and inside one of `knownRoots` (the local
 * workspaces and the folders they authorize) and the file resolves inside `root`, so a
 * renderer cannot open or reveal anything outside the folders Desk may use.
 */
export function resolveWorkspaceFile({ root, relativePath, knownRoots, pathApi = path }) {
  const rootValue = String(root ?? "").trim();
  const relValue = String(relativePath ?? "").trim();
  if (!rootValue || !relValue || rootValue.includes("\0") || relValue.includes("\0")) return null;
  if (!pathApi.isAbsolute(rootValue) || pathApi.isAbsolute(relValue)) return null;
  const resolvedRoot = pathApi.resolve(rootValue);
  const known = knownRoots.filter((entry) => typeof entry === "string" && entry.trim() && pathApi.isAbsolute(entry.trim()));
  if (!known.some((entry) => isPathInside(pathApi.resolve(entry.trim()), resolvedRoot, pathApi))) return null;
  const target = pathApi.resolve(resolvedRoot, relValue);
  if (target === resolvedRoot || !isPathInside(resolvedRoot, target, pathApi)) return null;
  return target;
}
