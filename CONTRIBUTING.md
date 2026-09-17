# Contributing

Thanks for helping. This document is the working agreement for the repository:
how branches are named, what has to be green before a merge, and the two rules
that exist because this is a **fork** rather than a standalone project.

한국어: [CONTRIBUTING.ko.md](./CONTRIBUTING.ko.md)

## The two fork rules

Read these before anything else. Both are enforced by CI, not by convention.

1. **Never add anything under `ee/`.** Upstream licenses that tree under the
   OpenWork Enterprise Edition License, which requires an OpenWork subscription
   for production use. This fork ships MIT-licensed content only.
2. **Never replace the upstream copyright notice.** MIT requires it to be
   retained in every copy. Add your name, do not take theirs out.

`pnpm check:upstream-boundary` fails on either. See
[docs/UPSTREAM.md](./docs/UPSTREAM.md) for how upstream changes are pulled in.

## Branch flow

Gitflow: `develop` integrates, `main` is what is released.

```
main    ──────●──────────────────────●──►   released state, tagged
             /                      /
develop ──●─●────●──────●──────────●────►   default branch, integrates everything
              \        \
               ● fix/…   ● feat/…           short-lived, one concern each
```

- **`develop`** is the default branch and the base for every pull request. Cutting a
  branch and opening a pull request both target it without you choosing anything.
- **`main`** is released state. It moves by merging `develop` into it, and release tags
  are cut from it. Tag format `v<major>.<minor>.<patch>`.
- **Releasing therefore has a promotion step.** The release workflow tags `origin/main`
  HEAD, so a release cut before `develop` is merged into `main` ships the previous state
  under the new version number. It refuses to do that: the fresh-release path fails while
  `develop` is ahead of `main`, listing the commits, and `allow_unpromoted: true` is the
  override a hotfix already on `main` legitimately needs.
- **Working branches** are named `<type>/<short-slug>`, e.g. `fix/composer-drop-zone`,
  `feat/reasoning-effort`, `chore/bump-electron`, `docs/upstream-sync`.
  Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`.
- **Hotfixes** branch from `main`, not `develop`, so the fix does not drag unreleased work
  with it. Merge into `main`, release, **then merge `main` back into `develop`** or the fix
  is lost at the next release. This is the step that gets skipped; the sibling engine
  repository ran a month with a broken lockfile on its default branch for exactly this
  reason.
- **Upstream syncs** land on `sync/upstream-<date>` and merge as a MERGE commit, never a
  squash: squashing an upstream merge destroys the merge base, and the next sync would
  replay work already taken.

Rebase your branch on `develop` before asking for review. Keep the branch focused: a
reviewer should be able to state what the branch does in one sentence.

**The type list and the back-merge are enforced by
[`.github/workflows/gitflow.yml`](./.github/workflows/gitflow.yml), not by trust.** It fails a pull
request whose head branch is not `<type>/<slug>` carrying one of the types above, which is how a
branch named after the tool that produced it gets caught instead of merged; `develop` and `main`
themselves pass, since a promotion or back-merge branch is not named after a type. On every push to
`main` the same workflow fails while `main` holds commits `develop` does not, which is the rule the
hotfix bullet describes and the step that actually gets skipped. Neither job checks tests or
behavior, and neither is in the required list above, so they report rather than block.

### What protection is on, and what it cannot cover

Both `develop` and `main` are protected: everything lands through a pull request, force pushes and
deletions are blocked, and two checks are required.

| | Setting |
|---|---|
| Required checks | `i18n-audit`, `Syntax & dry-run publish` |
| Required reviews | 0 -- a single maintainer may self-merge |
| Strict (branch up to date) | off -- a stale base does not block a merge |
| Admin enforcement | off |

**The test suite is not among the required checks and cannot be.** `Redrob Cowork Tests` is
`workflow_dispatch` only, so it never reports on a pull request; requiring a check that never runs
leaves every pull request waiting forever. Run the suite locally (above). If you fix the two
pre-existing trunk failures, re-enable the workflow on `pull_request` and add it to the required list
in the same change -- that, not more protection, is what would make these gates mean something.

The Korean guide is [CONTRIBUTING.ko.md](./CONTRIBUTING.ko.md), and it is the only one. An
older `CONTRIBUTING_KO.md` described the single-trunk flow this document replaced; it was
deleted rather than left beside its successor, because two guides disagreeing about which
branch to target is worse than either of them alone.

## Commits

Conventional prefixes, imperative mood, lower case subject:

```
fix(composer): show the drop zone during dragover, not only on drop
```

The body is where the value is. Say what was wrong and why the fix is the right
shape — not what the diff already shows. If you found the cause somewhere other
than where the symptom appeared, say so; that is the sentence the next person
needs.

## Before you open a pull request

```bash
pnpm install
pnpm --filter @redrob/app test          # bun tests
pnpm --filter @redrob/app typecheck
node scripts/i18n-audit.mjs --ci        # translation keys and placeholders
pnpm check:upstream-boundary            # the two fork rules
pnpm check:outbound-access              # no undeclared network hosts
```

Touching user-facing strings adds one rule: **every string goes through `t()`**
and lands in both `apps/app/src/i18n/locales/en.ts` and `ko.ts`. English is the
source of truth; a missing Korean key falls back to English rather than breaking.
Korean values must not carry stray English words — `apps/app/tests/supported-locales.test.ts`
enforces that, and its allowlist is where a legitimate technical token goes.

## What CI checks today, and what it does not

| Workflow | Runs on | Status |
|---|---|---|
| `i18n Audit` | pull request, push | required |
| `redrob-ui-mcp` | pull request, push | required |
| `Redrob Cowork Tests` | manual dispatch only | **paused** |

The test workflow is deliberately paused (`workflow_dispatch` only) and is
therefore **not** a required check. It has pre-existing failures on the trunk
itself — a Ripgrep timeout and a `util.flock` error — so requiring it would make
every pull request red for reasons unrelated to the change under review. Run the
suite locally (above) instead, and if you fix those two failures, re-enable the
workflow on `pull_request` and make it required in the same change.

## Reviews

A pull request needs its checks green and a maintainer merge. A single maintainer may
self-merge; nothing in the repository currently prevents it either way.

Merge style: **squash** for a working branch (one concern, one commit on `develop`),
**merge commit** for an upstream sync (see above) and for a `develop` into `main` release
promotion. Do not rebase-merge either of those: a squash or a rebase of a merge loses the
relationship the next merge needs.

## Reporting bugs and asking for features

Use the issue templates under `.github/ISSUE_TEMPLATE`. For a bug, the useful
report names the platform, the app version, and what you saw on screen — a
screenshot of the actual window beats a description of it.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](./SECURITY.md)
if present, otherwise mail the address in the repository's package metadata.

## License of your contribution

By contributing you agree your work is released under the MIT license, the same
terms as the rest of the tree. You keep the copyright in your own contribution;
the notice in [LICENSE](./LICENSE) names contributors collectively rather than
assigning anything.
