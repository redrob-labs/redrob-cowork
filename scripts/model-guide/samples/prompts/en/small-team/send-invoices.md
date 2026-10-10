---
profession: small-team
task: send-invoices
language: en
deliverable: documents
---

## Prompt

You run billing at Halyard Films, a three-person video production studio (hello@halyardfilms.example.com). Today is **10 March 2026**. You need to issue the final invoice for the Marlow Bikes brand film, which was delivered today, and deal with the overdue accounts.

**Marlow Bikes SOW (signed 28 Jan 2026; client contact Jane Doe, ap@marlowbikes.example.com)**

> Fixed fee: $18,000 for one 90-second brand film. 50% deposit at signing; balance on delivery.
> Change orders: billed at the day rate of $1,400 per day. A change order **must be approved in writing by the named client contact (Jane Doe)**.
> Expenses: travel, equipment rental and permits are billable at cost plus 10% handling. Meals are not billable.
> Payment terms: net 15. Late fee: 1.5% per month on overdue balances.

**Marlow job file**

| Item | Detail |
|---|---|
| INV-0141 | Deposit of $9,000, paid 2 Feb |
| CO-1 | Extra shoot day (1 day). Approved by Jane Doe by email on 20 Feb |
| CO-2 | Extra 30-second cut-down (0.5 day). Requested by John Doe (Marlow marketing intern) in Slack on 3 Mar. No approval from Jane Doe on file |
| Expenses | Drone rental $640; mileage $186; crew meals $212; location permit $350 |

No sales tax applies to these services. Halyard's next invoice number is INV-0152.

**Accounts receivable (before today)**

| Invoice | Client | Amount | Due | Contract late-fee clause? | Notes |
|---|---|---|---|---|---|
| INV-0133 | Pellworth Coffee | $4,200 | 5 Jan | Yes, 1.5%/month | Two reminders sent (15 Jan, 5 Feb). No reply |
| INV-0137 | Saltgrass Council | $6,750 | 15 Feb | No | Client for 6 years. Last year's note: "Council AP rejects invoices without a PO number." PO 77-3310 is in the project email, but it isn't on the invoice |
| INV-0139 | Tern Studios | $2,300 | 28 Feb | Yes | — |

**Bank deposits since 1 March**

| Date | Reference | Amount |
|---|---|---|
| 3 Mar | TERN ST PMT 0193 | $2,300 |
| 6 Mar | CARD PAYOUT | $1,140 (retail stock-footage sales) |

**Deliver** (markdown, at most ~1,200 words):

1. Invoice INV-0152 to Marlow Bikes as a complete document: header details, bill-to, invoice and due dates, line items (quantity, rate, amount), subtotal, total, the deposit already received, payment instructions (placeholders are fine) and terms. Show how each line was calculated.
2. A short email to Jane Doe sending the invoice and handling CO-2.
3. One collection email for each overdue invoice that should actually be chased, each at most 150 words. Adjust the tone to the client and the contract.
4. An updated AR table after today's actions, with the status of each invoice and the next follow-up date.

## A strong answer

- INV-0152 totals **$11,693.60**: the $9,000 balance, CO-1 at $1,400, and billable expenses of $1,176 ($640 + $186 + $350) plus 10% handling ($1,293.60). Meals ($212) are excluded. It is due 25 March (net 15) and shows the $9,000 deposit as already received.
- Doesn't bill CO-2, because there is no written approval from Jane Doe. The email asks Jane to approve it ($700 for 0.5 day) so it can be billed separately.
- Doesn't chase Tern Studios. Matches the 3 Mar $2,300 deposit to INV-0139 (the reference typo "0193" is likely "0139"), marks it paid or confirms it, and flags the reference mismatch.
- The Pellworth email is firm and cites the contractual late fee, about $126 (1.5% × 2 full months on $4,200, 64 days overdue), with a clear deadline and next step. The Saltgrass email is polite, adds no late fee (there's no clause), and re-issues the invoice with PO 77-3310.
- The invoice is complete and professional: unique number, dates, terms, payment details, and figures that add up.
