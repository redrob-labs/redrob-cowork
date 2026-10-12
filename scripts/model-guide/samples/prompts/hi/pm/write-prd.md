---
profession: pm
task: write-prd
language: hi
deliverable: web
---

## Prompt

आप Tokri के PM हैं। Tokri हैदराबाद और पुणे में चलने वाला grocery delivery app है। Personal shoppers partner supermarkets और बड़ी kirana दुकानों में orders pick करते हैं। जब कोई item out of stock होता है, तो अभी shopper अपनी समझ से substitute चुन लेता है, और ग्राहक को दरवाज़े पर पता चलता है। **In-app substitution approvals** का PRD लिखिए: shopper substitute propose करता है, ग्राहक app में उसे approve या reject करता है, और ग्राहक जवाब न दे तो एक default लागू होता है।

**मौजूदा data (पिछले 90 दिन)**

| Metric | मान |
|---|---|
| कम से कम एक out-of-stock item वाले orders | 11.8% |
| ऐसे orders में औसत out-of-stock items | 1.7 |
| दरवाज़े पर reject हुए substitutes | 23% |
| प्रति order shopper का median समय (pick से checkout) | 34 मिनट |

**Pilot: push notification "क्या यह substitute approve करें?" (1,200 requests, एक store)**

| ग्राहक ने इतने समय के भीतर जवाब दिया | Cumulative share |
|---|---|
| 1 मिनट | 38% |
| 3 मिनट | 61% |
| 5 मिनट | 74% |
| कभी नहीं (checkout से पहले) | 26% ने जवाब नहीं दिया |

**Stakeholders की राय**

> "Median ग्राहक एक मिनट से कम में जवाब देता है, इसलिए auto-approve के साथ 60 सेकंड का timeout काफ़ी है। Shoppers इंतज़ार नहीं कर सकते।" (जॉन स्टाइल्स, Ops Lead)

> "अगर substitute महँगा है, तो substitute का MRP/shelf price charge कीजिए। आज हर upgrade पर हमारा margin जाता है।" (रिचर्ड माइल्स, Finance)

**Customer Terms, §7.3 (मौजूदा, published)**

> "यदि हम आपके order में किसी item का substitute देते हैं, तो आप कभी भी order किए गए item की कीमत से अधिक भुगतान नहीं करेंगे।"

**Compliance note**

> हमारे licences के तहत tobacco उत्पाद और pharmacy items (OTC और prescription दवाइयाँ) substitute नहीं किए जा सकते। उनका केवल refund हो सकता है।

**क्या देना है** (markdown में, code छोड़कर लगभग 1,200 शब्दों के भीतर):

1. PRD, इन sections के साथ: problem, goals और success metrics (ऊपर के data से baselines सहित), non-goals, user stories (ग्राहक और shopper), functional requirements, edge cases, और open questions। Response window और जवाब न मिलने पर default चुनिए, और दोनों को pilot data से justify कीजिए। हर stakeholder request को साफ़ तौर पर resolve या escalate कीजिए।
2. ग्राहक की mobile approval screen का single-file HTML/CSS prototype (inline CSS, कोई external asset या library नहीं, JS न्यूनतम या बिल्कुल नहीं)। इसमें original item, proposed substitute, ग्राहक को दिखने वाली कीमत (₹ में), approve/reject actions, "कोई और चुनें" option, बचा हुआ समय, और जवाब न देने पर क्या होगा, यह सब दिखे। Screen की भाषा Hindi या English, आप चुनें।
3. Prototype के लिए design rationale (अधिकतम 150 शब्द)।

## A strong answer

- Rejects the "median under a minute" claim: only 38% respond within 1 minute and the median falls between 1 and 3 minutes, so a 60-second auto-approve would apply the default to most requests. Chooses a window (for example 3–5 minutes, worked into the picking flow) and a default, and justifies both with the cumulative data.
- Flags that charging the substitute's higher MRP/shelf price conflicts with Terms §7.3. Requires that customers never pay more than the ordered item's price, or escalates to Legal for a terms change with notice, and does not quietly ship the Finance request.
- Excludes tobacco and pharmacy items from substitution (refund only) in the requirements and edge cases.
- Success metrics include the 23% door-rejection baseline and a guardrail on shopper time (34-minute median), plus a response-rate metric.
- The prototype is a self-contained HTML file that renders on its own, shows every required element including the timeout default and ₹ prices, and uses accessible patterns (buttons, labels, contrast).

## Card

brief: Grocery app में in-app substitution approvals का PRD और mobile prototype लिखें, response window और default चुनें, stakeholder माँगें निपटाएँ।
given:
- मौजूदा data: out-of-stock, दरवाज़े पर rejection और shopper समय पर पिछले 90 दिन के 4 metrics
- Pilot नतीजे: 1,200 approval requests पर ग्राहक के जवाब देने के समय का cumulative share
- Stakeholders की राय: Ops Lead और Finance की माँगें
- Customer Terms §7.3: substitute की कीमत पर published वादा
- Compliance note: licences के तहत substitute न हो सकने वाले items
asked:
- PRD: problem, baselines सहित goals और metrics, non-goals, user stories, requirements, edge cases, open questions
- ग्राहक की approval screen का single-file HTML/CSS prototype, सभी बताए गए elements के साथ
- Design rationale (अधिकतम 150 शब्द)
limit: Code छोड़कर लगभग 1,200 शब्द markdown में, और एक self-contained HTML file
hard: Stakeholder माँगों को data और published terms पर परखना है, licence की सीमाएँ लागू करनी हैं, और timing default justify करना है।

## Scorecard

- Rejects "median under a minute": only 38% respond within 1 minute; the median is 1–3 minutes
- Picks a window (e.g. 3–5 minutes) and a no-response default, justified by the cumulative pilot data
- Flags the MRP/shelf-price request as breaching Terms §7.3; caps at the ordered price or escalates to Legal
- Excludes tobacco and pharmacy items from substitution (refund only) in requirements and edge cases
- Metrics include the 23% door-rejection baseline, a 34-minute shopper-time guardrail and a response rate
- Prototype is self-contained HTML, shows every required element including the timeout default and ₹ prices, and is accessible

## Scorecard, shown

- "Median एक मिनट से कम" को खारिज करता है: 1 मिनट में सिर्फ़ 38% जवाब देते हैं; median 1–3 मिनट के बीच है
- एक window (जैसे 3–5 मिनट) और जवाब न मिलने पर default चुनता है, cumulative pilot data से justify
- MRP/shelf price की माँग को Terms §7.3 का उल्लंघन बताता है; order की गई कीमत तक सीमा या Legal को escalate
- Tobacco और pharmacy items को requirements और edge cases में substitution से बाहर रखता है (सिर्फ़ refund)
- Metrics में 23% door-rejection baseline, 34 मिनट का shopper-time guardrail और response rate शामिल
- Prototype self-contained HTML है, timeout default और ₹ कीमतों सहित हर ज़रूरी element दिखाता है, और accessible है
