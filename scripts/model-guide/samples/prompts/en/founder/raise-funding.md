---
profession: founder
task: raise-funding
language: en
deliverable: presentations
---

## Prompt

You are helping Jane Doe, co-founder and CEO of Cratewise, a fictional company that rents smart reusable delivery crates to regional grocers and sells the tracking software that goes with them. She is raising a Series A and has a first partner meeting in two weeks. She has shared her draft numbers and asked you to turn them into a pitch deck that will stand up to diligence.

**Jane's draft "key metrics" slide**

> ARR $1.1M · Net revenue retention 140% · TAM $5.76B (12,000 US regional grocers × $48K ACV) · 17 customers · Raising $6M

**Underlying data (June 2025)**

| Item | Value |
|---|---|
| Recurring subscription MRR, June 2025 | $68,000 |
| Recurring subscription MRR, January 2025 | $41,000 |
| One-time pilot and setup fees, trailing 12 months | $284,000 |
| Paying customers | 17 (1 churned in the last 12 months) |
| Cohort active in June 2024: MRR then | $30,000 |
| Same cohort: MRR in June 2025 | $33,600 |
| Total MRR in June 2025 from customers added after June 2024 | $34,400 |
| Gross margin on recurring revenue | 58% (crate depreciation included) |
| Cash in bank | $1,300,000 |
| Net burn | $160,000 per month |
| Pipeline | 9 grocers in late-stage pilots; average pilot-to-paid conversion so far 60% |
| US regional grocers (industry directory) | 12,000 |

**Plan after the raise:** grow the team from 14 to 30 people over 18 months. Net burn rises roughly linearly from $160,000 to $320,000 per month over 24 months, and the next raise is expected at about $3M ARR.

**Customer quote (with permission):** "We cut single-use cardboard by 70% in the pilot stores." (Operations director, Lakeshore Market, a fictional grocer)

**Deliver** a Series A deck in markdown, 10 to 12 slides, at most ~1,200 words. Use `### Slide n: title`, then bullets, then a one-line speaker note. Include:

- Problem, solution, why now, traction, business model and unit economics, market size, go-to-market, competition, team (use placeholders), the ask with use of funds, and milestones.
- Corrected metrics, defined the way a diligent investor would compute them, with the arithmetic shown in the speaker notes.
- A justified raise amount based on the burn plan, and a view on whether $6M is right.
- After the deck, a short "corrections for Jane" list explaining each change to her draft, in plain language.

Do not invent customers, logos or metrics beyond what is given. Mark anything that needs a source as "[source needed]".

## A strong answer

- Corrects ARR to $816K ($68K × 12). The $1.1M includes the $284K of one-time fees, which can be shown separately but not as ARR. Mentions the January-to-June MRR growth (41K to 68K, about 66%).
- Corrects net revenue retention to 112% ($33.6K ÷ $30K) and explains that 140% seems to include new-customer revenue. Checks that $33.6K + $34.4K = $68K MRR.
- Fixes the TAM arithmetic: 12,000 × $48K = $576M, not $5.76B. Notes that $48K equals the current ACV ($816K ÷ 17) and treats it as a bottom-up SAM-style figure. Larger market claims are marked "[source needed]".
- Sizes the raise from the burn plan (24 months averaging about $240K a month ≈ $5.8M, before any revenue growth), defends roughly $6M or a reasoned alternative, and notes about 8 months of current runway ($1.3M ÷ $160K).
- The deck tells a coherent story, flags the 58% gross margin as a known risk to address, uses only the data given, and follows the slide format with speaker notes.

## Card

brief: Turn a CEO's draft numbers into a Series A pitch deck that survives diligence, correcting her metrics and justifying the raise.
given:
- Draft metrics slide: ARR, NRR, TAM, customers and the raise amount
- Underlying data: 12 rows, as of June 2025, on MRR, one-time fees, a cohort, margin, cash, burn and pipeline
- Post-raise plan: team growth, rising burn and the next raise's ARR target
- Customer quote: one pilot result, used with permission
asked:
- A 10–12 slide deck from problem through milestones
- Corrected metrics, defined as an investor would, with the arithmetic in speaker notes
- A raise amount justified by the burn plan, and a view on $6M
- A "corrections for Jane" list explaining each change
limit: 10 to 12 slides, up to about 1,200 words, in Markdown slide format
hard: Headline metrics must be recomputed under investor definitions, the market maths needs checking, and the raise must be sized from a burn plan without inventing data.

## Scorecard

- ARR $816K ($68K × 12), excluding $284K one-time fees; notes MRR growth $41K to $68K (~66%)
- NRR 112% ($33.6K ÷ $30K); 140% includes new customers; checks $33.6K + $34.4K = $68K
- TAM is $576M (12,000 × $48K), not $5.76B; $48K is current ACV, a SAM-style figure
- Sizes the raise at ~$5.8M (24 months averaging ~$240K); defends ~$6M; notes ~8 months' runway
- Flags 58% gross margin as a risk; uses only given data; marks larger claims "[source needed]"
- Tells a coherent story with a speaker note on every slide
