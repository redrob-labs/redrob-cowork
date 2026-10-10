---
profession: pm
task: synthesize-feedback
language: en
deliverable: spreadsheets
---

## Prompt

You are a PM at Tallyfern, an expense-management SaaS for mid-sized companies. Before Q3 planning, your VP wants a synthesis of last month's customer feedback: what the themes are, how much revenue sits behind each, and which three to act on. Below is everything that was logged across the NPS survey, support tickets and sales call notes.

| # | Source | Account | Plan | ARR | NPS | Verbatim |
|---|---|---|---|---|---|---|
| 1 | Survey | Hollow Pine Logistics | Enterprise | $96k | 4 | "Receipt scanning misreads anything that isn't in English. Our German team types everything by hand." |
| 2 | Support | Marigold Studio | Starter | $3k | — | "Is there any way to export to our accounting software? I do CSVs by hand every month." |
| 3 | Survey | Corvid Health | Business | $28k | 6 | "Approval chains are too rigid. We need a second approver for anything over $5k." |
| 4 | Sales call | Hollow Pine Logistics | Enterprise | $69k | — | "Renewal at risk unless multi-language OCR lands by Q2. German and Polish receipts." |
| 5 | Survey | Bramble & Finch | Business | $22k | 7 | "The mobile app logs me out every day." |
| 6 | Support | Nettle Robotics | Business | $31k | — | "Mobile keeps logging out our field techs and they lose draft expenses." |
| 7 | Survey | Quarry Lane Dental | Starter | $2.4k | 9 | "Love it. Dark mode would be nice." |
| 8 | Survey | Corvid Health | Business | $28k | 5 | "Approval rules need amount thresholds." |
| 9 | Support | Saltmarsh Media | Starter | $3.6k | — | "Can't find where to connect our accounting software." |
| 10 | Survey | Osprey Freight | Enterprise | $74k | 3 | "Spanish and French receipts come out garbled. Finance rekeys them." |
| 11 | Sales call | Pinewick Labs | Business | $18k | — | "Chose us over a competitor but needs conditional approvals by department." |
| 12 | Survey | Nettle Robotics | Business | $31k | 4 | "Mobile app logs out constantly." |
| 13 | Survey | Larkspur Events | Starter | $1.8k | 8 | "An export to accounting would save me hours." |
| 14 | Survey | Fennel Grocers | Business | $26k | 2 | "Card reconciliation is a week behind every month. The bank feed drops transactions." |
| 15 | Support | Fennel Grocers | Business | $26k | — | "Bank feed is missing transactions again, for the 3rd to the 9th." |
| 16 | Survey | Thistle Architecture | Business | $15k | 7 | "Session timeouts on mobile are really annoying." |

**Product notes**

- Accounting export (LedgerSync) shipped in March. It lives under Settings › Integrations and is available on every plan.
- Engineering's rough sizes: multi-language OCR, 1 quarter. Mobile session fix, likely a token-refresh bug, 2 weeks. Approval thresholds, 6 weeks. Bank feed reliability, unknown (it depends on the aggregator).

**Deliver** (markdown, at most ~1,200 words):

1. A coding table: each row number, its theme, whether it's a feature gap, bug, reliability problem or discoverability problem, and whether it duplicates another row.
2. A theme summary table with these columns: mentions, unique accounts, ARR of unique accounts, lowest NPS, and plans affected. State the method behind each computed column (for example, how you deduplicate accounts and which ARR figure you trust).
3. Your top three recommendations, in priority order, with the reasoning and the evidence for each. Explain how you weighed revenue concentration against breadth and against effort.
4. Caveats about the data that the VP should know before acting on it.

## A strong answer

- Deduplicates by account: mobile logout is 3 unique accounts / $68k (Nettle Robotics counted once), OCR 2 accounts, approvals 2 accounts / $46k, and the bank feed 1 account / $26k. The method is stated.
- Flags that Hollow Pine Logistics' ARR conflicts between the rows ($96k vs $69k, likely a transposition), says which figure it uses (for example, OCR at $170k on $96k), and recommends checking the CRM.
- Classifies the accounting-export requests (rows 2, 9 and 13) as discoverability or onboarding problems, because LedgerSync already shipped, not as a build request.
- The recommendations weigh the OCR renewal risk (two Enterprise accounts) against the cheap, broad mobile bug fix, and treat the bank feed as a data-integrity risk even with a single account. Each call is justified.
- The caveats cover the small, mixed-source sample: 16 rows, about 12 accounts, NPS from only 10 survey responses, and sales notes that aren't comparable with survey data.
