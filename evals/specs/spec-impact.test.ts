import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect } from "vitest"
import { test } from "@redrob/testkit"

const script = fileURLToPath(new URL("../scripts/spec-impact.mjs", import.meta.url))

function run(...changedFiles: string[]): string {
  return execFileSync(process.execPath, [script, ...changedFiles.flatMap((file) => ["--changed-file", file])], {
    encoding: "utf8",
  })
}

function runMatched(...changedFiles: string[]): string {
  return execFileSync(process.execPath, [script, "--matched-tests", ...changedFiles.flatMap((file) => ["--changed-file", file])], {
    encoding: "utf8",
  })
}

test("the spec-impact report suggests an E2E test for unmapped changes", ({ evidence }) => {
  const report = run("apps/app/src/react-app/unmapped-feature.ts")
  expect(report).toContain("Warden suggestion: add or update an `evals/specs/<feature>.e2e.test.ts`")
  evidence.recordAssertionEvidence(
    "Unmapped app changes receive an E2E test suggestion",
    "Warden reports an actionable E2E test suggestion when no contract matches.",
    true,
  )
})

test("the spec-impact matcher always selects changed E2E tests", ({ evidence }) => {
  const matched = JSON.parse(runMatched("evals/specs/new-unmapped-feature.e2e.test.ts"))
  expect(matched).toEqual(["evals/specs/new-unmapped-feature.e2e.test.ts"])
  evidence.recordAssertionEvidence(
    "New E2E tests enter PR regression without a contract mapping",
    "The matcher selected a changed unmapped E2E test directly.",
    true,
  )
})
