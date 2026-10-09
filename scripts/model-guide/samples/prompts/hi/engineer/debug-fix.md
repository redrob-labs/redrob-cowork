---
profession: engineer
task: debug-fix
language: hi
deliverable: none
---

## Prompt

आप हरियाली मार्ट की डेटा टीम में on-call हैं। यह भारत (IST) में ग्रॉसरी स्टोर्स की एक काल्पनिक चेन है। Ops डैशबोर्ड का "दैनिक शुद्ध राजस्व" finance के export से मेल नहीं खा रहा, और nightly job एक बार crash भी हुआ। Root causes ढूँढिए और उन्हें ठीक कीजिए।

**मैरी मेजर (finance) का टिकट:** "रविवार 9 मार्च 2025 के लिए आपका डैशबोर्ड टेस्ट स्टोर का ₹3,700.00 दिखा रहा है; हमारे हिसाब से ₹2,000.00 है। आम दिनों में भी कभी-कभी आंकड़ा थोड़ा ज़्यादा आता है। साथ ही 10 मार्च की सुबह job फ़ेल हुआ। Finance की परिभाषा: स्टोर की स्थानीय कैलेंडर तारीख का शुद्ध राजस्व = उस दिन बने orders के (amount − refunded_amount) का योग, cancelled orders को छोड़कर।"

**Module (एक long-lived worker process में चलता है, Python 3.10):**

```python
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

UTC = ZoneInfo("UTC")
STORE_UTC_OFFSET = timedelta(hours=5)  # IST ऑफ़सेट


def day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime(d.year, d.month, d.day, tzinfo=UTC) - STORE_UTC_OFFSET
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

डैशबोर्ड आज और कल के लिए हर 15 मिनट पर `daily_revenue(fetch_orders(store_id), d)` कॉल करता है।

**संबंधित तारीख के आसपास टेस्ट स्टोर के orders (समय UTC में):**

```json
[
  {"id": "A1", "created_at": "2025-03-08T18:00:00+00:00", "amount": 800.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A2", "created_at": "2025-03-08T19:00:00+00:00", "amount": 500.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A3", "created_at": "2025-03-09T12:45:00+00:00", "amount": 1200.0, "refunded_amount": 300.0, "status": "partially_refunded"},
  {"id": "A6", "created_at": "2025-03-09T14:30:00+00:00", "amount": 400.0, "refunded_amount": 0, "status": "cancelled"},
  {"id": "A4", "created_at": "2025-03-09T18:29:59Z", "amount": 600.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A5", "created_at": "2025-03-09T18:45:00+00:00", "amount": 1000.0, "refunded_amount": 0, "status": "paid"}
]
```

**फ़ेल हुए run का log:**

```text
2025-03-10T05:30:02Z worker-3 ERROR daily_revenue store=T01 d=2025-03-09
Traceback (most recent call last):
  File "revenue.py", line 21, in daily_revenue
    ts = datetime.fromisoformat(o["created_at"])
ValueError: Invalid isoformat string: '2025-03-09T18:29:59Z'
```

ध्यान दें कि ₹3,700.00 वाला आंकड़ा Python 3.12 पर चले एक staging run से आया था।

**डिलीवर करें** (गद्य लगभग 1,200 शब्दों के भीतर; कोड इससे लंबा हो सकता है):

1. Root-cause analysis: हर defect, वह किस लक्षण को समझाता है, और वह केवल कुछ दिनों पर ही क्यों दिखता है।
2. ठीक किया गया module। Function signatures वही रखें, जब तक बदलाव का कारण न बताएँ, और Python 3.10 compatibility बनाए रखें।
3. ऊपर के orders का उपयोग करने वाले pytest regression tests, साथ में कम से कम: IST की ठीक मध्यरात्रि (18:30Z) पर बना एक order, 00:00 से 00:30 IST के बीच बना एक order, और `+05:30` offset वाला एक timestamp।
4. 9 मार्च का विस्तृत हिसाब: ठीक किए गए कोड में कौन-से orders गिने जाते हैं, और क्यों।
5. एक वाक्य: cache रहना चाहिए या नहीं, और क्यों।

## A strong answer

- Identifies the offset bug: IST is UTC+05:30, not +5, so the hard-coded `timedelta(hours=5)` makes 9 March run from 19:00Z on 8 March to 19:00Z on 9 March (00:30 to 00:30 IST) instead of 18:30Z to 18:30Z, which pulls in A5 (00:15 IST on 10 March). The fix builds local midnight with `ZoneInfo("Asia/Kolkata")`, computes the next local midnight and converts both, and the answer notes this stays correct for any store time zone. It explains that the error shows only on days with orders between 00:00 and 00:30 IST.
- Identifies the inclusive end bound (`<= end`), which double-counts orders exactly on the boundary (A2 at 19:00Z lands in both 8 and 9 March), and switches to a half-open interval [start, end).
- Fixes the business logic to subtract `refunded_amount`, exclude `cancelled`, and deal with fully refunded orders consistently, and reconciles the staging figure: ₹3,700.00 = 500 + 1,200 + 400 + 600 + 1,000.
- Explains the 3.10 crash (`fromisoformat` accepts "Z" only from 3.11) and parses robustly. Also explains that the mutable-default `_cache`, keyed only by date in a long-lived process, serves stale totals for today, and removes it or keys it properly with invalidation.
- The fixed code gives ₹2,000.00 for 9 March (A2 500 + A3 900 + A4 600), and the tests cover the IST midnight boundary, the 00:00–00:30 IST window and the `+05:30` offset.
