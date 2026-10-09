---
profession: sales
task: answer-customers
language: en
deliverable: none
---

## Prompt

You are John Doe, the account manager at Brightquill, a SaaS workforce-scheduling and time-clock product for healthcare clinics. Today is **20 February 2026**. This email just arrived from a customer:

> **From:** Mary Major, Operations Director, Cedar Hollow Clinics (mary.major@example.com)
> **Subject:** Seriously considering switching
>
> John, four things.
> 1. Our February invoice jumped from $4,800 to $5,520 for the same 120 seats, and nobody told us.
> 2. Your outage on 3 February took us down for 9 hours across all clinics. Staff couldn't clock in. I want a full month's refund.
> 3. Does Brightquill support HL7, or integrate with our EHR (Mediscribe)? Our new CMO is asking.
> 4. We need 15 more seats from March, at our original price.
>
> I need answers this week.

**Contract excerpt (start date 1 March 2025, 36-month term)**

> §3.1 Fees: 120 seats at $40.00 per seat per month, billed monthly.
> §3.2 Price protection: The per-seat price is fixed for the first 24 months of the term.
> §3.3 Additional seats added during the price-protection period are billed at the §3.1 per-seat price.

**Price change notice (sent to all customers, 5 January 2026)**

> From 1 February 2026, the list price is $46 per seat per month for new contracts and renewals.

**SLA excerpt**

> Monthly Uptime % = (total minutes in the month − Downtime minutes) ÷ total minutes in the month. Downtime means the core service is unavailable. Degraded performance is excluded.
> Service credits, as a percentage of that month's fee: below 99.9% → 10%; below 99.0% → 25%; below 95.0% → 50%.
> Credits must be requested within 30 days of the incident. Credits are the sole remedy for downtime.

**Status page, incident 3 Feb 2026 (Cedar Hollow is hosted in US-East)**

> 13:05–16:45 UTC: core service unavailable in US-East.
> 16:45–18:30 UTC: degraded. Mobile clock-in sync was delayed while the backlog was processed. All punches were preserved.

**Product docs**

> Brightquill offers a FHIR R4 API for staff, shift and location data. There is no HL7 v2 interface. There are no native EHR integrations. Partners can build on the API.

**Deliver** (markdown, at most ~1,200 words):

1. A reply email to Mary Major (at most 400 words) that answers all four points with specific figures and is honest about what Brightquill can and can't do.
2. An internal note to Billing and Support, as bullets: the corrections or credits to issue and the amounts, with the calculation behind each.
3. A short explanation (at most 150 words) of any judgement call you made beyond the strict letter of the contract, and why.

## A strong answer

- Recognises that §3.2 price protection runs until 28 Feb 2027. The $5,520 February invoice (120 × $46) is therefore a billing error, and the answer commits to correcting it by $720 back to $4,800.
- Calculates the SLA credit from the status page: 220 minutes of downtime in February's 40,320 minutes gives about 99.45% uptime, which earns a 10% credit (about $480 on the correct $4,800 fee). The request is within 30 days. The answer explains the gap with the "9 hours" claim (the degraded period isn't downtime under the SLA), invites Mary to share her records, and doesn't promise a full-month refund. Any goodwill gesture is labelled and justified.
- Answers the integration question honestly: there is a FHIR R4 API, but no HL7 v2 interface and no native Mediscribe integration. A sensible next step is offered, such as a technical call.
- Confirms the 15 extra seats at $40 under §3.3: 135 seats and $5,400 a month from March.
- The tone is accountable and empathetic without grovelling or blame, and the internal note lists each action with an amount.
