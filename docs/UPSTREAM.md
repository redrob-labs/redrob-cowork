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

## Open decision: grafting

A one-time `git merge --allow-unrelated-histories` against `upstream/dev` would
create a real merge base and make every later sync an ordinary three-way merge.
It has a cost that matters for a **public** repository: the merge makes
upstream's entire history reachable from our refs, so pushing it republishes
every historical `/ee` file — EE-licensed content — from this repository.

Until that is decided, syncing stays file-level: the base blob needed for a
correct three-way merge is available from the fetched (unpushed) upstream
objects, so merge quality does not depend on the graft.
