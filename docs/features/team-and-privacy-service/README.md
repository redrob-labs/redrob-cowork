# Team policy and privacy gate

Status: plan. Step 1 is in review as #109. Nothing after it is built.

This replaces the hand-carried team file (#108) with signed team policies published from the
console, and moves privacy protection (#102) from the renderer into `redrob-server`, so attached
files, tool results and connector results are protected as well as typed text. Two repositories
are involved:

| Repository | Owns |
| --- | --- |
| `redrob-labs/redrob-cowork` (this one) | The desktop and web app, the local `redrob-server`, policy verification and enforcement, the privacy gate and the detection model |
| `mckinley-and-rice/redrob-console` | Teams (console accounts), members, invites, the policy editor, policy signing, the audit log |

The console already has what a team service needs: accounts with members, invites and
viewer/developer/admin roles, a central sign-in (`redrob-auth`), and the device flow (RFC 8628)
Cowork already uses to get a workspace API key. The team policy API is added to the console API;
there is no separate service and no new sign-in.

## Goals

- An admin changes the team policy once in the console, and every member's app gets it.
- The app can prove who published a policy. A collaborator token cannot get around a lock.
- Every text the cloud model sees is protected: typed text, attachments, file reads, connector
  and web results, team notes, earlier turns.
- Legal and financial answers stay useful: identifiers become consistent labels, while amounts,
  dates and clause numbers are kept.
- Raw text never reaches a Redrob server. Costs stay at a few dollars a month.

## Non-goals

- Real-time co-editing of chats. Workspace sharing over a URL and token stays as it is.
- Sending chat content, files or the label map to the console. It never sees them.
- Training a model. Existing pretrained models are measured first (see Detector).

## Threat model

- Redaction prevents accidental leaks to the cloud model. It runs on the user's machine.
- Locks and the connector allowlist are security controls. `redrob-server` enforces them, never
  the renderer.

## Steps

Console PRs (`K`) are based on the console's `develop`. Cowork PRs (`C`) stack on #109.

| Step | Branch | What | Depends |
| --- | --- | --- | --- |
| 1 | `fix/team-file-safety` (#109) | Review a team file before use. Only the owner sets, lifts or changes locks | -- |
| K1 | `fix/member-removal-revokes-keys` | Removing a member revokes their device keys; the API key guard checks membership | -- |
| C1 | `feat/team-policy-verify` | `redrob-server` verifies and applies signed policies, with shared contract vectors | #109 |
| K2 | `feature/team-policy-api` | Policy table, append-only hash-chained audit table, permissions, endpoints, a test signer | K1 |
| C2 | `feat/team-policy-sync` | The app fetches policies with its device key and shows who set them | C1, K2 |
| C3 | `feat/team-connector-allowlist` | The server refuses connectors outside the allowlist | C1 |
| K3 | `feature/team-policy-editor` | The console's policy screen and audit list, behind a flag | K2 |
| C4 | `feat/privacy-gate` | The privacy gate server plugin: typed labels, entity linking, restore in tool arguments, server-side map | C3 |
| C5 | `feat/privacy-model-runtime` | Detector runtime and `pnpm privacy:eval`, off by default | C4 |
| C6 | `refactor/team-file-without-locks` | Team files can no longer carry locked fields | C2 |
| C7 | `feat/privacy-local-compute` | Local tools that compute on real values; structure-aware splitting | C4 |
| C8 | `feat/privacy-model-bundle` | Only if a model passes the gate: ship it in the installer | C5 |
| K4 | `feature/aws-infra-cdk` | Last. CDK for KMS keys, Vercel OIDC roles, CloudTrail; KMS signer; Bedrock moves to OIDC | all of the above |
| C9 | `feat/team-policy-production-keys` | Last. Pin the real public keys; enable policies in packaged builds | K4 deployed |

Until K4 the console signs with a test key (`kid: test-*`). Only dev builds and console previews
accept it, so teams get real policies only after K4 and C9.

## Team policy

One JSON document per console account, signed by the console. The app trusts nothing about a
policy that the signature does not cover.

Schema v2 carries the privacy setting, team notes, the connector allowlist and skills. v1 also
carried `playbooks` (opencode commands); they were retired in favour of skills. The app refuses a
v1 policy, or any policy that still has a `playbooks` field, with `team_policy_unsupported_version`,
and reports that code to the console. Commands a v1 policy installed are deleted on the next
successful apply or on leaving the team.

```jsonc
{
  "v": 2,
  "accountId": "acc_...",
  "version": 42,                     // only goes up; the app ignores anything not newer
  "issuedAt": "2026-10-06T00:00:00Z",
  "setBy": { "userId": "usr_...", "name": "Park Hyunjin", "role": "admin" }, // from the session
  "privacy": {
    "level": "high",
    "locked": true,
    "names": [["김지원", "Jiwon Kim"]],  // aliases of one person
    "keep": { "amounts": true, "dates": true },
    "transforms": { "roundAmounts": false, "shiftDates": false, "titlesNearNames": false }
  },
  "notes": [{ "id": "note_...", "text": "House style: numbered clauses" }],
  "connectors": {
    "allow": [{ "name": "notes", "type": "remote", "url": "https://..." }],
    "allowLocalPrograms": false
  },
  "skills": [{ "name": "house-style", "description": "House style", "content": "..." }]
}
```

**Signing.**
- Compact JWS, `ES256`, with a `kid`. Until K4 a `DevSigner` holds a P-256 test key; from K4 a
  `KmsSigner` uses an asymmetric AWS KMS key that never leaves KMS.
- The app pins two public keys, active and standby, and never fetches keys. To rotate, the
  console starts signing with the standby key and the next release ships a new standby.
- A `kid` the app does not pin is rejected. `test-*` keys are rejected by packaged builds.

**Verification and enforcement** in `redrob-server`:
1. Check the signature, that `accountId` matches the account the device key belongs to, and that
   `version` is newer than the stored one.
2. Apply the privacy level and lock, the team notes (tagged `desk-locked`, replaced as a whole
   set), skills and the connector allowlist.
3. Record `policy.applied` with the version.

**Locks.** A locked setting changes only through a newer signed policy. Connectors outside the
allowlist are refused at the server's MCP routes; one that starts a local program also needs
`allowLocalPrograms`.

**Offline and membership.** There is no expiry: the last verified policy keeps applying and locks
never fall back to unlocked. After 7 days without a successful check the app shows when it last
checked. On a definitive "not a member" answer the app removes that team's notes and skills.

## Console API

Added to the console API. The account always comes from the credential, never the request.

| Route | Credential | What |
| --- | --- | --- |
| `GET /v1/team/policy` | device API key | The signed policy; `304` with a matching `ETag` |
| `POST /v1/team/policy/applied` | device API key | Reports the applied version for the audit log |
| `PUT /team/policy` | console session, `policy.write` | Validates, signs and publishes a new version |
| `GET /team/audit` | console session, `audit.read` | Policy changes, applies, member removals |

The app checks at startup, every 30 minutes with jitter, and when the Team screen opens.

## Privacy gate

**One gate in `redrob-server`.** A new server plugin, `redrob-privacy-gate`, uses the same
opencode hooks as `redrob-office-attachments`:

| Hook | Job |
| --- | --- |
| `experimental.chat.messages.transform` | Labels every text the model will see: typed text, extracted attachment text, tool results (file reads, connector results, web fetches) and earlier turns. Runs after the office plugin |
| `experimental.chat.system.transform` | Labels team notes and other system text |
| `tool.execute.before` | Puts real values back into tool arguments, so a written file or a sent email contains the real name |

- The gate works on the copy sent to the provider. Local history keeps the real values.
- The label map lives in `redrob-server`, per chat, encrypted at rest, and is deleted with the
  chat. The renderer stops redacting and stops storing maps in `localStorage`.
- Sub-agents run as child sessions and share the parent's map. Web gets the same protection.
- Images and scanned PDFs cannot be checked. At High and Strict the user chooses to send or
  remove them.
- Fail closed: at High and Strict, if the gate fails, nothing is sent and the user sees why.
- C4 first confirms the hook signatures in the pinned opencode version and whether title
  generation and context compaction pass through the gate. Anything that bypasses it is turned
  off or fed labelled text at High and Strict.

**Labels, not blackouts.**
- Typed, consistent labels: `PERSON` (`NAME` stays as an alias), `ORG`, `ADDRESS`, `RRN`, `BRN`,
  `ACCOUNT`, `CARD`, `PHONE`, `EMAIL`. One entity gets one label per chat.
- Entity linking by rules: Korean honorifics and particles are stripped (김지원님, 김지원은), the
  policy's alias lists join forms (`김지원 | Jiwon Kim`), and a partial name matches only after
  the full name appeared.
- Kept by default: amounts, percentages, clause and article numbers, dates that are not birth
  dates, public company names. Admins can lock transforms: round amounts, shift dates by a fixed
  offset per chat, label job titles next to names (on at Strict).
- Tolerant restore (`[PERSON 1]`, `PERSON_1`, full-width brackets). An answer holding a label that
  cannot be mapped gets a visible marker.
- Local tools (C7): `privacy_compute` tools (sum, difference, ratio, date difference, compare,
  lookup in a document) take labels, resolve them on the machine and return only results that
  are not identifiers. Long documents are split along their structure before labelling.

**Levels.** Standard: patterns with checksums. High: adds model addresses and organisations.
Strict: adds model names and titles next to names.

## Detector

- A pretrained token-classification model, not a generative one. It labels spans and never
  rewrites text. No training for now.
- Candidates: 3-5 models with Korean coverage, a licence that allows commercial use, ONNX
  export, int8 at most 120 MB. Licence and size are read from the model card and files.
- `pnpm privacy:eval` runs each candidate in the runtime we ship on a synthetic Korean, English
  and mixed set (no real personal data), reporting per-entity precision and recall, label
  consistency, size and p95 latency. Patterns only is the baseline.
- Gate to ship: Korean `PERSON` precision at least 0.90 and recall at least 0.85, at most 120 MB,
  p95 at most 150 ms per 1,000 characters on an 8 GB M1 and a mid-range Windows laptop.
- A passing model ships in the installer with its SHA-256 pinned in code (C8). If none passes,
  labels, patterns and the names list still ship.

## AWS (K4, last)

Region `ap-northeast-2`, CDK in TypeScript in the console repository: two `ECC_NIST_P256` signing
keys (active, standby), one symmetric key for envelope encryption of the policy body at rest,
roles assumed through Vercel OIDC (sign, policy data, Bedrock), one CloudTrail trail. No NAT
gateways, no GPUs, no new datastore: policies and the audit log stay in the console's Postgres.

## Estimated cost per month

Estimates; check them in the AWS and Vercel calculators. Until K4 there is no AWS cost.

| | ≤50 users | ~500 | ~5,000 |
| --- | --- | --- | --- |
| KMS keys and calls | ~$3 | ~$3 | ~$3-4 |
| CloudTrail and S3 | <$1 | <$1 | ~$1 |
| Vercel and Neon extra | ~$0 | ~$1-3 | ~$5-20 |
| Detector | $0 | $0 | $0 |
| **Total added** | **~$3-5** | **~$5-10** | **~$10-25** |

## Open questions

1. AWS account for K4 and who runs `cdk deploy`.
2. Fine-tuning, only if no pretrained candidate passes the gate.
3. Data residency: Neon has no Korean region, so console data, including policies, is stored
   outside Korea. Envelope encryption from K4 protects the policy body; moving the database to
   Seoul is a separate decision.
