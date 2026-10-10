---
profession: accountant
task: financial-statements
language: en
deliverable: documents
---

## Prompt

Prepare the 31 December 2024 US GAAP financial statements for Lumenwise Inc., a venture-backed SaaS company (private, calendar year, statements to be issued 31 March 2025). Use the adjusted trial balance and facts below.

**Adjusted trial balance, 31 Dec 2024 ($000)**

| Account | Debit | Credit |
|---|---|---|
| Cash | 1,467 | |
| Accounts receivable | 386 | |
| Allowance for credit losses | | 24 |
| Prepaid expenses | 58 | |
| Loan receivable, John Doe (CEO) | 75 | |
| Property and equipment, net | 142 | |
| Operating lease right-of-use asset | 310 | |
| Capitalized internal-use software, net | 220 | |
| Accounts payable | | 118 |
| Accrued liabilities | | 164 |
| Deferred revenue | | 1,020 |
| Operating lease liability | | 336 |
| Convertible notes payable | | 1,500 |
| Accrued interest on convertible notes | | 90 |
| Common stock and APIC | | 4,200 |
| Accumulated deficit, 1 Jan 2024 | 3,180 | |
| Revenue | | 3,460 |
| Cost of revenue | 1,040 | |
| Research and development | 1,620 | |
| Sales and marketing | 1,380 | |
| General and administrative | 910 | |
| Interest expense | 120 | |
| Income tax expense | 4 | |
| **Total** | **10,912** | **10,912** |

**Facts from the controller, Mary Major**

- Deferred revenue includes $280k for service periods after 31 Dec 2025 (multi-year prepaid contracts).
- Lease liability: $96k is due within 12 months. The office lease runs to 30 June 2028.
- Convertible notes: $1,500k issued 1 April 2024, 8% simple interest, no cash interest paid, principal and interest due 30 June 2026 unless converted in a qualified financing. No other debt existed in 2024.
- The CEO loan was advanced in September 2024, is unsecured, bears no interest, and has no repayment date. The board has not formally approved it.
- Operating cash burn has averaged $140k per month and is expected to continue. A Series A term sheet is under discussion but not signed.
- On 12 February 2025, Lumenwise's largest customer (18% of 2024 revenue) gave notice that it will not renew when its contract ends in May 2025.

**Deliver** (markdown, at most ~1,200 words):

1. A classified balance sheet and a statement of operations, in $000, with totals that tie.
2. Notes, kept short: (a) going concern, (b) revenue and deferred revenue, (c) leases, (d) convertible notes, (e) related party, (f) subsequent events.
3. A list of open items you would raise with Mary before the statements are issued, including anything in the trial balance that does not agree with the facts, with a proposed treatment.

State any presentation judgement you make, such as how the CEO loan and the accrued interest are classified, and why.

## A strong answer

- Net loss is $1,614k (3,460 − 5,074). Total assets of $2,634k equal liabilities of $3,228k plus a stockholders' deficit of $594k (4,200 − 3,180 − 1,614). An answer that books the $30k interest correction instead (loss $1,584k, deficit $564k, liabilities $3,198k) is equally right, provided the statements still tie.
- Splits deferred revenue into $740k current and $280k noncurrent and the lease liability into $96k current and $240k noncurrent. The notes and accrued interest are noncurrent, since they are due 30 June 2026, more than 12 months after year end, and the answer says so.
- Notices that note interest should be $90k (1,500 × 8% × 9/12), not the $120k booked, and raises the $30k difference as an open item with a proposed reclassification or correction.
- Concludes there is substantial doubt about going concern: about 10.5 months of runway ($1,467k ÷ $140k) inside the one-year window, the customer loss and no signed term sheet. Discloses management's plans without saying the doubt is alleviated.
- Treats the CEO loan as a related-party disclosure. Questions its classification (noncurrent, or a possible contra-equity presentation) and flags the missing board approval. The customer loss is a nonrecognized subsequent event.

## Card

brief: Prepare year-end US GAAP statements and short notes for a venture-backed SaaS company, and list open items for the controller.
given:
- Company: private, calendar year, statements to be issued 31 March 2025
- Adjusted trial balance: 23 accounts at 31 December 2024, in $000
- Controller's facts: 6 notes on deferred revenue, the lease, convertible notes, a CEO loan, cash burn and a customer
asked:
- A classified balance sheet and a statement of operations, in $000, with totals that tie
- Short notes: going concern, revenue, leases, convertible notes, related party, subsequent events
- Open items for the controller, including trial-balance figures that disagree with the facts
limit: Up to about 1,200 words, in Markdown
hard: Balances must be classified by maturity, recorded figures must be tested against the stated terms, and going concern and an unusual loan need presentation judgements.

## Scorecard

- Statements tie: loss $1,614k, deficit $594k as booked (or $1,584k and $564k if corrected)
- Deferred revenue $740k current, $280k noncurrent; lease $96k/$240k; notes and accrued interest noncurrent
- Flags note interest should be $90k (1,500 × 8% × 9/12), not $120k; proposes treating the $30k
- Concludes substantial doubt: ~10.5 months' runway, customer loss, unsigned term sheet; doubt not alleviated
- Discloses the CEO loan as related party, questions its classification, flags missing board approval
- Treats the customer's non-renewal as a nonrecognized subsequent event
