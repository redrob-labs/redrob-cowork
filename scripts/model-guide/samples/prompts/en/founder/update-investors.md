---
profession: founder
task: update-investors
language: en
deliverable: presentations
---

## Prompt

You are John Doe, CEO of Mealcraft, a fictional marketplace that books office catering from local restaurants for corporate clients. The Q3 2025 board meeting is in five days. Your head of finance, Mary Major, sent the numbers and a draft headline slide. Build the board deck.

**KPIs**

| Metric | Q2 2025 actual | Q3 2025 plan | Q3 2025 actual |
|---|---|---|---|
| Gross merchandise value (GMV) | $4.20M | $5.00M | $4.65M |
| Take rate | 14.0% | 15.0% | 13.5% |
| Net revenue (GMV × take rate) | $588,000 | $750,000 | $627,750 |
| Contribution margin (% of net revenue) | 38% | 42% | 35% |
| Active corporate accounts | 210 | 250 | 236 |
| Net burn for the quarter | $1.35M | $1.20M | $1.41M |
| Cash at quarter end | $6.90M | | $5.49M |

**Context**

- In August we signed Bluepeak Insurance (fictional), now 12% of Q3 GMV, at a 9% take rate for the first 12 months to win the deal.
- Two restaurant partners in the busiest city left after late-payment complaints. Payment terms to restaurants were moved from net 30 to net 7 in September, which cost about $180,000 of working capital in Q3.
- The enterprise sales hire planned for July started in September.
- Repeat orders from accounts active for 6 or more months rose from 61% to 66%.
- The next priced round was planned for Q2 2026.

**Mary's draft headline slide**

> Q3: GMV +17% QoQ, revenue +11% QoQ, 236 accounts. Runway 18 months. On track.

**Deliver** a board deck in markdown, 8 to 10 slides, at most ~1,200 words. Use `### Slide n: title`, then bullets, then a one-line speaker note. Include:

- An honest summary up front: what went well, what missed and why.
- A KPI slide against both plan and the prior quarter, with the formula for each computed figure in the speaker note.
- A take-rate and contribution-margin bridge explaining the miss, including the Bluepeak effect.
- Cash and runway, with the method.
- Two or three options for the next two quarters, such as cutting burn, raising a bridge, or bringing the round forward, with the trade-offs and your recommendation.
- A specific "decisions and asks from the board" slide.

After the deck, add a short note to Mary listing what you changed on her headline slide and why.

## A strong answer

- Corrects the growth figures: GMV is +10.7% QoQ (4.65 ÷ 4.20), not +17%, and net revenue is +6.8% (627,750 ÷ 588,000), not +11%. Shows the 7% GMV miss against plan and the 16% net-revenue miss.
- Corrects runway: $1.41M a quarter ≈ $470K a month, so $5.49M lasts about 11.7 months, not 18. The answer notes that this pulls the Q2 2026 raise timeline into question, and whether the $180K one-time working-capital effect should be normalized out (giving about 13 months).
- Explains the take-rate drop with the Bluepeak mix. At 12% of GMV and a 9% rate, Bluepeak pulls the blended rate down by about 0.6 points. Without Bluepeak the rate would be about 14.1%, so Bluepeak explains the whole drop from 14.0% to 13.5% and much of the gap to the 15% plan. Contribution-margin pressure and the restaurant churn are covered too.
- Drops "On track", leads with the miss, and still credits the real positives (accounts up 26, repeat orders 61% to 66%, a large logo).
- Gives concrete options with numbers, such as the burn needed for 18 months of runway (about $305K a month), and makes specific board asks. The slide format has a speaker note on every slide.
