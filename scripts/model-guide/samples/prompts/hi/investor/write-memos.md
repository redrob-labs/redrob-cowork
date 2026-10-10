---
profession: investor
task: write-memos
language: hi
deliverable: documents
---

## Prompt

आप Stonebridge Growth Partners में vice president हैं। Molarity Health Pvt. Ltd. में प्रस्तावित ₹150 crore के Series B निवेश के लिए investment committee memo लिखिए। Company भारत के dental clinics और dental chains को cloud practice-management software बेचती है। Deal lead रिचर्ड माइल्स ने नीचे की सामग्री और एक पंक्ति का अनुरोध भेजा है: "Invest करने की सिफ़ारिश करें; हमारा हिस्सा 25% होगा।"

**Financial summary (₹ crore; management figures)**

| | FY2022-23 | FY2023-24 | LTM सितंबर 2025 |
|---|---|---|---|
| ARR (अवधि-अंत) | 70 | 112 | 140 |
| Revenue | 60 | 105 | 132 |
| Cost of revenue (reported) | 14 | 20 | 25 |
| Gross margin (reported) | 76.7% | 81.0% | 81.1% |
| Net burn | 61 | 90 | 96 |

Footnote 4: "FY2023-24 से AWS hosting costs (FY2023-24 में ₹9 crore; LTM में ₹11 crore) R&D में classify किए गए हैं क्योंकि वे product development environments को support करते हैं।" Diligence call पर engineering ने पुष्टि की कि उस AWS खर्च का लगभग 85% production hosting है।

**Cohort net revenue retention (पिछले 12 महीने)**

| Customer cohort | 2022 | 2023 | 2024 |
|---|---|---|---|
| NRR | 124% | 112% | 103% |

वार्षिक logo churn 9% है। सबसे बड़ा customer, BrightSmile Dental (140 clinics वाली dental chain), ARR का 18% है।

**Reference calls (सारांश)**

- एक independent clinic owner: "Appointment scheduling, WhatsApp reminders और GST billing से मेरे front desk के रोज़ दो घंटे बचते हैं।"
- एक regional group (12 clinics): "Company बढ़ने के बाद support कमज़ोर हुआ है। हम बने हुए हैं, लेकिन नज़र रख रहे हैं।"
- BrightSmile Dental के COO: "यह अच्छा काम करता है। हमने CTO hire किया है और 2026 में अपना platform बनाने पर विचार कर रहे हैं।"

**Term sheet अंश**

> Investment: ₹1,50,00,00,000 (₹150 crore) के Series B CCPS (compulsorily convertible preference shares), ₹600 crore की pre-money valuation पर। Pre-money valuation में post-money fully diluted capitalization के 10% के बराबर unallocated ESOP pool शामिल है। 1x non-participating liquidation preference। एक board seat।

मौजूदा unallocated ESOP pool, pre-money fully diluted capitalization का 3% है। 30 सितंबर 2025 को cash: ₹80 crore। मौजूदा net burn: लगभग ₹8 crore प्रति माह।

**Deliver:** IC memo markdown में, इन headed sections के साथ:

1. Recommendation (invest / invest with conditions / pass), शुरुआत में एक paragraph में
2. Company और thesis (अधिकतम 3 bullets)
3. Key metrics table, जहाँ आप management से असहमत हैं वहाँ restated, हर formula सहित
4. Valuation और terms: ownership और effective pre-money
5. Key risks और mitigants
6. Signing से पहले बंद किए जाने वाले diligence items
7. हमें क्या मानना होगा

ऐसे partners के लिए लिखिए जो इसे पाँच मिनट में पढ़ेंगे। उत्तर लगभग 1,200 शब्दों के भीतर रखिए।

## A strong answer

- Corrects the ownership: ₹150 crore ÷ ₹750 crore post-money = 20%, not 25%. Explains the option-pool shuffle: the pool must grow from about ₹18 crore (3% of ₹600 crore) to ₹75 crore (10% of ₹750 crore), so the effective pre-money for existing holders is about ₹543 crore.
- Restates FY2023-24 gross margin with production hosting moved back into cost of revenue: (105 − 20 − about 7.65) ÷ 105 ≈ 73.7% (or 72.4% if all ₹9 crore is moved). Restates LTM similarly, at about 74% ((132 − 25 − 9.35) ÷ 132). Flags the reclassification as a quality-of-reporting issue.
- Computes FY2023-24 ARR growth of 60% and a burn multiple of 90 ÷ 42 ≈ 2.14, and runway of about 10 months (₹80 crore ÷ ₹8 crore). Notes the falling cohort NRR (124% → 112% → 103%).
- Treats BrightSmile (18% of ARR, considering an in-house build) as a top risk, with a specific mitigant or condition, for example a multi-year renewal before closing or a valuation adjustment.
- Gives a clear recommendation consistent with the analysis, for example invest with conditions, or pass at these terms. Diligence items tie back to the issues found, such as hosting costs, the BrightSmile contract and support quality.
