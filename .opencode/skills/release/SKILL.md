# Skill: release

Cut a Redrob Work release. The "Release App" workflow
(`.github/workflows/release-macos-aarch64.yml`) builds, signs, and publishes
the desktop app assets on the GitHub release. Full runbook:
`docs/RELEASING.md`.

**Versions live in git tags only.** Every committed `package.json` holds the
permanent `0.0.0-dev` placeholder; CI stamps the tag-derived version into the
workspace at build time (`scripts/release/stamp-version.mjs`). A release makes
**zero commits to this repo** — no bump commit, no backfill PR, no packaging
PR.

A release is **done when the run is green and the GitHub release is published**
(not a draft) — never when the tag is created.

---

## Cut a release (default path)

```bash
pnpm release:cut            # dispatches Release App with bump=patch
pnpm release:cut minor      # or major
pnpm release:cut --version 0.19.0
pnpm release:cut:watch      # same as release:cut, then tails the run
```

Equivalent by hand:

```bash
gh workflow run "Release App" --repo redrob-labs/redrob-work -f bump=patch
```

The run resolves the next version from existing `v*` tags, creates the tag on
`origin/main` HEAD, verifies it (`scripts/release/verify-tag.mjs`: stable
format + strictly greater than every other stable tag), stamps the version
into the CI workspace, builds all 18 electron matrix legs, publishes npm +
Daytona + AUR, and flips the draft release public.

The tag is pushed with `GITHUB_TOKEN`, and such a push does not retrigger the
workflow, so the dispatch run is the only run that builds it. If the `v*`
ruleset rejects the push, the run fails with instructions — allow it in the
ruleset, or push the tag manually as an admin and rerun in recovery mode.

## Tag-first (expedited, admins only)

To release a commit that is not yet reviewed onto `main` (incident response),
push the tag manually — the tag names exactly the code that ships:

```bash
git tag vX.Y.Z <sha>
git push origin vX.Y.Z     # v* ruleset grants admins bypass
```

The Expedited Release Audit workflow opens a post-hoc review issue when the
tagged commit is not on `main`. Never push `main` directly or bypass its branch
rules.

---

## Watch

```bash
gh run list --repo redrob-labs/redrob-work --workflow "Release App" --limit 1
gh run watch <run-id> --repo redrob-labs/redrob-work --exit-status --interval 90
```

Publishing is gated on the electron matrix, electron assets, and npm publish.
`Publish AUR` (continue-on-error) and `Build + Push Daytona Snapshot` are
**non-blocking channels**: their failures don't stop the release — rerun the
workflow with the same tag once the channel recovers.

**Rerun an existing tag (recovery)** — transient failures, or replaying
non-blocking channels:

```bash
gh workflow run "Release App" --repo redrob-labs/redrob-work -f tag=vX.Y.Z
```

Recovery runs skip tag creation and monotonicity, build source pinned to the
tag, and pick up workflow-file fixes from `main` automatically (the workflow
definition runs from the dispatched ref; only the checked-out sources are
pinned to the tag).

**If the run fails before the release is published:** land the fix on `main`
via a normal protected-branch PR and cut the next patch (`pnpm release:cut`).
Only delete/recreate a tag after verifying the GitHub release is still
draft-only:

```bash
git push --delete origin vX.Y.Z
```

---

## Verify

```bash
gh release view vX.Y.Z --repo redrob-labs/redrob-work --json assets --jq '.assets[].name'
```

Expect the app assets (`redrob-<platform>-X.Y.Z.*`, `latest*.yml` updater
manifests), including:

- `redrob-mac-arm64-X.Y.Z.dmg`
- `redrob-mac-x64-X.Y.Z.dmg`
- `redrob-win-x64-X.Y.Z.exe`

The desktop updater 404s on `latest*.yml` until the release is published —
that error in a running app during the build window is expected and
self-heals. Spot-check a download URL resolves (302 to release-assets CDN):

```bash
curl -sI "https://github.com/redrob-labs/redrob-work/releases/download/vX.Y.Z/redrob-mac-arm64-X.Y.Z.dmg" | head -2
```

Confirm `npm view redrob-server version` matches.

---

## Notes

- Desktop installer fixes only reach users through a new release — the org
  install door (`/v1/install/:platform`) 302s to versioned assets.
- AUR publishes by rendering the committed `packaging/aur` template
  (pkgver=0.0.0) in the CI workspace and pushing to aur.archlinux.org — the
  AUR-side commit is that channel's publish protocol; this repo stays
  untouched.
- Native workspace deps must stay converged on one major across all apps —
  electron-builder rebuilds every copy it finds (see #3561/#3563 for the
  three-release outage this caused).
