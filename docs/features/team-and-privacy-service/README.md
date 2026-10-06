# Team and privacy service

Status: proposal. Step 1 is in review as #109; steps 2 to 4 are not built.

This replaces the hand-carried team file (#108) with accounts, signed team policies and a
team service, and adds a small on-device model to privacy protection (#102). Two repositories
are involved:

| Repository | Owns |
| --- | --- |
| `redrob-labs/redrob-cowork` (this one) | The desktop and web app, the local `redrob-server`, policy verification and enforcement, the detection model on the device |
| `mckinley-and-rice/redrob-console` | The admin console: teams, members, invites, the policy editor, the connector allowlist, audit views |

The team service API (below) is the contract between them. Where its code lives (beside the
console, or as its own service) is an open question.

## Goals

- Teammates join with an invite or company sign-in. No files are passed around.
- An admin changes the team policy once, and every member gets it, including removals.
- The app can prove who set a policy. A collaborator token cannot get around a lock.
- Privacy protection catches names, organisations and free-form addresses without a list, and
  raw text still never leaves the laptop on desktop.
- Costs stay small at beta scale and grow with use, not with idle servers.

## Non-goals

- Real-time co-editing of chats. Workspace sharing over a URL and token stays as it is.
- Sending chat content, files or the placeholder map to the team service. It never sees them.

## Steps

| Step | What | Repo | Status |
| --- | --- | --- | --- |
| 1 | Review a team file before use. Only the owner sets, lifts or changes locks. A newer file replaces the team notes | cowork | #109 |
| 2 | Team service, signed policies, sign-in, and the app applying policies | console, cowork, infra | Proposed |
| 3 | On-device detection model alongside the existing patterns | cowork | Proposed |
| 4 | Server-side detector for the web app only | cowork, infra | Proposed |

Until step 2, the team file stays and keeps the step 1 review.

## Team policy

A policy is one JSON document per team, signed by the team service. The app trusts nothing
about a policy that the signature does not cover.

```jsonc
{
  "v": 1,
  "teamId": "team_01J...",
  "version": 42,                     // goes up on every change; the app refuses anything older
  "issuedAt": "2026-10-06T00:00:00Z",
  "expiresAt": "2026-11-05T00:00:00Z",
  "setBy": { "userId": "usr_...", "name": "Park Hyunjin" }, // from the account, not typed
  "privacy": { "level": "high", "names": ["..."], "locked": true },
  "notes": [{ "id": "note_...", "text": "House style: numbered clauses" }],
  "connectors": {
    "allow": [{ "name": "notes", "type": "remote", "url": "https://..." }],
    "allowLocalPrograms": false
  },
  "playbooks": [{ "name": "weekly-update", "template": "..." }],
  "skills": []
}
```

**Signing.**
- The service signs the policy as a compact JWS (`ES256`) with an asymmetric AWS KMS key. The
  private key never leaves KMS.
- The app ships with the current public keys and fetches newer ones from a pinned keys URL.
- Every signature carries a `kid`, so keys can be rotated.

**Who verifies.** `redrob-server` verifies the policy, not the renderer, so locks hold no
matter which client calls the server. The server:

1. Checks the signature, the `teamId` this workspace joined, the expiry, and that `version` is
   newer than the one stored.
2. Applies the policy:
   - the privacy level, locked
   - the team notes, tagged `desk-locked` and replaced as a whole set
   - the playbooks and skills
   - the connector allowlist
3. Records `policy.applied` with the version in the audit log.

**Locks.**
- A locked setting changes only through a newer signed policy. Step 1's owner-scope rule stays
  as the fallback for the team file.
- Connectors outside the allowlist are refused at the server's MCP routes. A connector that
  starts a local program needs `allowLocalPrograms`.

**Offline.**
- The last verified policy keeps applying until `expiresAt`.
- After that, the app keeps the locks and shows that the policy needs refreshing.
- The app never falls back to unlocked.

## Sign-in and devices

- Members sign in with Amazon Cognito. An enterprise team can use SAML or OIDC through its
  identity provider.
- The desktop app uses the browser with PKCE and a loopback redirect, the same pattern as
  `docs/features/local-managed-mcp-oauth`.
- Refresh tokens are kept in the operating system's secure storage.
- Access tokens last 15 minutes.
- Each device registers once. The console can sign a device out remotely.

## Team service API

All routes are under `https://teams.<domain>/v1` and need a Cognito access token. A
member's `teamId` comes from the token, never from the request.

| Route | Who | What |
| --- | --- | --- |
| `GET /policy?after={version}` | member | The signed policy, or `304` if not newer |
| `GET /keys` | anyone | Public signing keys (JWKS) |
| `POST /invites/{code}/accept` | signed-in user | Joins the team |
| `PUT /policy` | admin (console) | Saves a draft, signs it, bumps the version |
| `GET/POST/DELETE /members`, `/invites` | admin (console) | Manage the team |
| `GET /audit` | admin (console) | Policy changes, joins, sign-outs |

The app checks for a new policy when it starts, every 15 minutes, and when the console sends a
change signal. It never polls more often.

## Privacy detection

The detector is a token-classification encoder (about 100–300M parameters, int8 ONNX, about
100–300 MB). It is fine-tuned on Korean and English personal data. It is not a generative model:
it labels spans and never rewrites text, and text in the message cannot instruct it.

**Pipeline** (`desk/privacy/redact.ts`):

1. The existing patterns with checksums run first. They are exact for ID, card, phone and
   business numbers.
2. The model labels what patterns cannot catch: person names, organisations and free-form
   addresses.
3. Overlapping spans are merged, preferring the pattern match.

The placeholder map and the restore step stay as they are.

**Where it runs.**
- Desktop: in the app through ONNX Runtime, downloaded once and checked against a published hash.
- Web (step 4): a Lambda function behind the team service that keeps text in memory only and
  logs counts, not content.
- Without the model (not yet downloaded, or no web detector), protection falls back to patterns
  only and says so.

**Levels.**
- Standard: patterns only, as today.
- High: adds the model's addresses and organisations.
- Strict: adds the model's names, as well as the listed ones.

## AWS architecture

Region `ap-northeast-2` (Seoul).

```
console / app ──► WAF ──► API Gateway (HTTP API) ──► Lambda (arm64)
                                                     ├─ DynamoDB  (teams, members, policies; one partition per team)
                                                     ├─ KMS       (policy signing key; data key for DynamoDB and S3)
                                                     └─ S3        (audit log, Object Lock)
               Cognito user pool (+ SAML/OIDC)
web only:      API Gateway ──► Lambda container (detector, no network access)
```

**Security controls.**
- Tenant isolation: every item's partition key is the `teamId`. The Lambda role uses
  `dynamodb:LeadingKeys` scoped through session tags, so one team's request cannot read
  another's.
- Encryption: a KMS key you manage, for data at rest. TLS 1.2 or later in transit.
- The signing key's policy allows `kms:Sign` only to the `PUT /policy` function.
- Logging: no request bodies are logged. CloudTrail, GuardDuty, and WAF rate limits per IP
  and per token.
- The detector Lambda has no VPC egress and no write access anywhere.
- No NAT gateways. Nothing needs outbound internet.

## Estimated cost per month

These are estimates. Check them in the AWS Pricing Calculator before budgeting.

| Users | Team service | Monitoring and WAF | Web detector | Total |
| --- | --- | --- | --- | --- |
| ≤50 | $3–8 | $10–20 | $1–5 | $15–35 |
| ~500 | $15–30 | $25–50 | $5–20 | $45–100 |
| ~5,000 | $65–240 | $80–200 | $30–100 | $175–540 |

The total includes the web detector. Leave it out if only the desktop app is offered.
On-device detection costs nothing to run. An always-on GPU for a small generative model would
cost about $720 a month for one instance and is not needed.

## Open questions

1. Where does the team service code live: beside the console, or as its own repository?
2. Does the console already have accounts or SSO that the team service should reuse instead of
   a new Cognito pool?
3. Which infrastructure-as-code tool (CDK, Terraform) does the console use?
4. Personal data reaching a server-side detector (web only) needs review under PIPA, Korea's
   Personal Information Protection Act, before step 4.
5. Which base model to fine-tune for detection, and what labelled Korean data we have, need
   an evaluation before step 3.
