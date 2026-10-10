---
profession: investor
task: review-diligence
language: en
deliverable: spreadsheets
---

## Prompt

You are on the deal team at Alder Row Equity. Alder Row is considering acquiring Keystone Fleet Software, Inc. at a price based on a multiple of ARR. Management's data room states "ARR of $2.1M at June 30, 2025", and the deck says "ARR = annualized contracted recurring revenue from live customers, in USD". Reconcile management's ARR schedule to the contract abstracts and billing data below, and produce a diligence-adjusted ARR.

**Management ARR schedule (June 30, 2025, USD)**

| # | Customer | ARR |
|---|---|---|
| C1 | Atlas Freight | 420,000 |
| C2 | Birchway Foods | 310,000 |
| C3 | Cobalt Mining Co. | 275,000 |
| C4 | Delmar Transit | 240,000 |
| C5 | Evergreen Utilities | 198,000 |
| C6 | Fairhaven Logistics | 180,000 |
| C7 | Granite Builders | 150,000 |
| C8 | Halcyon Retail | 132,000 |
| C9 | Ironwood Ag (Canada) | 120,000 |
| C10 | Juniper Couriers | 75,000 |
| | **Total** | **2,100,000** |

**Contract abstracts and billing data (prepared by the legal and finance diligence teams)**

- **C1:** 3-year term, Jan 1, 2024 – Dec 31, 2026. Annual subscription fee: Year 1 $300,000, Year 2 $360,000, Year 3 $420,000.
- **C2:** Subscription of $260,000 a year. Separate one-time implementation fee of $50,000, invoiced in February 2025.
- **C3:** Term ended Mar 31, 2025. A renewal proposal was sent Apr 10, 2025 and is unsigned. Product usage logs show no logins since May 1, 2025.
- **C4:** $240,000 a year, term to Dec 31, 2027. Clause 14.2: "Customer may terminate for convenience on ninety (90) days' written notice at any time after September 30, 2025."
- **C5:** $198,000 a year, term to Jun 30, 2026. No issues.
- **C6:** List fee of $15,000 a month. Order form: "20% introductory discount applies through December 31, 2025." June 2025 invoice: $12,000.
- **C7:** $150,000 a year, term to Mar 31, 2027. No issues.
- **C8:** Signed Jun 20, 2025. Subscription of $132,000 a year, service start date Sep 1, 2025. Not yet onboarded.
- **C9:** Contract is in Canadian dollars: CAD 120,000 a year. Use the June 30, 2025 rate of 0.73 USD per CAD.
- **C10:** No minimum commitment; billed monthly on usage. Invoices: April $4,750, May $5,500, June $6,250.

**Deliver, as markdown tables:**

1. **Reconciliation table**: customer, management ARR, adjusted ARR, adjustment ($), issue category (e.g. ramp, one-time fee, churned, FX, not live, usage-based, discount, termination risk), and the basis for each adjustment. State the formula for each computed figure.
2. **Bridge**: management ARR → adjusted live ARR, by category, plus a separate line for contracted-but-not-live ARR.
3. **Risk-weighted view**: list the customers whose ARR is real today but at risk in the next 12 months, with the reason and the ARR at stake.
4. **Concentration**: the top 3 customers as a share of adjusted ARR.
5. **Summary for the investment committee**: at most 6 bullets, including the effect on purchase price at management's proposed 6.0× ARR multiple.

Where the treatment is a judgement call (for example C6 and C10), state the alternative and its impact. Keep the answer under about 1,200 words.

## A strong answer

- Makes the core adjustments: C1 to the Year 2 rate of $360,000 (−$60,000); C2 to $260,000 (−$50,000 one-time fee); C3 to $0, as churned or unrenewed (−$275,000); C9 to $87,600 (−$32,400 FX).
- Treats C8 as contracted-not-live, so $0 in live ARR with $132,000 shown separately, under the deck's own definition. C6 is taken at the current billed $144,000 (−$36,000) with $180,000 noted as the alternative after the discount expires. C10 is taken at the 3-month average, $5,500 × 12 = $66,000 (−$9,000), noting that management annualized June ($6,250 × 12 = $75,000) and that usage revenue is uncommitted.
- Arrives at adjusted live ARR of about $1,505,600 (−$594,400, or −28.3%), or $1,637,600 including C8. The bridge ties exactly to $2,100,000.
- Flags C4 ($240,000, terminable for convenience after Sep 30, 2025) and C5 (renewal due Jun 2026) as at-risk. Computes the top-3 concentration, with C1 about 23.9% of adjusted ARR.
- Translates the result into price: at 6.0×, $2.1M implies $12.6M against about $9.03M on adjusted ARR, a gap of about $3.57M. Recommends how to handle it, such as a re-price, an earn-out tied to C3 or C8, or an escrow.
