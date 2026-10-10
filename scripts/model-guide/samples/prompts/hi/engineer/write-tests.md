---
profession: engineer
task: write-tests
language: hi
deliverable: none
---

## Prompt

आप क्विलस्टैक (Quillstack) में billing library के release v2.4.0 को validate करने के ज़िम्मेदार engineer हैं। यह एक काल्पनिक SaaS note-taking कंपनी है (Python 3.12, pytest)। Release notes कहते हैं:

> **v2.4.0.** Proration ठीक किया गया, ताकि plan बदलने वाले दिन का बिल नए plan की कीमत पर बने। Rounding अब पैसे तक half-up है। कोई API बदलाव नहीं।

Release manager जॉन डो को आज शाम तक go/no-go चाहिए। इस module के लिए अभी कोई tests नहीं हैं। यह रहा module:

```python
# billing/proration.py
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP


@dataclass(frozen=True)
class Plan:
    code: str
    monthly_price: Decimal  # INR प्रति billing period (GST रहित)


def days_in_period(start: date, end: date) -> int:
    """Billing period [start, end) में दिनों की संख्या।"""
    return (end - start).days


def prorate_change(
    old: Plan,
    new: Plan,
    period_start: date,
    period_end: date,
    change_date: date,
) -> Decimal:
    """Period के बीच plan बदलने पर charge (धनात्मक) या credit (ऋणात्मक)
    की राशि। Period के बचे हुए दिनों का उपयोग करता है, और बदलाव वाले दिन
    को भी बचे हुए दिनों में गिनता है। पैसे तक half-up round किया जाता है।"""
    if not (period_start <= change_date < period_end):
        raise ValueError("change_date outside billing period")
    total_days = days_in_period(period_start, period_end)
    remaining = (period_end - change_date).days - 1
    diff = new.monthly_price - old.monthly_price
    amount = diff * remaining / total_days
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

Production में plans:

| Code | monthly_price (₹) |
|---|---|
| BASIC | 290.00 |
| PRO | 580.00 |
| TEAM | 1190.00 |

इस release के लिए product की अपेक्षाएँ:

- 1 फ़रवरी से 1 मार्च 2024 की period में 15 फ़रवरी 2024 को BASIC से PRO पर switch करने पर ₹150.00 charge हो।
- Period के आख़िरी दिन switch करने पर एक दिन के अंतर का charge हो।
- Period के पहले दिन switch करने पर पूरे अंतर का charge हो।
- Downgrade पर credit मिले, यानी उतनी ही बड़ी ऋणात्मक राशि जितनी संबंधित upgrade की होती।
- उसी plan पर switch करने पर 0.00 लौटे।
- Billing service कभी-कभी JSON से पढ़ी कीमतें भेजती है, जो floats के रूप में आ सकती हैं।

**डिलीवर करें** (गद्य लगभग 1,200 शब्दों के भीतर; test code इससे लंबा हो सकता है):

1. `tests/test_proration.py`: pytest tests, जहाँ मदद मिले वहाँ parametrized, जो ऊपर की अपेक्षाओं, boundaries (period start, आख़िरी दिन, period के बाहर, leap-year फ़रवरी, 30 और 31 दिन वाले महीने), rounding (एक half-paisa case और एक negative half-paisa case सहित) और input types को cover करें। चाहें तो एक Hypothesis property test भी जोड़ें, invariant बताते हुए।
2. मौजूदा कोड पर फ़ेल होने वाले हर test के लिए: अपेक्षित मान, वास्तविक मान, और कारण।
3. v2.4.0 के लिए go/no-go सिफ़ारिश कारणों सहित, आप जो न्यूनतम code fix माँगेंगे, और release notes में जो कुछ भी गलत है।

जहाँ कोई अपेक्षा अस्पष्ट हो, जैसे negative half-paisa कैसे round होना चाहिए, या floats स्वीकार किए जाएँ या अस्वीकार, वहाँ बताएँ कि test में आप कौन-सा निर्णय encode कर रहे हैं और क्यों।

## A strong answer

- Shows that the `- 1` excludes the change day, contradicting both the docstring and the release note. For 15 February 2024 (a 29-day period with 15 days remaining) the expected charge is ₹150.00 (₹290 × 15/29), but the code returns ₹140.00, and a last-day change returns ₹0.00 instead of 290/29 = ₹10.00.
- Recommends no-go: the headline fix in the release notes is not actually in the code. The minimal fix is removing `- 1`.
- Covers boundaries correctly: a change on period_start charges the full difference; a change on period_end or before period_start raises ValueError; leap-year February has 29 days; 30- and 31-day months are tested.
- Handles rounding deliberately, noting that Decimal ROUND_HALF_UP rounds away from zero for negatives (−0.005 becomes −0.01), so downgrade credits mirror upgrades. Picks a policy for float prices and tests for it. Today, mixing a float with a Decimal raises TypeError, and two floats fail at `.quantize`.
- The tests are runnable, well named and parametrized, and any property test states a real invariant, such as antisymmetry between upgrade and downgrade or that the result is bounded by the full difference.
