# Releasing Redrob Cowork

Releases are **pure GitHub Actions + GitHub Releases**: versions live in git
tags, every committed `package.json` holds the permanent `0.0.0-dev`
placeholder, and CI stamps the tag-derived version into the workspace at build
time. Cutting a release makes **zero commits to this repo**. A release is
**done when the `Release App` run is green and `Publish GitHub Release` has
flipped the release public** — not when the tag is created.

```bash
pnpm release:cut            # dispatch Release App with bump=patch
pnpm release:cut minor      # or major
pnpm release:cut --version 0.19.0
pnpm release:cut:watch      # dispatch, then tail the run
pnpm release:review         # sanity: placeholders intact, opencode pin present
```

## How a release works

1. `release:cut` dispatches `Release App` (or run it from the Actions tab).
2. The `resolve-release` job computes the next version from the highest stable
   `v*` tag (`scripts/release/versions.mjs`) and pushes the tag on `origin/main`
   HEAD with `GITHUB_TOKEN`. That push does not retrigger the workflow, so the
   dispatch run *is* the release run.
3. `verify-release` checks the tag (`scripts/release/verify-tag.mjs`): strict
   stable `vX.Y.Z` format, and fresh tags must be strictly greater than every
   other stable tag. `release:review --strict` guards that the committed
   placeholders were not replaced with real versions.
4. Build jobs check out **the tag** and run
   `scripts/release/stamp-version.mjs`, which writes the version into
   `apps/{app,desktop,server}/package.json` in the CI workspace only. That is
   what electron-builder, `app.getVersion()`, the Vite renderer bundle, and
   the `redrob-server` npm publish all read.
5. Every build leg uploads its installers as a `release-*` workflow artifact;
   `updater-manifests` merges the per-architecture `latest*.yml` feeds into one
   per platform. Nothing touches GitHub Releases until then.
6. `publish` -- the shared redrob-labs job
   (`redrob-labs/.github/.github/workflows/release-publish.yml`) -- downloads
   every `release-*` artifact, writes `SHA256SUMS.txt` and `redrob-launcher.json`,
   creates the release `Redrob Cowork vX.Y.Z` with generated notes and all assets
   attached in one step, and publishes it as latest (`draft=true` leaves a draft,
   `prerelease=true` flags it). From that moment the desktop updater serves the
   new version: it reads published releases from the GitHub Releases API at
   runtime — prereleases and drafts are excluded, so a rollback demotion removes
   a version immediately.

## Prerequisites

- `gh` authenticated with permission to dispatch workflows.
- The `v*` tag ruleset must let `GITHUB_TOKEN` create tags. A ruleset that
  demands a bypass actor rejects the push (the built-in GitHub Actions app
  cannot be one), and the run fails with instructions: create the tag
  manually as an admin and rerun in recovery mode.
- Manual tag pushes (expedited path below) additionally require repo/org
  admin, as before.

## How protection actually works here

- **`main` is protected for everyone, including admins**: PR required, one
  approval, approval from someone other than the last pusher, signed commits,
  linear history. The release never touches `main` — nothing to backfill.
- **`v*` tags are creation-restricted**: admins and the GitHub Actions
  principal (for workflow-created tags) can create them.

Two entry paths:

**Dispatch (default)** — `pnpm release:cut`. The tag is created on
`origin/main` HEAD, so the released code is always reviewed code.

**Tag-first (expedited, admins only)** — when a release must go out now from
a commit not yet on `main`:

```bash
git tag vX.Y.Z <sha>
git push origin vX.Y.Z
```

The tag names exactly the code that ships (there is no bump commit). The
Expedited Release Audit workflow opens a post-hoc review issue whenever a
released tag's commit is not on `main`; land the same changes on `main` through
a normal reviewed PR and close the loop there.

## Recovery and reruns

- **Rerun an existing tag** (infra failure, replay AUR/Daytona):

  ```bash
  gh workflow run "Release App" --repo redrob-labs/redrob-work -f tag=vX.Y.Z
  ```

  Recovery runs skip tag creation and monotonicity. Sources are pinned to the
  tag; workflow-file fixes are picked up from `main` automatically because the
  workflow definition runs from the dispatched ref. The shared publish job
  refreshes a **draft** release (its assets are replaced) but refuses to touch a
  release that is already **published**: delete it first
  (`gh release delete vX.Y.Z`) or bump and tag again.

- **A tagged version turned out defective before publish**: leave the release
  as a draft or delete it (`gh release delete vX.Y.Z`), fix forward on `main`,
  and cut the next patch. If the bad version reached npm, deprecate it:
  `npm deprecate redrob-server@X.Y.Z "<reason — use X.Y.Z+1>"`.

