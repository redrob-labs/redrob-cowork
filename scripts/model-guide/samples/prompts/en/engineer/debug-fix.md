---
profession: engineer
task: debug-fix
language: en
deliverable: none
---

## Prompt

You are on call for the data team at Prairie Pantry, a fictional chain of grocery stores in the US Central time zone. The ops dashboard's "daily net revenue" stopped matching finance's export, and the nightly job crashed once. Find the root causes and fix them.

**Ticket from Mary Major (finance):** "On Sunday 9 March 2025 your dashboard says $185.00 for the test store; we say $100.00. On ordinary days it is sometimes slightly high too. Also the job failed on the morning of 10 March. Finance's definition: net revenue for a store-local calendar day = sum of (amount − refunded_amount) for orders created that day, excluding cancelled orders."

**The module (runs inside a long-lived worker process, Python 3.10):**

```python
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

STORE_TZ = ZoneInfo("America/Chicago")
UTC = ZoneInfo("UTC")


def day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime(d.year, d.month, d.day, tzinfo=STORE_TZ).astimezone(UTC)
    end = start + timedelta(hours=24)
    return start, end


def daily_revenue(orders: list[dict], d: date, _cache={}) -> Decimal:
    if d in _cache:
        return _cache[d]
    start, end = day_bounds(d)
    total = Decimal("0")
    for o in orders:
        ts = datetime.fromisoformat(o["created_at"])
        if start <= ts <= end and o["status"] != "refunded":
            total += Decimal(str(o["amount"]))
    _cache[d] = total
    return total
```

The dashboard calls `daily_revenue(fetch_orders(store_id), d)` every 15 minutes for today and yesterday.

**Test-store orders around the date in question:**

```json
[
  {"id": "A1", "created_at": "2025-03-09T05:30:00+00:00", "amount": 40.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A2", "created_at": "2025-03-09T06:00:00+00:00", "amount": 25.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A3", "created_at": "2025-03-09T18:15:00+00:00", "amount": 60.0, "refunded_amount": 15.0, "status": "partially_refunded"},
  {"id": "A6", "created_at": "2025-03-09T20:00:00+00:00", "amount": 20.0, "refunded_amount": 0, "status": "cancelled"},
  {"id": "A4", "created_at": "2025-03-10T04:59:59Z", "amount": 30.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A5", "created_at": "2025-03-10T05:20:00+00:00", "amount": 50.0, "refunded_amount": 0, "status": "paid"}
]
```

**Log from the failed run:**

```text
2025-03-10T11:00:02Z worker-3 ERROR daily_revenue store=T01 d=2025-03-09
Traceback (most recent call last):
  File "revenue.py", line 21, in daily_revenue
    ts = datetime.fromisoformat(o["created_at"])
ValueError: Invalid isoformat string: '2025-03-10T04:59:59Z'
```

Note that the $185.00 figure came from a staging run on Python 3.12.

**Deliver** (at most ~1,200 words of prose; code may run longer):

1. A root-cause analysis: each defect, which symptom it explains, and why it shows up only on some days.
2. The fixed module. Keep the function signatures unless you justify a change, and keep Python 3.10 compatibility.
3. Pytest regression tests that use the orders above, plus at least the DST-end day (2 November 2025) and an order at exactly local midnight.
4. A worked breakdown of 9 March: which orders count, and why, under the fixed code.
5. One sentence on whether the cache should stay, and why.

## A strong answer

- Identifies the DST bug: adding 24 hours in UTC makes 9 March run to 06:00Z on 10 March instead of 05:00Z (the local day has 23 hours), which pulls in A5. The fix computes the next local midnight and then converts it, and the answer notes that 2 November has 25 hours.
- Identifies the inclusive end bound (`<= end`), which double-counts orders at exactly local midnight (A2 lands in both 8 and 9 March), and switches to a half-open interval [start, end).
- Fixes the business logic to subtract `refunded_amount`, exclude `cancelled`, and deal with fully refunded orders consistently, and reconciles the staging figure: $185.00 = 25 + 60 + 20 + 30 + 50.
- Explains the 3.10 crash (`fromisoformat` accepts "Z" only from 3.11) and parses robustly. Also explains that the mutable-default `_cache`, keyed only by date in a long-lived process, serves stale totals for today, and removes it or keys it properly with invalidation.
- The fixed code gives $100.00 for 9 March (A2 25 + A3 45 + A4 30), and the tests cover DST start and end and the midnight boundary.
