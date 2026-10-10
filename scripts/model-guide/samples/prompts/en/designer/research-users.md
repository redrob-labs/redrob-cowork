---
profession: designer
task: research-users
language: en
deliverable: presentations
---

## Prompt

You are the UX researcher at Ledgerly, a fictional expense-management app for companies with 50 to 500 employees. The product lead, Richard Roe, asked: "Should next quarter's big bet be better receipt capture?" He has already told the board that receipt capture is the top complaint. Synthesize the evidence below into a readout deck for the product trio.

**Interviews (8 participants, 45 minutes each)**

| ID | Role | Company size | Key quote / observation |
|---|---|---|---|
| P1 | Field sales rep | 320 | "I snap receipts fine. Then my report sits with my manager for a week and my card gets frozen." |
| P2 | Finance manager (approver) | 140 | Approves in one batch on Fridays; says the mobile approval screen "hides the policy flags". |
| P3 | Consultant | 75 | Photo of a crumpled receipt failed twice; typed it in by hand. |
| P4 | Engineering manager (approver) | 410 | 23 pending approvals in the queue; "I don't get notified, I find out when people complain." |
| P5 | Office admin | 60 | Spends about 2 hours a month recategorizing other people's expenses. |
| P6 | Sales director (approver) | 320 | "Delegating approvals when I'm travelling is impossible." |
| P7 | Support engineer | 210 | Receipt capture fine; wants mileage tracking. |
| P8 | Account executive | 140 | Multi-page hotel folios only capture page 1. Also says approvals are slow. |

**In-app survey (n = 212)**

Sent to users who submitted 20 or more expenses last month. Question: "What is your single biggest frustration?" (choose one)

| Answer | Share |
|---|---|
| Receipt photo fails or misreads | 34% |
| Waiting for approval | 27% |
| Choosing the right category | 22% |
| Mileage | 9% |
| Other | 12% |

**Product analytics, last 90 days**

| Metric | Value |
|---|---|
| Receipt photos where OCR needed manual correction | 6.2% |
| Expense reports waiting more than 5 days for approval | 41% |
| Median time from submission to approval | 4.8 days |
| Approvers who opened the mobile approval screen at least once | 18% |
| Monthly active submitters | 9,400 |
| Monthly active approvers | 1,150 |

**Deliver** a readout deck in markdown, 8 to 10 slides, at most ~1,200 words. Use `### Slide n: title` for each slide, then bullets, then a one-line speaker note. Include:

- The research question and method, with honest limitations.
- Three to five themes, each backed by specific evidence (participant IDs, survey or analytics figures).
- A clear recommendation on next quarter's big bet that answers Richard's question directly, even if the answer is not the one he expects, and one or two smaller follow-ups.
- What you would research next to reduce the remaining uncertainty.

## A strong answer

- Notices that the survey shares add up to 104% for a single-choice question and treats the figures as unreliable until they are checked.
- Flags the sampling bias: the survey went only to heavy submitters (20 or more expenses), and no approvers were in the sample, so it under-represents the approval side.
- Shows approval delays as the stronger, triangulated theme: 5 of 8 participants raise approval problems (P1, P2, P4, P6, P8), 41% of reports waiting more than 5 days, and only 18% mobile-approval adoption. Receipt capture is a real but narrower problem (6.2% need correction; crumpled receipts and multi-page folios).
- Recommends approval-flow work (notifications, delegation, policy flags on mobile) as the big bet and tells Richard directly that receipt capture is not the top problem. Receipt-capture edge cases are scoped as a smaller follow-up.
- Follows the slide format with a speaker note on every slide, cites evidence by ID, and states its limitations (n = 8, survey wording).
