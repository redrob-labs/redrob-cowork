---
profession: engineer
task: write-tests
language: en
deliverable: none
---

## Prompt

You are the engineer responsible for validating release v2.4.0 of the billing library at Quillstack, a fictional SaaS note-taking company (Python 3.12, pytest). The release notes say:

> **v2.4.0.** Fixes proration so the day of a plan change is billed at the new plan's price. Rounding is now half-up to the cent. No API changes.

Release manager John Doe wants a go/no-go by end of day. There are currently no tests for this module. Here it is:

```python
# billing/proration.py
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP


@dataclass(frozen=True)
class Plan:
    code: str
    monthly_price: Decimal  # USD per billing period


def days_in_period(start: date, end: date) -> int:
    """Number of days in the billing period [start, end)."""
    return (end - start).days


def prorate_change(
    old: Plan,
    new: Plan,
    period_start: date,
    period_end: date,
    change_date: date,
) -> Decimal:
    """Amount to charge (positive) or credit (negative) when switching plans
    mid-period. Uses the days remaining in the period, counting the change
    day itself as remaining. Rounded to the cent, half-up."""
    if not (period_start <= change_date < period_end):
        raise ValueError("change_date outside billing period")
    total_days = days_in_period(period_start, period_end)
    remaining = (period_end - change_date).days - 1
    diff = new.monthly_price - old.monthly_price
    amount = diff * remaining / total_days
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

Plans in production:

| Code | monthly_price |
|---|---|
| BASIC | 20.00 |
| PRO | 49.00 |
| TEAM | 99.00 |

Product's expectations for this release:

- A switch from BASIC to PRO on 15 February 2024, in the period 1 February to 1 March 2024, charges $15.00.
- A switch on the last day of a period charges one day's difference.
- A switch on the first day of the period charges the full difference.
- A downgrade gives a credit, a negative amount of the same size as the matching upgrade.
- A plan switched to the same plan returns 0.00.
- The billing service sometimes passes prices it read from JSON, which may arrive as floats.

**Deliver** (at most ~1,200 words of prose; test code may run longer):

1. `tests/test_proration.py`: pytest tests, parametrized where it helps, covering the expectations above, the boundaries (period start, last day, outside the period, leap-year February, 30- and 31-day months), rounding (including a half-cent case and a negative half-cent case), and input types. Optionally add one Hypothesis property test, with the invariant stated.
2. For each test that fails against the current code: the expected value, the actual value, and the cause.
3. A go/no-go recommendation for v2.4.0 with reasons, the minimal code fix you would ask for, and anything in the release notes that is inaccurate.

Where an expectation is ambiguous, for example how a negative half-cent should round, or whether floats should be accepted or rejected, state the decision you are encoding in the test and why.

## A strong answer

- Shows that the `- 1` excludes the change day, contradicting both the docstring and the release note. For 15 February 2024 (a 29-day period with 15 days remaining) the expected charge is $15.00, but the code returns $14.00, and a last-day change returns $0.00 instead of 29/29 = $1.00.
- Recommends no-go: the headline fix in the release notes is not actually in the code. The minimal fix is removing `- 1`.
- Covers boundaries correctly: a change on period_start charges the full difference; a change on period_end or before period_start raises ValueError; leap-year February has 29 days; 30- and 31-day months are tested.
- Handles rounding deliberately, noting that Decimal ROUND_HALF_UP rounds away from zero for negatives (−0.005 becomes −0.01), so downgrade credits mirror upgrades. Picks a policy for float prices and tests for it. Today, mixing a float with a Decimal raises TypeError, and two floats fail at `.quantize`.
- The tests are runnable, well named and parametrized, and any property test states a real invariant, such as antisymmetry between upgrade and downgrade or that the result is bounded by the full difference.
