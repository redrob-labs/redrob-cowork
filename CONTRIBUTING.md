# Contributing

Thanks for helping. This document is the working agreement for the repository:
how branches are named, what has to be green before a merge, and the two rules
that exist because this is a **fork** rather than a standalone project.

한국어: [CONTRIBUTING_KO.md](./CONTRIBUTING_KO.md)

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

One long-lived branch, short-lived branches off it, merged by pull request.

```
main ──●────●──────────●──────────────●──►   protected, always releasable
        \        \            \
         ● fix/…  ● feat/…     ● chore/…     short-lived, one concern each
```

- **`main`** is the trunk. It is protected: no direct pushes, no force pushes,
  no deletion. Everything lands through a pull request.
- **Working branches** are named `<type>/<short-slug>`, e.g. `fix/composer-drop-zone`,
  `feat/reasoning-effort`, `chore/bump-electron`, `docs/upstream-sync`.
  Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`.
- **Upstream syncs** land on `sync/upstream-<date>` and merge as a MERGE commit,
  never a squash: squashing an upstream merge destroys the merge base and the
  next sync would replay work already taken.
- Release tags are cut from `main`. Tag format `v<major>.<minor>.<patch>`.

Rebase your branch on `main` before asking for review. Keep the branch focused:
a reviewer should be able to state what the branch does in one sentence.

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

A pull request needs its checks green and a maintainer merge. A single
maintainer may self-merge — the protection exists to stop accidental direct
pushes and force pushes, not to invent ceremony for a one-person change.

Merge style: **squash** for a working branch (one concern, one commit on `main`),
**merge commit** for an upstream sync (see above). Do not rebase-merge an
upstream sync.

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
