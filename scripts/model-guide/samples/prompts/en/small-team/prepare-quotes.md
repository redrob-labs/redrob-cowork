---
profession: small-team
task: prepare-quotes
language: en
deliverable: documents
---

## Prompt

You work at Bluewick IT, a five-person managed IT services company. Prepare a quote for a new client, Juniper Lane Dental.

**Client email (Mary Major, office manager)**

> "We'd like to replace our 10 PCs, get proper Wi-Fi, set up backups that are HIPAA compliant, and have you look after us monthly. Our budget for the project is around $15,000. Can you send a quote this week?"

**Site survey notes (John Stiles, Bluewick)**

- 11 staff users. There are **12 PCs in use**: 10 staff workstations plus 2 operatory imaging PCs connected to X-ray sensors. The imaging PCs run SensorView v6, which the imaging vendor certifies only on specific hardware. Replacing them needs the vendor's sign-off.
- Network: an ISP router, an 8-port unmanaged switch, consumer Wi-Fi, and no business firewall. 3 access points are needed for coverage.
- Backups: a USB drive rotated by the front desk. The **last successful backup was 4 months ago**. The practice-management database holds patient records.
- The existing monitors are fine and should be reused.

**Bluewick price list (cost → list sell)**

| Item | Unit cost | List sell |
|---|---|---|
| Business PC (i5, 16 GB, 512 GB SSD) | $720 | $899 |
| Wi-Fi access point | $260 | $339 |
| Firewall appliance | $480 | $629 |
| Firewall security subscription (annual) | $310/yr | $420/yr |
| 24-port managed PoE switch | $540 | $699 |
| Backup appliance | $900 | $1,190 |
| Encrypted cloud backup (vendor signs a BAA) | $95/mo | $150/mo |

**Labour and services**

- $125/hour. PC deployment and data migration: 2.5 h per PC. Network install: 10 h. Backup setup and test restore: 6 h. Project management: 10% of labour.
- Managed support: $95 per user per month.

**Bluewick quoting policy**

- Minimum **25% gross margin** on hardware, where margin = (sell − cost) ÷ sell.
- Quotes are valid for 30 days. A 50% deposit on hardware is due on acceptance, and the balance on completion.
- Bluewick will sign a Business Associate Agreement (BAA) with healthcare clients. Never describe a solution as "HIPAA certified" or "HIPAA compliant". Say it supports the client's HIPAA obligations.

**Deliver** (markdown, at most ~1,200 words):

1. A quote document: summary, scope, a line-item table (quantity, unit price, amount) for one-off costs, a separate table for recurring costs (monthly and annual), totals, assumptions and exclusions, and terms.
2. If the scope doesn't fit the budget, give options or phases. Recommend one, with the reasoning.
3. A cover email to Mary Major (at most 150 words).
4. An internal note (at most 100 words) to the owner on any pricing or scope issue you found.

## A strong answer

- Catches that the list prices are a roughly 25% *markup*, not a 25% *margin*. The PC margin is (899 − 720) ÷ 899 ≈ 19.9%, and every hardware line is below 25%. The answer re-prices to policy (cost ÷ 0.75: PC $960, AP about $347, firewall $640, switch $720, backup appliance $1,200) or flags the issue with numbers for the owner.
- Scopes 10 staff PCs and handles the 2 imaging PCs as excluded or optional pending the vendor's sign-off, explaining the 10 versus 12 count.
- The totals are correct for the prices used. Labour is 41 h × $125 = $5,125 plus 10% PM = $5,637.50. With policy pricing, the one-off total is about $18,838.50. Recurring costs are shown separately: support at 11 × $95 = $1,045/month, cloud backup at $150/month and the firewall subscription at $420/year.
- Addresses the $15,000 budget with options or phases, and prioritises the backup appliance, cloud backup and firewall in phase 1, given the 4-month-old last backup and the patient data.
- Uses compliant language (a BAA is offered, and the solution supports HIPAA obligations rather than "HIPAA compliant") and includes the 30-day validity and the 50% hardware deposit terms.
