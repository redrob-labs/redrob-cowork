---
profession: marketer
task: run-messaging-campaigns
language: en
deliverable: spreadsheets
---

## Prompt

You are the lifecycle marketing manager at Larder & Vine, a US meal-kit subscription. Build the win-back campaign for customers who cancelled 60–180 days ago, ready for the CRM team to load. It launches Tuesday, January 6, 2026.

**CRM export: lapsed subscribers by cancellation reason**

| Segment | Cancel reason | Contacts | Email opt-in | SMS opt-in |
|---|---|---|---|---|
| A | Too expensive | 8,400 | 7,980 | 2,100 |
| B | Too busy / travelling | 5,200 | 4,940 | 1,560 |
| C | Food quality complaint | 1,900 | 1,710 | 380 |
| D | Moved out of delivery area | 1,100 | 1,045 | 220 |
| E | No reason given | 3,400 | 3,060 | 680 |
| | **Total** | **20,000** | **18,735** | **4,940** |

**Notes from the CRM team**

- The email opt-in column was exported before the global suppression list (hard bounces and global unsubscribes) was applied. 615 opted-in addresses are suppressed: A 260, B 150, C 90, D 40, E 75. The 40 in D are all outside Denver.
- Delivery coverage expanded to the Denver metro on Oct 1, 2025. Of segment D, 260 contacts have Denver ZIP codes: 248 are email opt-ins and 52 are SMS opt-ins. The rest of D is still outside coverage.
- Every SMS opt-in is also an email opt-in and is not on the suppression list.
- Contacts span the Eastern, Central, Mountain and Pacific time zones.

**Business rules**

- Manager's request: "50% off the first box plus free dessert for life. Let's go big."
- Finance: total incentive cost must not exceed $18 per reactivated customer. The average first box is $64. A dessert add-on costs $3 per box.
- Only one offer per customer; offers don't stack.
- SMS may be sent only between 8 a.m. and 9 p.m. in the recipient's local time. Every SMS must include the brand name and "Reply STOP to opt out."
- Since September, menus have new recipes, and quality complaints are down 35% (QA report).
- Historical win-back reactivation rates: email-only sequence 2.1% of eligible contacts; email-plus-SMS sequence 3.4% of eligible contacts.

**Deliver, as markdown tables:**

1. **Audience table**: per segment, the eligible email contacts and eligible SMS contacts after suppression and coverage rules, with the formula for each column.
2. **Sequence plan**: one row per touch, giving step, send day (relative to Jan 6), channel, segment(s), send window, subject line or SMS text (SMS of 160 characters or fewer, with the character count), preview text, offer, CTA, and the exit condition.
3. **Offer table**: the offer per segment, the cost per reactivated customer, and whether it passes the finance ceiling. Include the manager's proposal as a row.
4. **Forecast**: expected reactivations per segment and in total, and the total incentive cost, with formulas.
5. **QA checklist**: at most 6 items for the CRM team.

Keep the answer under about 1,200 words.

## A strong answer

- Applies the suppression list and coverage rules: eligible email A 7,720, B 4,790, C 1,620, D 248 (Denver only), E 2,985, total 17,363. Eligible SMS is 4,772, with D reduced to 52. Excludes the rest of segment D.
- Rejects the manager's offer with the arithmetic: 50% of $64 is $32 before dessert, well over the $18 ceiling. Recommends an offer within the ceiling, for example 25% off the first box ($16), and doesn't stack the dessert.
- Tailors by segment: price-led for A, convenience and skip-a-week for B, and a quality-led message for C built on the new menus and the 35% fall in complaints. D-Denver gets a "we deliver to you now" message.
- Forecasts with the correct base: 4,772 × 3.4% ≈ 162 plus (17,363 − 4,772) × 2.1% ≈ 264, about 427 reactivations, at an incentive cost of about $6,800 at $16 each.
- SMS texts are 160 characters or fewer, include the brand name and "Reply STOP to opt out", and are scheduled within 8 a.m.–9 p.m. local time for each zone. Every sequence has an exit-on-reactivation condition.
