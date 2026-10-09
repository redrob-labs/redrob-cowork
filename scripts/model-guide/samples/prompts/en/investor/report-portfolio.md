---
profession: investor
task: report-portfolio
language: en
deliverable: documents
---

## Prompt

You are the CFO of Cedar Lane Ventures. Write the Q3 2025 (quarter ended Sep 30, 2025) letter to limited partners of Cedar Lane Ventures Fund II, L.P. (a 2021 vintage with $120M of commitments). The managing partner, John Doe, has sent a draft performance line and his proposed marks. Check them against the fund's records and valuation policy before anything goes out.

**Draft line from John Doe**

> "Fund II continues to perform: TVPI of 1.43x on $81.0M of paid-in capital, up from last quarter."

**Fund records**

- Paid-in capital (capital account statements): $78.0M at Jun 30 and $78.0M at Sep 30. A $3.0M capital call notice was issued Sep 26 with a due date of Oct 15, 2025.
- Cumulative distributions: $9.6M, all from Ione Systems (exited in 2024; cost $3.0M).
- Cumulative management fees and fund expenses: $6.0M.
- Fund cash at quarter-end: none (the fund is fully invested).

**Portfolio and proposed marks ($M)**

| Company | Cost | FMV Jun 30 | Proposed FMV Sep 30 | Q3 event |
|---|---|---|---|---|
| Arbor Pay | 12.0 | 30.0 | 30.0 | No change |
| Brine Robotics | 9.0 | 9.0 | 4.5 | Missed plan; insider bridge at a 50% discount to the last round price |
| Clearpath Bio | 8.0 | 8.0 | 8.0 | Board approved wind-down Aug 14; estimated cash return to our share: $0.4M |
| Dovetail AI | 6.0 | 6.0 | 18.0 | New investors bought SAFEs with a $150M valuation cap; no priced round |
| Ember Grid | 10.0 | 14.0 | 14.0 | No change |
| Fathom Labs | 7.0 | 10.5 | 10.5 | No change |
| Gild Insurance | 8.0 | 8.0 | 12.0 | Series B priced round led by a new outside investor at 1.5× our entry price |
| Harrow | 9.0 | 9.0 | 9.0 | No change |

**Valuation policy (excerpt)**

> Investments are held at fair value. A priced equity round with meaningful participation from a new, unaffiliated investor is the primary evidence of value. SAFEs, convertible notes and other unpriced instruments do not by themselves support a write-up. Write-downs are taken when there is evidence of impairment, including a wind-down decision, a down round or a bridge at a discount.

**Deliver** the LP letter in markdown with these headed sections:

1. Summary
2. Fund performance: a table of paid-in capital, distributions, NAV, TVPI, DPI and RVPI at Jun 30 and Sep 30, with formulas stated
3. Portfolio update: one or two sentences per company, with Sep 30 marks per policy
4. Write-downs and notable changes, told plainly
5. Upcoming capital call
6. Outlook

After the letter, add a short internal note to John Doe (at most 150 words) explaining each change you made to his draft and marks. Keep the whole answer under about 1,200 words. Round multiples to two decimal places.

## A strong answer

- Uses $78.0M of paid-in capital for both quarter-ends. The $3.0M call isn't due until Oct 15, so it isn't paid in at Sep 30; the draft's $81.0M is wrong. Discloses the call in its own section.
- Applies the policy: holds Dovetail at its $6.0M cost (the SAFE doesn't justify $18.0M), writes Clearpath down to about $0.4M (not $8.0M), and accepts Gild at $12.0M and Brine at $4.5M.
- Computes NAV of $94.5M at Jun 30 and $86.4M at Sep 30. TVPI is (94.5 + 9.6) ÷ 78.0 = 1.33x at Jun 30 and (86.4 + 9.6) ÷ 78.0 = 1.23x at Sep 30; DPI 0.12x; RVPI 1.21x at Jun 30 and 1.11x at Sep 30.
- States plainly that TVPI fell this quarter, contradicting the draft's "1.43x … up from last quarter". Explains the Clearpath wind-down and the Brine markdown candidly and without spin.
- The internal note lists each correction (paid-in capital, the Dovetail mark, the Clearpath mark, the performance line) with the policy reason for each.
