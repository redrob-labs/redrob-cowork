---
profession: investor
task: research-companies
language: en
deliverable: spreadsheets
---

## Prompt

You are a principal at Marrow & Finch Capital. You are evaluating Wastewise, a seed-stage company selling food-waste tracking software (a camera plus scale at the kitchen bin, with analytics) to US commercial kitchens. Before the partner meeting you need a defensible US market size and a competitor snapshot. Here is what the research turned up:

**[1] National Restaurant Census 2024 (trade association report)**
> 742,000 US restaurant locations: 38% full-service, 52% limited-service (quick-service and fast-casual), 10% other (bars, food trucks).

**[2] Institutional Foodservice Review, 2024 edition**
> About 96,000 US institutional kitchens: hospitals, universities, corporate cafeterias and K-12 central kitchens.

**[3] Wastewise company blog, "Why we built Wastewise" (2025)**
> "Food waste tech is a $4.2 billion market." (The footnote cites a global food-waste management report covering hauling, composting and anaerobic digestion.)

**[4] Analyst note, Greenline Research, May 2025**
> Waste-tracking software penetration is about 3% of US full-service restaurants and about 11% of institutional kitchens. Limited-service chains mostly use franchisor-mandated inventory tools and are "not a near-term buyer".

**[5] Pricing pages and articles**
> - "BinSight" (the established incumbent): $149 per location per month (pricing page, 2025).
> - "Kitchen Ledger": $2,400 per kitchen per year plus a $1,500 one-time hardware kit (pricing page, 2025).
> - "Scrapless": "$99/month" (TechWire article, 2021). Scrapless pricing page, 2025: "Plans start at $179/month per location".
> - Wastewise: average contract value of $2,100 per location per year (company data room).

**[6] Funding news**
> - StartupWire aggregator (2025): "Kitchen Ledger raises $40M Series B."
> - Kitchen Ledger press release (Mar 12, 2025): "Kitchen Ledger closes $14M Series B led by Orchard Lane Partners."
> - BinSight: "$22M Series C" (press release, 2023). Scrapless: "$6M seed" (press release, 2022).

**[7] Wastewise data room**
> 410 live locations, 70% institutional. Logo churn of 14% in the last 12 months, concentrated in independent full-service restaurants.

**Deliver, as markdown tables:**

1. **Market sizing**: a bottom-up US TAM and SAM, plus the current market (today's penetration × price), each row with its inputs and formula. Choose and justify which segments belong in TAM and in SAM. Use a single blended price and show how you derived it.
2. **Top-down cross-check**: one or two lines explaining why source [3] cannot be used, and what it would take to reconcile it.
3. **Competitor table**: company, pricing (annualized per location, with the source year), hardware model, latest funding (with your confidence in the figure), and the implication for Wastewise.
4. **Source reliability**: each source rated high, medium or low, with a one-line reason.
5. **Open questions for the founders**: at most 5.

Round to the nearest $1M for market figures. Keep the answer under about 1,200 words.

## A strong answer

- Builds the market bottom-up from 742,000 × 38% = 281,960 full-service locations plus 96,000 institutional kitchens = 377,960 locations. With a blended price of about $2,000–$2,150 a year, the US TAM is about $756–813M. Excludes limited-service from SAM, citing [4].
- Computes the current market from penetration: 281,960 × 3% ≈ 8,459 plus 96,000 × 11% = 10,560, about 19,000 locations, which is roughly $38–41M a year at the blended price.
- Rejects the $4.2B figure because it is global, covers hauling, composting and digestion rather than software, and is quoted by the company itself.
- Annualizes prices correctly ($149 × 12 = $1,788; Scrapless $179 × 12 = $2,148, with the 2021 $99 discarded as stale; Kitchen Ledger $2,400 plus hardware). Treats Kitchen Ledger's Series B as $14M from the primary press release, not the aggregator's $40M.
- Draws a judgement from the data, for example that Wastewise's institutional skew suits the higher-penetration, lower-churn segment, and that its 14% churn among independent restaurants questions whether full-service belongs in SAM. Turns that into a founder question.
