---
profession: sales
task: create-proposals
language: en
deliverable: presentations
---

## Prompt

You are the account executive at Cabana Connect, a SaaS guest-messaging platform for hotels (pre-arrival, in-stay chat and upsells). Build the proposal deck for Solenne Hotels, a European hotel group. The final presentation is to their COO, Jane Doe, and their CFO, Richard Miles. Your colleague John Doe drafted some slides last week, and his claims are included below.

**RFP summary (from Solenne)**

- §2 Portfolio: 12 properties, 2,160 rooms.
- §4 Requirements: WhatsApp and SMS messaging; integration with their PMS (Ostrava PMS); multilingual auto-translation; **"on-premise deployment with data stored in the EU"**; SSO.
- §6 Commercials: prices in EUR. Prefers a 3-year term.

**Discovery notes (call with Jane Doe)**

- "We're 14 hotels." Two of them open in Q2 2027, with about 300 rooms combined.
- The front desks take about 9,000 phone calls a month across the portfolio, averaging 4 minutes each. Fully loaded front-desk labour costs €24/hour.
- Pain points: guests calling for basic questions, and no upsell process.

**Cabana Connect facts**

- Cloud-only (multi-tenant). EU data residency in the Frankfurt region. ISO 27001. Native Ostrava PMS integration. SSO via SAML. WhatsApp, SMS and 40-language auto-translation.
- Benchmark from existing customers: about 35% of routine calls are deflected to messaging.
- Pilot at one Solenne property (90 days): upsell revenue averaged €1.10 per occupied room-night. The group's average occupancy is 72%.

**Price book and discount policy**

| Item | Price |
|---|---|
| Subscription | €6.00 per room per month |
| Implementation | €1,500 per property, one-time |

- Volume discount: 10% at 2,000 or more rooms. Multi-year discount: 5% for a 3-year commitment. Discounts are additive and applied to list price.
- An AE may approve up to **20%** total. Above 20%, or any implementation-fee waiver, needs VP Sales approval.

**John Doe's draft claims**

> "Saves €250k a year in front-desk labour." "Payback in under a month." "Fully meets all RFP requirements." "Let's offer 30% off to close this quarter."

**Deliver** (markdown, at most ~1,200 words):

1. An 8–10 slide deck, written slide by slide (`### Slide n: title`, 3–5 bullets each, and a one-line speaker note). Include the customer's problem, the solution, an RFP compliance summary, ROI, pricing and next steps.
2. A pricing slide or table showing list price, each discount, net annual subscription, implementation and 3-year total contract value, with the method for each line.
3. An ROI slide with the calculation shown and the assumptions labelled.
4. An internal note (at most 150 words) to John Doe and the VP Sales on the claims and the discount.

## A strong answer

- Prices the 12 live properties and 2,160 rooms. It flags the "14 hotels" versus 12 discrepancy and offers the two 2027 openings (about 300 rooms) as an option or a co-terminated add-on.
- The pricing math is right: list price €155,520/year (2,160 × €6 × 12). With 10% volume + 5% multi-year (15%), the net is €132,192/year. Implementation is €18,000. The 3-year subscription value is €396,576, or €414,576 including implementation.
- Doesn't offer 30%. Stays within the AE's 20% authority, or explicitly says that anything more needs VP approval and gives a rationale.
- Corrects the labour savings to about €60,480/year (9,000 × 35% × 4 min ÷ 60 × €24), not €250k. Treats the upsell estimate (about €624k/year gross at €1.10 × 2,160 rooms × 365 × 72%) as revenue, not profit, extrapolated from one property's pilot. Revises "payback in under a month" accordingly.
- Says honestly that the "on-premise" requirement is not met (the product is cloud-only, with EU data residency in Frankfurt) and doesn't claim full RFP compliance.

## Card

brief: Build a proposal deck for a hotel group's COO and CFO, with pricing, ROI and RFP compliance, checking a colleague's draft claims.
given:
- RFP summary: portfolio size, 5 requirements and commercial preferences
- Discovery notes: hotel count, call volumes, labour cost and pain points
- Cabana Connect facts: deployment, security, integrations, a deflection benchmark and a pilot upsell result
- Price book and discount policy: per-room and implementation prices, discounts and approval limits
- John Doe's draft claims: 4 claims on savings, payback, compliance and discount
asked:
- An 8–10 slide deck: problem, solution, RFP compliance, ROI, pricing and next steps
- A pricing table: list, discounts, net annual, implementation and 3-year total, with methods
- An ROI slide with the calculation shown and assumptions labelled
- An internal note, up to 150 words, to John Doe and the VP Sales
limit: Up to about 1,200 words, in Markdown, slide by slide with a speaker note each
hard: Sources disagree, a colleague's claims need checking, discount authority limits apply, and compliance must be stated honestly.

## Scorecard

- Prices 12 live properties, 2,160 rooms; flags "14 hotels"; offers 2027 openings (~300 rooms) as add-on
- List €155,520/year; 15% discount gives €132,192/year net; implementation €18,000
- 3-year subscription €396,576, or €414,576 including implementation
- No 30% offer: stays within the 20% AE authority, or flags VP approval with a rationale
- Labour savings ≈ €60,480/year, not €250k; upsell ≈ €624k/year is gross pilot-based revenue; payback revised
- States the on-premise requirement is unmet (cloud-only, EU data in Frankfurt); no full-compliance claim
