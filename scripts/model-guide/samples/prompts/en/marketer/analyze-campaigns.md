---
profession: marketer
task: analyze-campaigns
language: en
deliverable: spreadsheets
---

## Prompt

You are the marketing analyst at Ridgeback Outfitters, a direct-to-consumer outdoor-gear brand. The "Autumn Launch" campaign ran from July 1 to September 30, 2025. The CMO's draft board slide says: **"Autumn Launch delivered 2,480 conversions and $321,500 in revenue at a 2.37× ROAS."** Analyse the results and recommend the Q4 budget split.

**Ad platform exports (as reported by each platform)**

| Channel | Spend | Platform conversions | Platform revenue | Export date range |
|---|---|---|---|---|
| Meta | $42,000 | 610 | $79,300 | Jul 1 – Sep 30 |
| Google Search | $36,000 | 540 | $75,600 | Jul 1 – Sep 30 |
| Google Performance Max | $28,000 | 470 | $61,100 | Jul 1 – Sep 30 |
| TikTok | $18,000 | 220 | $24,200 | Jul 15 – Oct 14 |
| Affiliate network | $9,000 | 260 | $33,800 | Jul 1 – Sep 30 |
| Email | $2,500 | 380 | $47,500 | Jul 1 – Sep 30 |

**Shopify orders tagged to the campaign, with GA4 last-click channel, Jul 1 – Sep 30**

| GA4 channel | Orders | Revenue |
|---|---|---|
| Meta | 330 | $41,250 |
| Google Search | 420 | $56,700 |
| Google PMax | 260 | $33,280 |
| TikTok | 90 | $9,900 |
| Affiliate | 210 | $27,720 |
| Email | 250 | $35,000 |
| Direct / organic | 80 | $9,350 |
| **Total** | **1,640** | **$213,200** |

**Other facts**

- Gross margin on campaign orders is 55%, after cost of goods, shipping and payment fees.
- The affiliate "spend" covers commissions only. The network also charged a $4,000 platform fee for the quarter.
- Google reports that 35% of PMax conversions came from brand-name search queries.
- A geo holdout test on Meta in August (10 matched regions dark for 3 weeks) showed a 14% lift in total store orders in the regions where ads ran.
- The TikTok team says the "Oct numbers are tiny, so the window doesn't matter".

**Deliver, as markdown tables:**

1. **Reconciliation**: platform-claimed conversions and revenue against Shopify actuals, with the over-attribution in units and %.
2. **Channel scorecard**: for each channel, the true cost (spend plus fees), GA4 orders, GA4 revenue, ROAS, CAC, contribution (revenue × margin − cost) and a verdict. State every formula.
3. **Corrected headline numbers** for the board slide: orders, revenue, blended ROAS, and total contribution, with a one-sentence corrected headline.
4. **Q4 budget recommendation**: the same total as Q3 spend plus fees, reallocated by channel, with the rationale, and a note on where last-click under- or over-credits a channel.
5. **Caveats and next tests**: at most 5 bullets.

Round ROAS to two decimal places and money to the nearest dollar. Keep the answer under about 1,200 words.

## A strong answer

- Explains that the CMO's figures add up the platforms' self-reported numbers: 2,480 conversions and $321,500 against 1,640 actual orders and $213,200. That is over-attribution of 840 orders (about 51%), and $321,500 ÷ $135,500 = 2.37× is not a real ROAS. Also flags that TikTok's export window doesn't match the campaign period.
- Includes the $4,000 affiliate fee: true cost is $139,500. Corrected blended ROAS is $213,200 ÷ $139,500 ≈ 1.53×. Contribution is $213,200 × 55% − $139,500 = −$22,240, so the campaign lost money on a first-order basis.
- Computes channel ROAS correctly: Meta 0.98, Search 1.58, PMax 1.19 (and lower once brand cannibalisation is considered), TikTok 0.55, Affiliate 2.13, Email 14.00.
- Shows judgement on attribution: uses the Meta holdout to argue that last-click under-credits Meta, discounts PMax for brand queries, and treats TikTok as the weakest case. Doesn't cut purely on last-click ROAS.
- The Q4 allocation sums to $139,500, follows from the scorecard, and proposes specific tests, such as a TikTok holdout, PMax with brand exclusions, and a repeat-purchase or LTV view to complement first-order contribution.
