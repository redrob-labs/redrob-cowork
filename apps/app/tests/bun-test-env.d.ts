/*
 * The Bun the tests use, for `tsconfig.test.json`: `bun:test`, the `Bun` namespace (for `Bun.serve`)
 * and `import.meta.dir`. Not the whole of `bun-types`, whose globals redeclare `fetch` with a Bun-only
 * `preconnect` and would reject the app's own fetch wrappers, which run in a browser, not in Bun.
 */
/// <reference path="../node_modules/bun-types/test.d.ts" />
/// <reference path="../node_modules/bun-types/bun.d.ts" />
/// <reference path="../node_modules/bun-types/serve.d.ts" />
/// <reference path="../node_modules/bun-types/bun.ns.d.ts" />

interface ImportMeta {
  /** The directory of the current file, as Bun sets it. */
  readonly dir: string;
}
