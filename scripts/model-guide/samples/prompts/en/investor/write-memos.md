---
profession: investor
task: write-memos
language: en
deliverable: documents
---

## Prompt

You are a vice president at Stonebridge Growth Partners. Write the investment committee memo for a proposed $15M Series B investment in Molarity Health, Inc., which sells cloud practice-management software to US dental practices. The deal lead, Richard Miles, has sent the materials below and a one-line ask: "Recommend we invest; we'll own 25%."

**Financial summary ($M; management figures)**

| | FY2023 | FY2024 | LTM Sep-2025 |
|---|---|---|---|
| ARR (period end) | 7.0 | 11.2 | 14.0 |
| Revenue | 6.0 | 10.5 | 13.2 |
| Cost of revenue (reported) | 1.4 | 2.0 | 2.5 |
| Gross margin (reported) | 76.7% | 81.0% | 81.1% |
| Net burn | 6.1 | 9.0 | 9.6 |

Footnote 4: "Starting in FY2024, AWS hosting costs ($0.9M in FY2024; $1.1M in LTM) are classified as R&D because they support product development environments." Engineering confirmed on a diligence call that about 85% of that AWS spend is production hosting.

**Cohort net revenue retention (trailing 12 months)**

| Customer cohort | 2022 | 2023 | 2024 |
|---|---|---|---|
| NRR | 124% | 112% | 103% |

Annual logo churn is 9%. The largest customer, BrightSmile DSO (a 140-office dental service organization), accounts for 18% of ARR.

**Reference calls (summaries)**

- An independent practice owner: "Scheduling and insurance verification save my front desk two hours a day."
- A regional group (12 offices): "Support has slipped since they grew. We're staying, but we're watching."
- BrightSmile DSO's COO: "It works well. We've hired a CTO and are evaluating building our own platform in 2026."

**Term sheet excerpt**

> Investment: $15,000,000 of Series B Preferred at a pre-money valuation of $60,000,000. The pre-money valuation includes an unallocated option pool equal to 10% of the post-money fully diluted capitalization. 1x non-participating liquidation preference. One board seat.

The current unallocated option pool equals 3% of the pre-money fully diluted capitalization. Cash at Sep 30, 2025: $8.0M. Current net burn: about $0.8M per month.

**Deliver** an IC memo in markdown with these headed sections:

1. Recommendation (invest / invest with conditions / pass), in one paragraph up front
2. Company and thesis (at most 3 bullets)
3. Key metrics table, restated where you disagree with management, with each formula shown
4. Valuation and terms: ownership and effective pre-money
5. Key risks and mitigants
6. Diligence items to close before signing
7. What we'd need to believe

Write for partners who will read it in five minutes. Keep it under about 1,200 words.

## A strong answer

- Corrects the ownership: $15M ÷ $75M post-money = 20%, not 25%. Explains the option-pool shuffle: the pool must grow from about $1.8M (3% of $60M) to $7.5M (10% of $75M), so the effective pre-money for existing holders is about $54.3M.
- Restates FY2024 gross margin with production hosting moved back into cost of revenue: (10.5 − 2.0 − about 0.77) ÷ 10.5 ≈ 73.7% (or 72.4% if all $0.9M is moved). Restates LTM similarly, at about 74%. Flags the reclassification as a quality-of-reporting issue.
- Computes FY2024 ARR growth of 60% and a burn multiple of 9.0 ÷ 4.2 ≈ 2.14, and runway of about 10 months. Notes the falling cohort NRR (124% → 112% → 103%).
- Treats BrightSmile (18% of ARR, considering an in-house build) as a top risk, with a specific mitigant or condition, for example a multi-year renewal before closing or a valuation adjustment.
- Gives a clear recommendation consistent with the analysis, for example invest with conditions, or pass at these terms. Diligence items tie back to the issues found, such as hosting costs, the BrightSmile contract and support quality.
