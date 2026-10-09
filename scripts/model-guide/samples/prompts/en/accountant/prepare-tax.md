---
profession: accountant
task: prepare-tax
language: en
deliverable: spreadsheets
---

## Prompt

You are preparing the 2024 US federal Schedule C and self-employment tax workpaper for Jane Doe, a UX consultant who operates through a single-member LLC (a disregarded entity) and files as single. She uses the cash method. Her bookkeeper sent the figures below.

**Information returns received**

| Form | Payer | Amount ($) | Note |
|---|---|---|---|
| 1099-NEC | Northwind Analytics Inc. | 62,000 | Paid by ACH |
| 1099-NEC | Bluefin Health LLC | 56,500 | Bluefin's AP says this includes $18,000 Bluefin paid through PayFlow |
| 1099-K | PayFlow Payments | 40,700 | Gross card payments; includes Bluefin's $18,000 and $22,700 from small clients |

**Business bank account, 2024 deposits:** $147,379. The bookkeeper notes this includes a $6,000 transfer from Jane's personal savings and a $1,400 refund for a cancelled annual DesignKit Pro plan. PayFlow deposits are net of its 3% fee on the gross card volume.

**Expenses per the bookkeeper**

| Item | Amount ($) | Note |
|---|---|---|
| Software subscriptions | 4,860 | Includes the full DesignKit Pro annual plan later refunded |
| Laptop, bought June 2024 | 2,400 | Used only for business; one invoice |
| Client meals at restaurants | 3,200 | Receipts and attendees logged |
| Conference travel: airfare and hotel | 2,130 | Two-day client conference |
| Vehicle | — | 4,200 business miles of 11,000 total; no actual-cost records kept |
| Home office | — | 240 sq ft room used only for work |
| Subcontractor: John Stiles, illustrator | 9,000 | No 1099-NEC issued yet |
| Health insurance premiums, Jane only | 7,800 | Not eligible for an employer plan |
| Gym membership | 720 | "Keeps me sharp for client work" |

**Research notes the junior pulled together**

1. Standard mileage rate for 2024 business use: 67 cents per mile.
2. Simplified home-office method: $5 per square foot, maximum 300 square feet.
3. A 2022 blog post: restaurant meals are 100% deductible for businesses.
4. De minimis safe harbor (taxpayer without an applicable financial statement): items up to $2,500 per invoice or item may be expensed if the election is made with the return.
5. Self-employment tax: 15.3% on 92.35% of net earnings, Social Security part capped at a 2024 wage base of $168,600; half of SE tax is an adjustment to income.
6. Self-employed health insurance is an adjustment to income on Schedule 1, limited to net self-employment profit; it is not a Schedule C expense.

**Deliver** (markdown, at most ~1,200 words):

1. A gross-receipts reconciliation table tying the information returns to the bank deposits, with the method for each line.
2. A Schedule C table: each line, amount, and the rule applied. Leave out anything that does not belong, and say where it goes instead.
3. The self-employment tax computation and the deductible half.
4. A short list of open items and risks for Jane, with your recommendation on the laptop treatment and on any compliance steps she still needs to take.

Flag any research note you do not rely on, and say why.

## A strong answer

- Removes the $18,000 double count: gross receipts are $141,200 (62,000 + 56,500 + 22,700), and they tie to deposits as 147,379 − 6,000 − 1,400 + 1,221 PayFlow fees.
- Rejects note 3, since the 100% restaurant-meal rule applied only to 2021–2022, and deducts 50% of meals ($1,600). Nets the $1,400 refund against software ($3,460) and deducts the $1,221 PayFlow fees.
- Uses 4,200 × $0.67 = $2,814 for the vehicle and $1,200 for the home office (240 × $5), keeps the gym out, and moves health insurance to Schedule 1.
- Arrives at net profit of about $117,375 (141,200 − 23,825), SE tax of about $16,584.56 (117,375 × 0.9235 × 0.153) and a deductible half of about $8,292.28. Expensing the laptop under the de minimis election is justified, and Section 179 is mentioned as the alternative.
- Flags that a 1099-NEC to John Stiles was due by 31 January 2025 (get a W-9, file late), and suggests asking Bluefin to correct its 1099-NEC.
