# AI work insights

Cowork labels each finished session for the Redrob Console's insights, so an admin can see how the workspace works with AI, a team lead their own team, and each person their own work. The console side is described in mckinley-and-rice/redrob-console `docs/ai-work-insights-design.md`.

## What is recorded

The engine plugin `apps/server/src/opencode-plugins/redrob-insights-recorder.ts` reduces each engine event to a fact (`apps/server/src/insights/facts.ts`), and only facts reach redrob-server. A fact is counts, flags and times:

- a message from the person was received, and whether a file was attached to it;
- an answer finished;
- a tool ran, reduced to what it did: wrote a file, ran a check (tests, a type check, a linter), started an agent, sent something through a connector, read, or other;
- a permission was asked or answered;
- a session started, became busy or idle, or was stopped.

Message text, file contents, command lines and tool output never leave the plugin. When one of them decides a flag (a command that runs tests), the plugin computes the flag and only the boolean crosses.

When a session has been quiet for 15 minutes, `insights/recorder.ts` folds its facts, and those of any subagents it started, into one tally. `insights/labeler.ts` then turns the tally into the console's labels:

| Label | Rule |
| --- | --- |
| Mode | 5 two or more agents at once; 4 an agent did the work (a subagent, or six or more steps per message) and produced something; 3 something produced over three or more messages; 2 something produced in one or two; 1 a back and forth with nothing produced; 0 one question |
| Produced output | A file was written, or something was sent through a connector |
| Context | The first message had a file attached |
| Checked | A check ran |
| Steered | The person stopped a run and wrote again |
| Outward | Something was sent through a connector |
| Sensitive data | The privacy gate saw a customer detail, number or key in what was sent to the model (touched), and none of it went out unmasked at the chat's level (safe) |
| Agent figures | Steps, messages, minutes the agents ran, minutes between an answer and the next message (each capped at 10), whether permissions were asked, whether the run was stopped, agents at once |

The kind of work, whether the first message said what done looks like, and whether a chat-only session was a draft need the work classifier, which is evaluated first (`apps/server/src/insights/eval`). Until it ships, those labels are left out. A session that only wrote text in the chat counts as an answer, which undercounts drafts but never overcounts them.

The sensitive-data labels come from the privacy gate, not the engine: on every send it also runs its patterns over the text in observe-only mode, at every category, and reports two booleans per send, touched and unmasked. Which details, and their values, stay in the gate; the chat's own labels are untouched.

Every model request also carries `x-redrob-session`, a hash of the session's id. The console uses it to join the session to its own record of the requests' cost and model, so neither is taken from the device.

## Where it goes

Finished sessions wait in the outbox (`insights/outbox.ts`) on this machine, and `GET /insights/outbox` returns exactly what will be sent. Every 10 minutes or so, `insights/sync.ts` posts the outbox to the Redrob Console (`POST /v1/insights/sessions`) with the person's Redrob Key. The console attributes each session to the key's holder and to nobody else, and it refuses any field that isn't a label.

Sending is on whenever Cowork has a Redrob Key, with no separate opt-in. This was decided for the console's insights in its design document. Admins see the workspace, team leads their own team, and each person their own work. No figure is shown for fewer people than the workspace's minimum group, except to the person themselves.

Sessions the console accepted, updated or rejected leave the outbox. Anything without an answer, whether the console was unreachable or the key was refused, stays and is tried again.
