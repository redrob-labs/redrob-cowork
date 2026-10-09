---
profession: pm
task: plan-roadmap
language: en
deliverable: spreadsheets
---

## Prompt

You are the senior PM for Tidewater Dispatch, a B2B field-service scheduling SaaS with 640 active customer accounts. You need to plan the H2 2026 roadmap (Q3: July–September, Q4: October–December) for the one product squad. After on-call and maintenance, the squad has **24 engineer-weeks of capacity per quarter, 48 for H2**. Work can't be split across quarters unless you say so and explain why.

The team scores the backlog with RICE: Reach = accounts affected per quarter, Impact on a 0.25–3 scale, Confidence as a percentage, Effort in engineer-weeks.

**Backlog export (from the planning sheet)**

| ID | Item | Reach | Impact | Confidence | Effort | Notes |
|---|---|---|---|---|---|---|
| F1 | Offline mode for technician mobile app | 420 | 2 | 80% | 16 | Top request in churn interviews |
| F2 | Route optimisation v2 | 300 | 3 | 50% | 20 | Needs the new map provider (F5) |
| F3 | SAML single sign-on | 35 | 1 | 100% | 6 | Contracted for Brightwell Utilities ($180k ARR): live by 31 Oct 2026 |
| F4 | Customer self-booking portal | 510 | 1 | 70% | 12 | |
| F5 | Map provider migration | — | — | — | 8 | Current map contract ends 31 Dec 2026; renewal would be +40% |
| F6 | Invoice PDF redesign | 600 | 0.5 | 90% | 3 | |
| F7 | Technician skills matching | 250 | 2 | 60% | 45 | Squad lead's estimate, submitted in engineer-days |

**Stakeholder input**

> "Route optimisation v2 has to be the H2 headline. It's what I'm pitching to every enterprise prospect." (Richard Roe, VP Sales)

> "Please don't let SSO slip again. Brightwell's contract has an exit clause if it misses 31 October." (Mary Major, Head of Customer Success)

> "We assume 5-day engineer-weeks. F5 is plumbing: no customer will notice it, but if it's not done by year end we pay the uplift or lose maps." (Jane Doe, Engineering Manager)

**Deliver** (markdown, at most ~1,200 words):

1. A scored backlog table with one column per RICE input, a normalised effort column, and the RICE score. State the formula for each computed column. Treat any item that can't get a RICE score as a separate category, and say how you handled it.
2. An H2 plan table by quarter showing which items go in, their effort, and a capacity check (used vs. available) for each quarter and for H2 as a whole.
3. A cut list of what doesn't make H2, with a one-line reason for each.
4. A short memo (at most 250 words) to Richard Roe and Mary Major explaining the plan. Name the key trade-off you made between items that compete for the last slot of capacity, and say what would change your mind.

## A strong answer

- Converts F7 from 45 engineer-days to 9 engineer-weeks, giving a RICE of about 33.3 (not about 6.7), and states RICE = Reach × Impact × Confidence ÷ Effort. The other scores are F6 90.0, F1 42.0, F4 29.75, F2 22.5 and F3 about 5.8.
- Schedules F3 SSO in Q3 (or with clear margin before 31 October) and F5 before 31 December regardless of their RICE scores, because they are a contractual deadline and a cost deadline.
- Doesn't schedule F2 before F5. Recognises that F2 (20 weeks) can't fit alongside F3 + F5 + F1 within 48, and tells the VP Sales so plainly, with the conditions under which F2 could lead instead.
- Every quarter stays at or under 24 engineer-weeks, and H2 at or under 48, with the totals shown. A typical valid plan is F3 + F5 + F6 + F1 plus either F4 (45 weeks) or F7 (42 weeks).
- Makes and justifies the F4 versus F7 call explicitly, for example total R×I×C (357 vs 300) against effort and confidence, rather than ranking mechanically.
