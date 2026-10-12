import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Libraries a model-written page commonly loads from a CDN, shipped with the app instead.
 *
 * The preview denies every network destination (artifact-preview-sandbox.ts), so a page that loads
 * Tailwind or Chart.js from a CDN would render unstyled and without charts. Rather than allow those
 * hosts, which serve whatever anyone publishes and would each become an outbound-access entry, the
 * preview rewrites a script tag that names one of these to the copy this server bundles. Only the
 * preview is rewritten: the file on disk keeps its CDN URL and still works in a normal browser.
 *
 * One bundled version per library. A page pinned to an older major gets the current one, which is
 * the right trade for a preview: close enough to judge the page, and nothing leaves the machine.
 */

const require = createRequire(import.meta.url);

/** jsDelivr's and unpkg's npm paths, with or without a scheme: `<host>/npm/<pkg>` or `<host>/<pkg>`, optionally `@version`, then a path. */
function npmCdn(pkg: string): RegExp {
  const name = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`^(?:https?:)?//(?:cdn\\.jsdelivr\\.net/npm|unpkg\\.com)/${name}(?:@[^/?#]*)?(?:[/?#].*)?$`, "i");
}

function cdnjs(library: string): RegExp {
  return new RegExp(`^(?:https?:)?//cdnjs\\.cloudflare\\.com/ajax/libs/${library}/`, "i");
}

type VendorLibrary = {
  /** The file name the preview serves it under, at `/artifact-preview/vendor/<file>`. */
  file: string;
  /** Script URLs this copy stands in for. */
  matches: RegExp[];
  /** Where the bundled build is on disk. Resolved through the package so it follows its version. */
  path: () => string;
};

export const ARTIFACT_PREVIEW_LIBRARIES: readonly VendorLibrary[] = [
  {
    file: "tailwind.js",
    matches: [/^(?:https?:)?\/\/cdn\.tailwindcss\.com(?:[/?#].*)?$/i, npmCdn("@tailwindcss/browser")],
    path: () => require.resolve("@tailwindcss/browser"),
  },
  {
    file: "chart.js",
    matches: [npmCdn("chart.js"), cdnjs("Chart\\.js")],
    path: () => join(dirname(require.resolve("chart.js")), "chart.umd.min.js"),
  },
  {
    file: "d3.js",
    matches: [npmCdn("d3"), cdnjs("d3"), /^(?:https?:)?\/\/d3js\.org\/d3(?:\.v\d+)?(?:\.min)?\.js$/i],
    path: () => join(dirname(require.resolve("d3")), "..", "dist", "d3.min.js"),
  },
  {
    file: "alpine.js",
    matches: [npmCdn("alpinejs"), cdnjs("alpinejs")],
    path: () => require.resolve("alpinejs/dist/cdn.min.js"),
  },
  {
    file: "lucide.js",
    matches: [npmCdn("lucide")],
    path: () => require.resolve("lucide/dist/umd/lucide.min.js"),
  },
];

/** The rewrite rules as plain data, for the proxy script that runs in the browser. */
export const ARTIFACT_PREVIEW_LIBRARY_RULES = ARTIFACT_PREVIEW_LIBRARIES.map((library) => ({
  file: library.file,
  matches: library.matches.map((pattern) => pattern.source),
}));

const cache = new Map<string, Promise<string>>();

/** The bundled source for a vendor file name, or null when the name is not one of ours. */
export function readArtifactPreviewLibrary(file: string): Promise<string> | null {
  const library = ARTIFACT_PREVIEW_LIBRARIES.find((candidate) => candidate.file === file);
  if (!library) return null;
  const cached = cache.get(file);
  if (cached) return cached;
  const source = readFile(library.path(), "utf8");
  cache.set(file, source);
  source.catch(() => cache.delete(file));
  return source;
}