## Rolling back a published release

Use this flow when a bad version is **published** and marked Latest.

### 1. Stop the bleed

Dry-run first, then execute:

```bash
pnpm release:rollback
pnpm release:rollback --bad vX.Y.Z --execute
```

Always pin `--bad` when executing: after a successful rollback the *good*
release is Latest, so a bare re-run would select it as bad. The script
re-points Latest, demotes the bad release to prerelease, and prepends a
warning to its notes. Because prereleases are excluded, the updater stops
offering the demoted version once its cache window passes.

### 2. Reissue for updated clients

Updaters refuse downgrades. Tag the **last-good commit** with a version higher
than the bad release — no commits, no worktree:

```bash
git tag vX.Y.Z+1 <last-good-tag>
git push origin vX.Y.Z+1
```

### 3. Deprecate npm

```bash
npm deprecate redrob-server@<bad-version> "rolled back — use <next>"
```

| Client state | Recovery |
| --- | --- |
| Not yet updated | Fixed by step 1 |
| Already updated | Fixed only by step 2 |

Revert the offending PR on `main` through the normal reviewed-PR flow. That
cleanup is not in the critical path of user recovery.

## Windows code signing

Windows installers are Authenticode-signed with **Azure Artifact Signing over
OpenID Connect**; the signer is the organization's Public Trust certificate
(`CN=McKinley Rice, Inc.`). There is no certificate file, no password and no
client secret anywhere in the repository or its secrets.

