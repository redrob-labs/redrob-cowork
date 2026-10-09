---
profession: lawyer
task: review
language: en
deliverable: documents
---

## Prompt

You are in-house counsel at Riverbend Health Network, a New York hospital system. Procurement wants to sign Calyx Workforce Software, Inc.'s Master Subscription Agreement (MSA) for ShiftPilot, a nurse-scheduling platform, by Friday. ShiftPilot imports the daily patient census, including patient names, units and acuity scores, to set staffing levels. The order form: 3-year initial term, a $180,000 per year subscription and a one-time $60,000 implementation fee. Review the excerpts against Riverbend's playbook and prepare the review memo.

**Riverbend contracting playbook (SaaS)**

| Topic | Position |
|---|---|
| Liability cap | At least 12 months of all fees paid or payable; a super-cap of at least 3× annual fees for data-protection breaches |
| Indemnities | Vendor indemnifies for IP infringement and for its data breaches, outside the cap |
| Renewal | Renewal terms of 1 year or less; notice period of 60 days or less; renewal price increase of 3% or less |
| PHI | A signed Business Associate Agreement (BAA) is required before any PHI is shared |
| SLA | 99.9% monthly uptime; credits are not the sole remedy for chronic failure |
| Law / venue | New York law; courts in New York County |
| Exit | Data export in a standard format at no charge; 60 days to retrieve data after termination |

**MSA excerpts**

> **1.7 "Fees"** means the recurring subscription fees under an Order Form, excluding implementation, professional services and pass-through charges.
>
> **7.3** Vendor will comply with the Business Associate Agreement attached as Exhibit C.
>
> **Exhibit C.** [Intentionally omitted.]
>
> **8.1** Vendor will use commercially reasonable efforts to make the Service available 99.5% of each month, excluding scheduled maintenance announced at least 24 hours in advance. Service credits are Customer's sole and exclusive remedy for any failure to meet this commitment.
>
> **9.1** EXCEPT FOR OBLIGATIONS UNDER SECTION 10.4, EACH PARTY'S AGGREGATE LIABILITY ARISING OUT OF THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID BY CUSTOMER IN THE THREE (3) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.
>
> **9.2** NEITHER PARTY SHALL BE LIABLE FOR INDIRECT, INCIDENTAL OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF DATA AND COSTS OF BREACH NOTIFICATION OR CREDIT MONITORING.
>
> **10.1** Vendor will defend Customer against third-party claims that the Service infringes a U.S. patent, copyright or trademark. **10.2** Customer will defend and indemnify Vendor against any claim arising from Customer Data. **10.3** This Section 10 states each party's entire liability for third-party claims. *(There is no Section 10.4.)*
>
> **12.2** This Agreement renews automatically for successive three (3)-year terms unless either party gives notice of non-renewal at least 120 days before the end of the then-current term. Fees for a renewal term may increase by up to 9%.
>
> **13.1** This Agreement is governed by the laws of the State of New York. The parties submit to the exclusive jurisdiction of the state and federal courts located in Wilmington, Delaware.
>
> **14.3** Vendor will delete Customer Data 30 days after termination. Export assistance is available at Vendor's then-current professional-services rates.

**Statutes (abridged)**

> N.Y. Gen. Oblig. Law §5-1401(1): parties to a contract covering in the aggregate not less than $250,000 may agree that New York law governs, whether or not the contract bears a reasonable relation to New York.
>
> N.Y. Gen. Oblig. Law §5-903(2): an automatic-renewal provision in a contract "for service, maintenance or repair to or for any real or personal property" is unenforceable against the recipient unless the provider gives written notice, served personally or by certified mail, at least 15 and not more than 30 days before the deadline for the recipient's notice, calling attention to the provision.

**Deliver** a review memo in markdown with these headed sections:

1. Bottom line: sign / don't sign yet, and why
2. Issues table: clause, issue, risk (High/Medium/Low), proposed redline language, and an acceptable fallback
3. The five points to win on Friday's call, in priority order
4. Notes on the two statutes: whether and how each helps Riverbend

Quantify the cap. Keep it under about 1,200 words.

## A strong answer

- Puts the BAA first as the blocking issue: ShiftPilot will receive PHI, and Exhibit C is omitted. Recommends not signing, or not going live with census data, until a BAA is signed.
- Quantifies the cap: "Fees" excludes implementation, so three months is $180,000 ÷ 12 × 3 = $45,000, against a playbook cap of at least $240,000 in year 1 ($180,000 + $60,000) and a $540,000 super-cap.
- Notices that the carve-out cross-refers to a non-existent §10.4, so even the IP indemnity falls under the $45,000 cap. Also notes that 9.2 excludes breach-notification costs, and that the 10.2 customer indemnity is broad and uncapped.
- Flags the renewal (3-year terms, 120 days' notice, +9%), the 99.5% SLA with credits as the sole remedy, the Delaware venue, and the exit terms (30-day deletion, paid export), each with redlines tied to the playbook.
- Gets the statutes right. §5-1401 is satisfied (an aggregate of $600,000 or more), so the New York choice of law holds, but it doesn't fix the venue. Whether §5-903 applies to SaaS is uncertain (is SaaS "service … to or for … personal property"?), so the memo calendars the deadline and negotiates the clause rather than relying on the statute.
