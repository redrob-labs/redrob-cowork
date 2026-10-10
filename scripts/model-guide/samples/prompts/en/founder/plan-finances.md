---
profession: founder
task: plan-finances
language: en
deliverable: spreadsheets
---

## Prompt

You are the founder and CEO of Fieldnote Analytics, a fictional startup selling soil-moisture analytics to farm co-ops on monthly subscriptions. Your co-founder, John Doe, built a quick runway estimate. You want a proper 18-month cash budget for January 2026 to June 2027 before the board meeting, and a decision on hiring and fundraising timing.

**John's estimate**

> Payroll $105,000/mo (= $1.26M ÷ 12), data license $12,000/mo, other opex $38,000/mo, revenue $52,000/mo. Burn ≈ $103,000/mo. Cash $2.4M → runway about 23 months. We can afford all four hires and raise in mid-2027.

**Facts and assumptions**

| Item | Value |
|---|---|
| Cash, 1 January 2026 | $2,400,000 |
| Opening MRR, January 2026 | $52,000 |
| New MRR added per month | $6,000 through June 2026; $9,000 from July 2026 (once the new AE is ramped) |
| Churn | 2% of each month's opening MRR |
| Revenue and collection | Each month's revenue = opening MRR, collected in the same month |
| Gross margin | 78% (hosting and data processing) |
| Current team | 9 people, $1,260,000 total annual base salary |
| Payroll burden | 22% on all cash compensation (taxes and benefits) |
| Planned hires | 2 engineers at $165,000 each, start 1 March 2026; 1 account executive at $160,000 OTE (assume variable paid at target, monthly), start 1 April 2026; 1 customer success manager at $90,000, start 1 July 2026 |
| Other opex | $38,000/mo, plus $1,500/mo per new hire from their start month |
| Satellite data license | $144,000 a year, paid in full each January |

Board policy: a raise should close while you still have at least 6 months of cash at the then-current burn. Raises take about 5 months from first meeting to cash.

**Deliver** (markdown, at most ~1,200 words):

1. A monthly table for January 2026 to June 2027 with these columns: opening MRR, revenue, gross profit, payroll (burdened), other opex, data license, net burn and ending cash. State the formula for each column.
2. A short reconciliation of where John's estimate goes wrong, with the effect of each error on monthly burn.
3. The month cash runs out under this plan, and the latest month to start fundraising under the board policy.
4. Your recommendation: keep the hiring plan as is, delay or cut a hire, or raise earlier. Model at least one alternative scenario briefly (for example, delaying the CS hire, or not hiring the AE and keeping new MRR at $6,000) and say what it does to runway.

Round to the nearest dollar, and state any assumption you add.

## A strong answer

- Finds John's three errors: payroll without the 22% burden (and without the new hires), the data license spread over the year when the cash leaves in January, and revenue subtracted in place of gross profit (78%).
- January 2026 net burn is about $269,540 (payroll $128,100 + opex $38,000 + license $144,000 − gross profit $40,560). Burn settles at about $155,000–$170,000 a month mid-2026 and falls slowly as MRR grows.
- Under the full plan, cash runs out around March 2027, about 14–15 months, not 23. The second license payment in January 2027 is a cliff.
- Works back from the board policy: the raise must close by about August 2026 (about $1.03M left, roughly 6 months of burn), so fundraising has to start around March or April 2026, almost immediately and far earlier than mid-2027. The answer says this plainly.
- MRR is computed correctly (opening × 0.98 + new MRR). Formulas are stated for every column, and the alternative scenario is modelled with a quantified runway effect and a clear, justified recommendation.
