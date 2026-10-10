---
profession: pm
task: write-prd
language: en
deliverable: web
---

## Prompt

You are the PM for Basketful, a grocery delivery app. Personal shoppers pick orders in partner stores. When an item is out of stock, the shopper currently picks a substitute on their own judgement, and customers find out at the door. Write the PRD for **in-app substitution approvals**: the shopper proposes a substitute, the customer approves or rejects it in the app, and if the customer doesn't respond, a default applies.

**Current data (last 90 days)**

| Metric | Value |
|---|---|
| Orders with at least one out-of-stock item | 11.8% |
| Average out-of-stock items in those orders | 1.7 |
| Substitutes rejected at the door | 23% |
| Median shopper time per order (pick to checkout) | 34 min |

**Pilot: push notification "approve this substitute?" (1,200 requests, one store)**

| Customer responded within | Cumulative share |
|---|---|
| 1 minute | 38% |
| 3 minutes | 61% |
| 5 minutes | 74% |
| Never (before checkout) | 26% did not respond |

**Stakeholder input**

> "The median customer responds in under a minute, so a 60-second timeout with auto-approve is plenty. Shoppers can't wait around." (John Stiles, Ops Lead)

> "If the substitute costs more, charge the substitute's shelf price. We lose margin on every upgrade today." (Richard Miles, Finance)

**Customer Terms, §7.3 (current, published)**

> "If we substitute an item in your order, you will never pay more than the price of the item you ordered."

**Compliance note**

> Age-restricted items (alcohol, tobacco) and pharmacy items may not be substituted under our retail licences. They can only be refunded.

**Deliver** (markdown, at most ~1,200 words excluding code):

1. A PRD with these sections: problem, goals and success metrics (with baselines from the data above), non-goals, user stories (customer and shopper), functional requirements, edge cases, and open questions. Choose the response window and the default when there is no response, and justify both from the pilot data. Resolve or escalate each stakeholder request explicitly.
2. A single-file HTML/CSS prototype (inline CSS, no external assets or libraries, minimal or no JS) of the customer's mobile approval screen. It should show the original item, the proposed substitute, the price shown to the customer, approve/reject actions, a "choose another" option, the time remaining, and what happens if they don't respond.
3. A design rationale (at most 150 words) for the prototype.

## A strong answer

- Rejects the "median under a minute" claim: only 38% respond within 1 minute and the median falls between 1 and 3 minutes, so a 60-second auto-approve would apply the default to most requests. Chooses a window (for example 3–5 minutes, worked into the picking flow) and a default, and justifies both with the cumulative data.
- Flags that charging the higher shelf price conflicts with Terms §7.3. Requires that customers never pay more than the ordered item's price, or escalates to Legal for a terms change with notice, and does not quietly ship the Finance request.
- Excludes age-restricted and pharmacy items from substitution (refund only) in the requirements and edge cases.
- Success metrics include the 23% door-rejection baseline and a guardrail on shopper time (34-minute median), plus a response-rate metric.
- The prototype is a self-contained HTML file that renders on its own, shows every required element including the timeout default, and uses accessible patterns (buttons, labels, contrast).
