# Skills and schedules

Skills replace playbooks. A skill is `.opencode/skills/<name>/SKILL.md` in a workspace, which the engine reads natively. The Desk offers skills in three places: the Skills screen, the composer (where workspace commands used to be), and schedules.

## Where a skill comes from

`metadata.source` in each SKILL.md says where it came from. The Skills screen shows each source as a tab.

| Tab | Source | How it gets there | Who edits it |
| --- | --- | --- | --- |
| Library | `library` | The person installs it from the Console's default library (`GET /skill-library`). | The person, after install. Installing never replaces a skill of the same name. |
| Team | `team` | `team-skills/sync.ts` installs the team's skills (`GET /skill-sync`, with the Redrob Key) into every local workspace: 20 s after start, then every 30 min ± 5 min, or on demand. | The Console. The next sync restores any local edit. |
| Mine | none | Written on the Skills screen, or by the person. | The person. |

- **Team sync only removes what it installed.** That list is kept per workspace (`team_skill_installs`).
- **A same-named skill the sync didn't install wins.** It is reported as a conflict.
- **401 or 403 from the Console:** the team's skills are removed.
- **No answer from the Console:** the installed skills stay.

## Offline library

`apps/server/src/skill-library/library.ts` answers from the Console when it can, and from `snapshot.json` when it can't: offline, blocked, or the Console is down. The snapshot is the library as it was when this build was made.

`pnpm skill-library:snapshot` rewrites it (`scripts/skill-library/build-snapshot.mjs`). It can read the live Console, another `--url`, or a local Console checkout (`--from`).

The snapshot keeps each skill's fields and body. It does not keep the Console's rendered SKILL.md, because `installLibrarySkill` renders that itself, and storing both doubled the file. It is written one skill per line.

## Schedules

`apps/server/src/desk-schedules.ts` runs a prompt, or a skill with optional instructions, on a calendar. Each run is a new session on the Run agent.

- **Only while the app is open.** Nothing wakes the computer.
- **Missed times are skipped, not run late.** A time that passed while the app was closed is recorded as missed.
- **Permission requests wait.** A run that asks for permission waits on the Scheduled screen until the person answers (`POST /workspace/:id/schedules/waiting/:waitingId`).
- **A skill that has been deleted fails the run.** It does not fail the schedule.

Routes: `GET`/`POST /workspace/:id/schedules`, `PATCH`/`DELETE /workspace/:id/schedules/:scheduleId`.

## Upgrading from playbooks

- **Old schedules.** A schedule saved before skills ran a playbook command by id. At load it becomes a prompt schedule built from that command's template. It is dropped, with a warning, when the command is gone. The API refuses `playbookId`.
- **Team policy.** Schema v2 has no playbooks (`team-policy/policy.ts`). Commands a v1 policy installed as playbooks are removed on the next apply, or when leaving the team (`legacyPlaybooks` in `team-policy/apply.ts`).
- **Old links.** `/playbooks` and `/playbook/:id` redirect to `/skills`.

User-facing docs: `packages/docs/start-here/do-work-with-it/skills-plugins-and-mcp.mdx` and `packages/docs/roadmap.mdx`.
