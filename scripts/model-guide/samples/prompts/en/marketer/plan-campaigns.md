---
profession: marketer
task: plan-campaigns
language: en
deliverable: presentations
---

## Prompt

You are the demand-generation lead at Tallyroad, a B2B expense-management and job-costing platform. In Q1 2026 (Jan–Mar) Tallyroad launches into a new segment: US construction subcontractors with 10–200 employees. The CRO has set the targets: **400 sales-qualified leads (SQLs) and 80 new customers in Q1, on a $180,000 program budget.** Build the Q1 campaign plan deck for the leadership meeting.

**Channel benchmarks (Tallyroad's existing professional-services segment, last two quarters)**

| Channel | Cost per lead (CPL) | Lead → SQL |
|---|---|---|
| Paid search | $85 | 22% |
| LinkedIn lead-gen ads | $140 | 18% |
| Content syndication | $55 | 6% |
| Facebook lead ads* | $12 | 20% |

*From Tallyroad's sister brand, a consumer budgeting app.

**Segment-specific inputs**

- Paid search capacity: the keyword planner shows about 1,100 clicks a month available on construction job-costing and expense terms, at a $5.10 average CPC. Expected landing-page conversion is 6%.
- Trade show: BuildExpo West, Feb 10–12, 2026. Booth, travel and collateral cost $45,000 all-in. A peer vendor reported 300 qualified badge scans last year. Assume 15% lead → SQL.
- Sales: 3 account executives are dedicated to the segment. Each can work at most 70 SQLs a quarter.
- Funnel: SQL → closed-won is 20% in the existing segment. Average contract value is $9,600 a year.
- Positioning research (12 customer interviews): the top pains are tracking materials receipts by job (10 of 12), reimbursing field crews quickly (8 of 12), and QuickBooks sync (7 of 12).

**Deliver** a deck of 8–10 slides in markdown. Use `### Slide n: title` for each slide, followed by bullets and a one-line speaker note. The deck must include:

- a funnel-math slide showing, for each channel, the spend, leads, SQLs and cost per SQL, with the formula for each column stated, and a total row
- an honest view of whether the CRO's targets are achievable on this budget and sales capacity, and your recommended targets
- a channel mix and budget allocation that adds up to $180,000 or less
- messaging pillars tied to the interview findings
- a week-by-week or month-by-month timeline built around BuildExpo
- KPIs and the leading indicators you'll review each week
- risks, and the decision you need from leadership

Round SQLs to whole numbers. Keep it under about 1,200 words.

## A strong answer

- Excludes or heavily discounts the Facebook benchmark, because it comes from a consumer app and isn't comparable. Doesn't use its $60 cost per SQL to make the target look reachable.
- Computes cost per SQL correctly: search about $386, LinkedIn about $778, trade show about $1,000 (45 SQLs), syndication about $917. Caps search at its capacity: 3,300 clicks × 6% = 198 leads, costing $16,830, for about 44 SQLs.
- Shows that the best realistic mix (search at capacity, BuildExpo, the rest on LinkedIn) yields only about 240 SQLs for $180,000. 400 is not achievable, and 80 customers would need 400 SQLs at a 20% close rate.
- Spots the sales-capacity ceiling of 3 × 70 = 210 SQLs, and makes a judgement call. For example: plan to about 210 SQLs and about 42 customers (about $403K of new ACV), hold back unneeded spend or ask for more AE capacity, and flag that a new segment may convert below 20%.
- Messaging pillars map to the interview pains (materials receipts by job, fast crew reimbursement, QuickBooks sync). The timeline builds toward BuildExpo on Feb 10–12, and the deck closes with a specific ask to leadership.

## Card

brief: Build the Q1 2026 campaign deck for a B2B platform entering construction subcontractors, testing the CRO's targets against budget and sales capacity.
given:
- CRO's targets: SQLs, new customers and program budget
- Channel benchmarks: 4 channels' cost per lead and lead-to-SQL rate, one from a sister brand
- Segment inputs: search capacity, a trade show, sales capacity, funnel rates and contract value
- Positioning research: the top 3 pains from 12 interviews
asked:
- Funnel-math slide per channel, with formulas and a total row
- An honest view of the targets, and recommended targets
- Channel mix and budget of $180,000 or less
- Messaging pillars tied to the interviews
- Timeline built around BuildExpo
- KPIs and weekly leading indicators
- Risks and the decision needed from leadership
limit: 8–10 slides in Markdown (`### Slide n: title`, bullets, a speaker note), under about 1,200 words
hard: A benchmark may not transfer, channel and sales capacity cap the plan, and the targets need an honest judgement call.

## Scorecard

- Excludes or heavily discounts the consumer-app Facebook benchmark; doesn't use its $60 cost per SQL
- Cost per SQL: search ≈$386, LinkedIn ≈$778, BuildExpo ≈$1,000 (45 SQLs), syndication ≈$917
- Search capped: 3,300 clicks × 6% = 198 leads, $16,830, ≈44 SQLs
- Best mix yields ≈240 SQLs for $180,000: 400 SQLs and 80 customers aren't achievable
- Sales ceiling 3 × 70 = 210 SQLs; e.g. plan ≈210 SQLs, ≈42 customers (≈$403K ACV)
- Pillars match the 3 interview pains; timeline builds to BuildExpo Feb 10–12; specific leadership ask
