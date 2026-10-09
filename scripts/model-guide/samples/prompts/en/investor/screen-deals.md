---
profession: investor
task: screen-deals
language: en
deliverable: spreadsheets
---

## Prompt

You are an associate at Halden Peak Ventures. The partners' Monday meeting has room for three first meetings. Screen this week's inbound Series A pipeline against the fund's criteria and recommend which three to take.

**Fund criteria (all must pass unless a partner waives one)**

| Criterion | Threshold |
|---|---|
| Sector | B2B software; no hardware-dependent revenue |
| Geography | Headquartered in the US or Canada |
| ARR (recurring only) | $1.5M – $4.0M |
| YoY ARR growth | ≥ 80% |
| Net revenue retention (NRR) | ≥ 110% |
| Gross margin | ≥ 70% |
| Burn multiple (net burn ÷ net new ARR, trailing 12 months) | ≤ 2.0 |
| Round | We lead with an $8M–$12M check, so the round size must be at least $8M |

**Pipeline (founder-reported, from the CRM; $M)**

| Company | What it does | HQ | ARR now | ARR 12 mo ago | Net burn (TTM) | NRR | Gross margin | Raising |
|---|---|---|---|---|---|---|---|---|
| Ledgerly | AP automation for mid-market | Chicago | 3.2 | 1.6 | 2.4 | 118% | 78% | 10.0 |
| Fleetwise | Fleet telematics: SaaS + in-vehicle devices | Denver | 2.8 | 1.4 | 3.5 | 121% | 52% | 12.0 |
| Quorum HR | HR compliance workflows | Atlanta | 4.6 | 2.9 | 2.0 | 113% | 82% | 15.0 |
| Parcel Lane | Shipping orchestration for 3PLs | Columbus | 3.9 | 1.5 | 2.6 | 112% | 74% | 11.0 |
| Sentinel Docs | AI contract review for in-house legal | Boston | 2.4 | 0.6 | 1.8 | 125% | 80% | 9.0 |
| Northbeam Analytics | Marketing attribution | Austin | 2.1 | 1.0 | 1.4 | 104% | 81% | 6.0 |
| Tallow | Back-office SaaS for restaurant groups | Toronto | 1.9 | 0.9 | 1.6 | 115% | 72% | 9.0 |
| Corvid Security | Endpoint security for SMBs | London, UK | 3.5 | 1.7 | 2.7 | 116% | 79% | 10.0 |

**Notes from the data rooms and first calls**

- Parcel Lane: the "ARR now" figure includes $1.1M of one-time implementation fees billed in the last 12 months. The ARR from 12 months ago comes from last year's deck and is recurring only.
- Sentinel Docs: ARR is "December revenue × 12". December revenue was $200K, which included a one-off $90K pilot fee.
- Tallow: its largest customer is 40% of ARR, on a contract that renews in 5 months.
- Corvid Security: "planning a Delaware flip and a New York office next year". All customers are currently in the UK and EU.
- Northbeam: a partner, Jane Doe, knows the founders well and would consider waiving one criterion "if the rest is outstanding".

**Deliver, as markdown tables:**

1. **Screening table**: one row per company, with the corrected recurring ARR, YoY growth %, burn multiple, a pass/fail for each criterion, and the number of criteria failed. State the formula for each computed column. Where you corrected a founder-reported number, show both the reported and the corrected value.
2. **Ranking**: the top three for Monday, each with a two-sentence rationale and the three questions to ask in the first meeting.
3. **Near-misses**: up to three companies worth a waiver discussion, with the criterion that would need waiving and your view on whether to waive it.

Round growth to one decimal place and burn multiples to two. Keep the answer under about 1,200 words.

## A strong answer

- Corrects Parcel Lane to $2.8M recurring ARR, giving growth of 86.7% (not the 160% the reported figures imply) and a burn multiple of exactly 2.00, which is a borderline pass. Corrects Sentinel Docs to $110K × 12 = $1.32M ARR, which fails the ARR floor, with a burn multiple of 2.50.
- Computes the rest correctly: Ledgerly 100% growth and 1.50 burn multiple; Fleetwise 2.50 (also failing on gross margin and hardware); Quorum HR 58.6% growth and 1.18, with ARR above the range; Northbeam 1.27, failing on NRR and round size; Tallow 111.1% and 1.60; Corvid 105.9% and 1.50, failing on geography.
- Ledgerly is in the top three. The other picks are reasoned, for example Tallow (passes every criterion, with its 40% concentration and renewal date listed as the first diligence question) and Parcel Lane on recurring figures.
- Takes a clear position on waivers. For example, Corvid's geography is the most waivable gap if the US expansion is real, while Northbeam fails two criteria, so one waiver can't rescue it despite the relationship.
