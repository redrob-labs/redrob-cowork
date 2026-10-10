---
profession: lawyer
task: draft
language: en
deliverable: documents
---

## Prompt

You are outside counsel to Fernhill Wellness, Inc., a Delaware corporation based in New York City. Fernhill is hiring Orbitmade Studio LLC, a New Jersey development agency, to build its consumer sleep-tracking app for iOS and Android. Draft the Software Development and IP Assignment Agreement, governed by New York law, from the materials below. Draft it to protect Fernhill while staying signable by the agency.

**CEO's term sheet (John Doe, Fernhill)**

| Term | Fernhill position |
|---|---|
| Price | Fixed fee of $250,000 |
| Milestones | M1 Discovery $25,000; M2 Design $50,000; M3 Beta $90,000; M4 Store launch $80,000 |
| IP | "Everything is work for hire. We own all of it." |
| Acceptance | "We test until we're happy." |
| Liability | Agency fully liable, no cap |
| Data | The app collects sleep and heart-rate data from wearables. Fernhill is not a HIPAA covered entity. |
| Timeline | Store launch by June 30, 2026 |

**Agency's markup (Richard Roe, Orbitmade)**

> - We keep ownership of our pre-existing "Orbitmade Core" UI and networking libraries and license them to you.
> - The mobile client will include "SleepWave", a GPL-3.0-licensed open-source audio library. The rest of the open source is MIT/Apache.
> - Deliverables are deemed accepted 5 business days after delivery.
> - Liability capped at the fees paid in the prior 3 months, with no exceptions.
> - We use vetted subcontractors in other countries for QA.
> - Mutual 12-month non-solicitation of employees.

**Copyright Act excerpts (17 U.S.C.)**

> §101, "work made for hire," paragraph (2): "a work specially ordered or commissioned for use as a contribution to a collective work, as a part of a motion picture or other audiovisual work, as a translation, as a supplementary work, as a compilation, as an instructional text, as a test, as answer material for a test, or as an atlas, if the parties expressly agree in a written instrument signed by them that the work shall be considered a work made for hire."
>
> §204(a): "A transfer of copyright ownership, other than by operation of law, is not valid unless an instrument of conveyance, or a note or memorandum of the transfer, is in writing and signed by the owner of the rights conveyed or such owner's duly authorized agent."

**Deliver**, in markdown:

1. **The agreement.** Draft these sections in full: Definitions (only the key terms); Services and Statement of Work; Fees and Milestones; Acceptance; Intellectual Property (assignment, pre-existing materials, open source); Data Security and Subcontractors; Warranties; Indemnities; Limitation of Liability; Term and Termination (including what Fernhill gets on termination); Non-Solicitation; Governing Law and Venue. List the remaining boilerplate sections by heading only. Use bracketed placeholders for open business points.
2. **A cover email to John Doe** (at most 200 words) explaining the three or four positions you took that differ from his term sheet and why, and the decisions he still needs to make.

Keep the whole answer under about 1,200 words. Draft tightly: concise operative clauses, no recitals.

## A strong answer

- Notices that the milestones add up to $245,000, not the $250,000 fixed fee. Resolves the gap with a placeholder or a stated assumption and raises it in the cover email instead of silently picking one figure.
- Doesn't rely on "work for hire" alone: app software commissioned from an agency doesn't fit the §101(2) categories. Includes a present assignment ("hereby assigns") in a signed writing, satisfying §204(a), with a work-for-hire statement only as a backstop, plus further-assurances language.
- Carves out Orbitmade Core with a perpetual, irrevocable, royalty-free license that is transferable with the app. Restricts open source to pre-approved permissive licenses and prohibits GPL-3.0 components in the distributed app (or requires Fernhill's written approval), explaining the copyleft risk to the source code.
- Balances acceptance (for example 10 business days, a written rejection with reasons, two cure rounds, and deemed acceptance only after a reminder notice) and the liability cap (for example 12 months of fees or the full contract value, with exclusions for IP indemnity, confidentiality/data breach and wilful misconduct). Explains both in the cover email.
- Requires prior written approval of subcontractors, flow-down of security and confidentiality obligations, and Orbitmade's responsibility for its subcontractors. On termination, Fernhill receives the source code and work in progress on payment of amounts due. The governing law is New York, with a stated New York venue.
