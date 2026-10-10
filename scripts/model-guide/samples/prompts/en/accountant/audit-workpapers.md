---
profession: accountant
task: audit-workpapers
language: en
deliverable: documents
---

## Prompt

You are the audit senior on the 2024 audit of Ridgeway Components Inc., a mid-sized machined-parts manufacturer. The engagement plan relies on the control "Disbursements are approved at the correct level and three-way matched before payment" to reduce substantive testing of expenses. The first-year staff, Richard Roe, tested the control and left you his results. Finish the workpaper.

**Client approval policy (excerpt)**

> Invoices up to $5,000: Operations Manager. Over $5,000 up to $25,000: Director. Over $25,000: CFO. Approval must be given before payment. Invoices must match the PO and receiving report; a price variance over 5% of the PO needs fresh approval at the right level. Utilities and professional services under a signed engagement letter are exempt from the PO requirement.

**Population and plan:** H1 2024 disbursements, 1,240 payments, $8.96m. Firm sampling table for a control tested once per payment: tolerable deviation rate 10%, expected deviations 0, sample size 25. Richard selected every 124th payment from a random start and tested 10 items.

**Richard's test results**

| # | Paid | Vendor | Invoice ($) | PO ($) | Approver | Approved | 3-way match |
|---|---|---|---|---|---|---|---|
| 1 | 02-06 | Kestrel Packaging | 4,180.00 | 4,180.00 | Ops Manager | 02-01 | Yes |
| 2 | 02-19 | Alder Logistics | 12,640.00 | 12,000.00 | Director | 02-12 | Yes |
| 3 | 03-04 | Brightwell Chemicals | 24,800.00 | 24,800.00 | Director | 02-27 | Yes |
| 4 | 03-22 | Miles & Roe LLP (legal) | 31,500.00 | n/a | CFO | 03-18 | Engagement letter |
| 5 | 04-10 | Kestrel Packaging | 3,950.00 | 3,950.00 | Ops Manager | 04-15 | Yes |
| 6 | 04-28 | Summit IT Services | 18,200.00 | 18,200.00 | Director | 04-20 | Yes |
| 7 | 05-09 | Cobalt Freight | 7,410.00 | 7,410.00 | Ops Manager | 05-02 | Yes |
| 8 | 05-30 | Northgate Utilities | 2,215.33 | n/a | Ops Manager | 05-28 | Exempt |
| 9 | 06-14 | Alder Logistics | 11,980.00 | 12,000.00 | Director | 06-07 | Yes |
| 10 | 06-27 | Pinecrest Tooling | 9,875.00 | 9,875.00 | Director | 06-21 | Yes |

Richard's conclusion: "No exceptions noted. Control operating effectively."

**Vendor ledger excerpt, Brightwell Chemicals, 4 March 2024 payment run**

| Invoice | PO | Amount ($) | Approved by | Approved |
|---|---|---|---|---|
| BW-7731 | PO-4410 | 24,800.00 | Director | 02-27 |
| BW-7732 | PO-4411 | 24,600.00 | Director | 02-27 |

Both invoices are for the same coolant concentrate, delivered on the same day.

**Deliver** a workpaper in markdown, at most ~1,200 words, with these sections: Objective; Population and sample (including whether the sample is adequate); Attributes tested and a results table with a tickmark legend; Exceptions with root cause; Conclusion on the control and its effect on the audit plan; Proposed management letter points. Re-perform the test yourself instead of relying on Richard's conclusion. Where you have to make a judgement (for example, whether to extend the sample, or how to classify the deficiency), state it and justify it.

## A strong answer

- Finds three deviations Richard missed: item 2 (5.33% price variance, more than 5%, with no re-approval), item 5 (approved 04-15, after payment on 04-10) and item 7 ($7,410 approved by the Ops Manager instead of a Director). Items 4 and 8 are correctly exempt.
- Notes the sample is undersized (10 tested against the 25 required) and that 3 deviations in 10 already exceed the 10% tolerable rate, so extending the sample cannot rescue reliance.
- Identifies the Brightwell invoices BW-7731 and BW-7732 ($49,400 combined, same goods, same day, same approval) as a likely split to avoid CFO approval, and recommends follow-up, such as a duplicate or split-invoice scan of the population.
- Concludes the control cannot be relied on, says substantive testing of expenses and disbursements must increase, and gives a reasoned classification of the deficiency (at least significant, considered for material weakness) to communicate to those charged with governance.
- The workpaper has a tickmark legend, a clear review trail and specific management-letter recommendations.