- **Credential.** The `publish-electron-windows` job declares
  `environment: release` and `permissions: id-token: write`. `azure/login`
  exchanges the job's OIDC token against the organization's app registration,
  whose federated credential names that environment. Secrets (all plain IDs,
  redrob-labs **organization** secrets -- do not recreate them per repository):
  `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
  `ARTIFACT_SIGNING_ENDPOINT`, `ARTIFACT_SIGNING_ACCOUNT`,
  `ARTIFACT_SIGNING_CERT_PROFILE`.
- **One recipe, shared.** The signing recipe is not in this repository. It is
  `redrob-labs/.github/actions/sign-windows` (`sign.ps1`): signtool with the
  `Azure.CodeSigning` dlib from the `Microsoft.ArtifactSigning.Client` NuGet
  package, metadata excluding every credential a runner cannot satisfy (so a
  missing login fails in seconds instead of waiting on a browser prompt), then
  `signtool verify /pa` + Status `Valid` + signer CN `McKinley Rice, Inc.`. The
  Windows job checks that repository out at `.redrob-shared`.
- **Order.** The OIDC token lives minutes and electron-builder signs *during*
  packaging, so the job runs `electron-builder --dir` (unpacked, unsigned),
  then logs in, then the shared `sign-windows` action signs the unpacked app
  executable, then `electron-builder --prepackaged` builds the installer and
  zip. electron-builder's `win.sign` hook, `apps/desktop/build/sign-windows.cjs`,
  is a thin shim: it runs `pwsh -File .redrob-shared/actions/sign-windows/sign.ps1
  <file>` for the uninstaller and installer with the three `ARTIFACT_SIGNING_*`
  variables in the environment (all unset: the files stay unsigned with a
  warning, so a local build still works; a partial set is an error).
- **Verification.** Every signature is checked twice: by `sign.ps1` as it is
  written and by the `Verify Windows signatures` step afterwards -- `signtool
  verify /pa /v` and `Get-AuthenticodeSignature` Status `Valid`, signed by
  `McKinley Rice, Inc.`, with the line `<file> signed by CN=McKinley Rice, Inc.`
  in the log.
  There is no untrusted-root allowance and no test-build escape hatch: an
  unsigned Windows build fails the job. `win.signtoolOptions.publisherName` in
  `apps/desktop/electron-builder.base.yml` names the same publisher, which is
  what electron-updater checks before installing an update.
- **Dry run.** Dispatch `Release App` with `benchmark_only=true`: the matrix
  builds and signs, nothing is tagged or published, and the Windows job log
  carries the `signed by` lines.

## What blocks publishing (and what doesn't)

`Publish GitHub release` (the shared `publish` job) requires the electron
matrix and the merged updater manifests. It does **not** require:

- `Publish redrob-server` (npm) -- a package that cannot authenticate must not
  withhold six signed installers.

- `Publish AUR` (`continue-on-error`) — aur.archlinux.org outages are not
  release failures. AUR publishing renders the committed
  `packaging/aur` template (pkgver=0.0.0) with the real version + checksums
  in the CI workspace and pushes only to the AUR remote.
- `Build + Push Daytona Snapshot` — snapshots are rebuildable afterwards by
  re-running the workflow with the same tag.

## Verification checklist

```bash
gh run list --repo redrob-labs/redrob-work --workflow "Release App" --limit 3
gh release view vX.Y.Z --repo redrob-labs/redrob-work   # published, not draft
```

- Release is **not a draft** and marked Latest
- Asset count looks right (macOS + Linux + Windows + updater `latest*.yml`
  manifests — the desktop updater 404s until the manifests are published)
- `npm view redrob-server version` shows the new version

## Where versions live now

| Question | Answer |
| --- | --- |
| What versions exist? | `git tag --list 'v*'` / GitHub Releases |
| What's the latest? | `gh release view --json tagName` |
| What commit is vX.Y.Z? | `git rev-parse vX.Y.Z` |
| What version is this checkout? | `git describe --tags` (package.json says `0.0.0-dev` on purpose) |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Run fails pushing the tag | the `v*` tag ruleset rejects `GITHUB_TOKEN` pushes | allow it in Settings → Rules, or push the tag manually as an admin and rerun with `-f tag=vX.Y.Z` |
| `Tag vX.Y.Z already exists` on a fresh cut | version already released | rerun with `-f tag=vX.Y.Z` (recovery) or pick a higher version |
| `verify-release` fails monotonicity | manual tag lower than an existing release | choose a version above the current highest stable tag |
| `release:review` fails placeholder check | someone committed a real version into package.json | restore `0.0.0-dev` — CI stamps versions from the tag |
| Desktop app shows updater 404 for the new version | tag exists but the release is not created until every leg is built | wait for `Publish GitHub release`; self-heals |
| `publish` fails with `Release vX.Y.Z is already published` | recovery run of a tag whose release is public | delete the release (`gh release delete vX.Y.Z`) and rerun, or bump and tag again |
| Release run red only on AUR / Daytona | external channel failure | release still publishes; rerun with the same tag when the channel recovers |
| All `electron-linux-*` fail compiling a native module | a raw-V8 native addon meeting new Electron headers under GCC | keep native deps converged on one N-API-based major across the whole workspace (see #3561/#3563) |
| Windows legs fail in afterPack with `Missing staged MCP runtime package` | asar path-separator mismatch | fixed — `normalizeAsarEntryPath` in `electron-after-pack.cjs` |
| Windows leg fails in `Sign the unpacked Windows app` or `Verify Windows signatures` | `az login` missing or expired (OIDC token lives minutes), Artifact Signing secrets unset, or a signer other than `McKinley Rice, Inc.` | check the `Log in to Azure (OIDC)` step ran right before signing, the six organization secrets exist, and the `release` environment's federated credential; a Windows build never ships unsigned |

## History

- **2026-10-15**: gitflow, Windows signing and publishing moved to the shared
  redrob-labs pieces (`redrob-labs/.github`): `gitflow.yml` is a caller of the
  shared workflow; the in-repo signing recipe (`sign-windows.cjs`, 520 lines)
  became a shim over `actions/sign-windows/sign.ps1`; the per-leg `gh release
  upload` loops, the early draft creation and `publish-electron-assets.mjs` were
  replaced by `release-*` artifacts, `merge-updater-manifests.mjs` and the shared
  `release-publish.yml`. The `release_name`/`release_body` inputs went with them
  (title is `Redrob Cowork vX.Y.Z`, notes are generated); `draft` now means
  "leave a draft" and defaults to false.
- **2026-10-14**: Windows signing moved to Azure Artifact Signing over OpenID
  Connect (job `environment: release` + `id-token: write`, login right before
  signing, Public Trust certificate `CN=McKinley Rice, Inc.`). The `.pfx`
  organization certificate (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`), the
  untrusted-root allowance and the `allow_untrusted_windows` dispatch input
  were removed; so was the post-hoc installer re-sign and blockmap refresh,
  since signing now happens inside packaging.
- **2026-08**: releases became commit-free (tags are the only version source;
  CI stamps the workspace; the updater reads published releases at runtime; AUR
  renders a committed template). Previously every release required a version
  bump commit, a main backfill PR, and an AUR packaging PR.
- **2026-08-05** (v0.18.15/v0.18.16): three releases red since the Electron
  35→43 upgrade left `apps/server` on better-sqlite3 v12 while desktop moved
  to v13 — electron-builder rebuilds every copy of a native module it finds.
  Fixed by converging the workspace on v13 (N-API) and teaching `opencode-db`
  to use `bun:sqlite` under Bun. Full context: #3561, #3563, #3564.
