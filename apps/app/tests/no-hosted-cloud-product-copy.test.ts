import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * There is no hosted "Redrob Cowork Cloud" control-plane product. The name is a
 * leftover from the fork's Cloud/Enterprise tiers, and copy that still promises
 * it describes something a user cannot buy, install, or reach.
 *
 * `apps/server/src/opencode-plugins/redrob-extensions-preview.test.ts` and
 * `redrob-capabilities-knowledge.test.ts` already keep the phrase out of the
 * prompts the engine sends. This guard extends the same rule to the copy
 * surfaces a user reads: the translation bundles, the in-app capability
 * catalog, the roadmap component, and the docs that describe the runtime.
 */
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

/** Copy surfaces a user reads, in app and in docs. */
const GUARDED_COPY_SURFACES = [
  "apps/app/src/i18n/locales/en.ts",
  "apps/app/src/i18n/locales/ko.ts",
  "apps/app/src/react-app/shell/control/control-provider.tsx",
  "packages/ui/src/react/roadmap.tsx",
  "docs/features/remote-mcp-apps/README.md",
  "docs/enterprise/outbound-access.json",
  "packages/enterprise-mcp-client/README.md",
];

/**
 * `packages/docs/changelog.mdx` is generated from dated release trackers by
 * `scripts/generate-changelog.mjs`. Rewriting shipped release notes would
 * falsify the record and would be overwritten on the next generation, so the
 * historical entries keep their original wording and stay out of this guard.
 */
const HISTORICAL_RECORD = "packages/docs/changelog.mdx";

const BANNED = ["Redrob Cowork Cloud", "OpenWork Cloud", "레드롭 코워크 클라우드"];

describe("no hosted Cloud product copy", () => {
  test("every guarded copy surface exists", () => {
    const missing = GUARDED_COPY_SURFACES.filter((path) => !existsSync(join(REPO_ROOT, path)));
    expect(missing).toEqual([]);
  });

  test("no user-facing copy surface names a hosted Cloud product", () => {
    const violations: string[] = [];

    for (const path of GUARDED_COPY_SURFACES) {
      const source = readFileSync(join(REPO_ROOT, path), "utf8");
      source.split("\n").forEach((line, index) => {
        for (const phrase of BANNED) {
          if (line.includes(phrase)) violations.push(`${path}:${index + 1} ${phrase}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  test("the generated changelog is excluded on purpose, not by accident", () => {
    // Named here so removing the exclusion is a deliberate edit to this test.
    expect(GUARDED_COPY_SURFACES).not.toContain(HISTORICAL_RECORD);
    expect(existsSync(join(REPO_ROOT, HISTORICAL_RECORD))).toBe(true);
  });
});
