# Upstream: different-ai/openwork

This repository is a **hard fork** of [different-ai/openwork](https://github.com/different-ai/openwork),
imported as one squashed commit. It is not a patch stack, and it is not a mirror.
Both of those were considered and rejected on measurements, recorded below so the
next person does not have to re-derive them.

## Where the fork was cut

| | |
|---|---|
| Import commit (here) | `6776b1d` — 2026-08-26, 3,593 files |
| Upstream base (measured) | `9ba56f2b2` — 2026-08-24, `fix(den-api): clear stale login session cookie (#4034)` |
| Upstream default branch | `dev` (**not** `main`) |
| Distance between them | 42 files, all under the excluded prefixes below |

The base was **measured, not assumed**: there is no merge base, no upstream
remote in the import, and no tag. Every first-parent upstream commit in the
import window was scored by `git diff --name-only` against the import tree, and
`9ba56f2b2` is the minimum. The machine-readable record lives in
`upstream-base.json`.

## What this fork ships, and what it never will

Upstream licenses everything under `/ee` under the **OpenWork Enterprise Edition
License**: production use requires a valid OpenWork subscription. This fork
ships the MIT-licensed portion only, so the import deleted that tree — 1,321
files — along with `packaging/helm/openwork-ee/` and `evals/`, which depend on
it.

That deletion is a licensing boundary, not a cleanup, and a careless upstream
merge is exactly what would silently undo it. `scripts/check-upstream-boundary.mjs`
fails the build if any file reappears under an excluded prefix, and if `LICENSE`
stops stating the exclusion.

## Why not a patch stack

The fork's own diff against the base is **688 modified files, 118 added, 2,128
deleted**. A patch-based fork (pin upstream, keep changes as `patches/*.patch`,
re-apply on bump) works when the diff is surgical — dozens of files. At 688
modified files each bump would replay a 433-file collision surface, and the
deletion set is not expressible as reviewable patches at all.

## Why not a mirror

Upstream moves fast: **748 commits in the three weeks after the base**, 913 in
the last month. Tracking all of it would mean re-doing the prune and the rebrand
continuously.

## How syncing actually works

The useful slice is small: of the 2,704 files upstream changed since the base,
**433 are files this fork still ships**. That surface is what gets triaged.

```bash
node scripts/upstream-sync.mjs setup    # add/repoint the `upstream` remote
node scripts/upstream-sync.mjs fetch    # network
node scripts/upstream-sync.mjs report   # commits touching files we ship
node scripts/upstream-sync.mjs files    # just the colliding paths
```

`report` turns hundreds of upstream commits into a triage list by listing only
the commits that touch the colliding surface. Nothing in the tool merges,
commits, or moves a branch: what to take is a human decision, and the `/ee`
boundary has to survive it.

After any sync:

```bash
node scripts/check-upstream-boundary.mjs
```

Record the upstream commit you synced to in `upstream-base.json`
(`lastSyncedUpstream`) so the next report starts from there.

## How this repository got a merge base

The graft question is settled, and not by a merge commit. This repository
(`redrob-labs/redrob-cowork`) is a **real GitHub fork of upstream**, and the
fork's history was **reparented** rather than grafted:

1. A commit was created carrying the exact tree of the original squashed import
   (`6776b1d`), with the measured upstream base `9ba56f2b2` as its parent. Its
   diff is 42 files, all under excluded prefixes plus one lockfile.
2. The fork's 159 later commits were replayed onto it with
   `git rebase --onto`. Because step 1's tree is byte-identical to the import
   tree, every commit applied to an identical base — **zero conflicts**.
3. The result was verified two ways: `git diff` against the pre-migration branch
   is **empty** (the tree is unchanged), and `git merge-base` against
   `upstream/dev` now resolves to `9ba56f2b2`.

So upstream syncs are ordinary three-way merges from here on, and the history
states its own provenance instead of starting from an orphan squash.

Being a fork rather than an independent repository is what makes the licensing
picture honest: GitHub shows "forked from different-ai/openwork", upstream's
history — including its `/ee` tree — lives in upstream's own network where it was
already published, and this fork's working tree still ships none of it.
Two consequences worth knowing: a GitHub fork of a public repository cannot be
made private, and detaching it from the upstream network needs GitHub support.

The pre-migration history is preserved in `redrob-labs/redrob-work`, which was
not modified.
