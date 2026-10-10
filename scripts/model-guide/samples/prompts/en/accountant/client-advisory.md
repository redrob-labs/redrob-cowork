---
profession: accountant
task: client-advisory
language: en
deliverable: spreadsheets
---

## Prompt

You are the outsourced CFO advisor for Copperleaf Bakeries LLC, which runs three retail bakeries and a wholesale bread line. The owner, Jane Doe, wants a Q3 2025 budget-versus-actual variance report before Thursday's management meeting. Her bookkeeper's summary says: "EBITDA missed budget by $53,500, mostly because of insurance."

**Q3 2025 P&L ($)**

| Line | Budget | Actual |
|---|---|---|
| Revenue – wholesale | 420,000 | 451,200 |
| Revenue – retail | 610,000 | 566,300 |
| Ingredients | 288,400 | 312,900 |
| Packaging | 41,200 | 40,700 |
| Direct labor | 247,200 | 261,800 |
| Rent | 96,000 | 96,000 |
| Utilities | 38,000 | 44,600 |
| Marketing | 30,900 | 12,400 |
| Insurance | 9,000 | 36,000 |
| General and administrative | 52,000 | 49,300 |

**Operating data**

| Driver | Budget | Actual |
|---|---|---|
| Wholesale loaves | 168,000 at $2.50 | 180,480 at $2.50 |
| Retail transactions | 61,000 | 55,300 |
| Retail average ticket | $10.00 | $10.24 (rounded) |

**Notes from the team**

- The annual property and liability premium of $36,000 (policy year 1 July 2025 to 30 June 2026) was paid in July and expensed in full.
- The flour contract was repriced 9% higher from 1 July. Ingredients were budgeted at 28% of revenue.
- The Eastside store has been short two bakers since August, and the gap was covered with overtime at 1.5×.
- The autumn marketing campaign planned for September was pushed to October; the full $30,900 will now be spent in Q4.
- Retail prices rose about 2.5% on 1 July. Wholesale gross margin runs about 12 points below retail.
- Utilities: a new gas tariff took effect in July, and the Westside oven was serviced late.

**Deliver** (markdown, at most ~1,200 words):

1. A variance table: budget, actual, $ variance, % variance and favourable/unfavourable for each line, with gross profit and EBITDA subtotals. State your sign convention and the formula behind each computed column.
2. A bridge from budget EBITDA to actual EBITDA, and a "normalized" EBITDA that corrects anything that should not sit in Q3, with the adjustment shown.
3. A price/volume split of the retail revenue variance, with the method.
4. Commentary for Jane, a few sentences per major variance, separating timing differences from real performance.
5. Three prioritized recommendations, including your view on whether to raise retail prices again or push wholesale volume harder, with your reasoning.

Point out any error in the bookkeeper's summary.

## A strong answer

- Gets gross profit to $453,200 budget vs $402,100 actual and EBITDA to $227,300 budget vs $163,800 actual, a $63,500 miss, and corrects the bookkeeper's $53,500.
- Normalizes insurance: $27,000 of the premium is prepaid, so Q3 expense should be $9,000 and normalized EBITDA is $190,800, $36,500 below budget. The answer also says the $18,500 marketing underspend is timing, not a saving.
- Splits retail roughly into volume (5,700 fewer transactions × $10 = −$57,000) and price/mix (about +$13,300), totalling −$43,700.
- Explains the ingredient overrun as about $28,000 above 28% of actual revenue, consistent with the flour repricing, and names the labor overtime driver.
- Recommendations follow from the data. The answer notices that growing wholesale volume lowers margin while retail traffic is falling, and keeps the sign convention consistent throughout.

## Card

brief: Build a Q3 budget-versus-actual variance report for a bakery owner, normalize EBITDA, and check the bookkeeper's summary of the miss.
given:
- Bookkeeper's summary: the stated EBITDA miss and its cause
- Q3 P&L: budget and actual for 10 lines
- Operating data: wholesale loaves, retail transactions and average ticket, budget and actual
- Team notes: 6 notes on insurance, flour, staffing, marketing, prices and utilities
asked:
- A variance table with gross profit and EBITDA subtotals, the sign convention and formulas
- A budget-to-actual EBITDA bridge and a normalized EBITDA, with the adjustment shown
- A price/volume split of the retail revenue variance, with the method
- Commentary for Jane separating timing differences from real performance
- Three prioritized recommendations, including retail price versus wholesale volume
limit: Up to about 1,200 words, in Markdown
hard: A summary figure has to be verified, some costs may not belong in the quarter, timing must be separated from performance, and the pricing-versus-volume call needs judgement.

## Scorecard

- Gross profit $453,200 vs $402,100; EBITDA $227,300 vs $163,800, a $63,500 miss, not $53,500
- Treats $27,000 of insurance as prepaid: normalized EBITDA $190,800, $36,500 below budget
- Calls the $18,500 marketing underspend timing, not a saving
- Splits retail −$43,700 into volume −$57,000 (5,700 × $10) and price/mix about +$13,300
- Ties ingredients ~$28,000 over 28% of actual revenue to flour repricing; names overtime behind labor
- Notes wholesale growth lowers margin while retail traffic falls; keeps one sign convention throughout
