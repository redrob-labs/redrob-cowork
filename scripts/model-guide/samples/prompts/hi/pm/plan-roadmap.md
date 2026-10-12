---
profession: pm
task: plan-roadmap
language: hi
deliverable: spreadsheets
---

## Prompt

आप Sahyog Dispatch के senior PM हैं। यह बेंगलुरु की एक B2B field-service scheduling SaaS है (AC servicing, appliance repair और utility maintenance कंपनियाँ इसकी ग्राहक हैं), जिसके 640 active customer accounts हैं। आपको एक product squad के लिए H2 2026 (कैलेंडर वर्ष; Q3: जुलाई–सितंबर, Q4: अक्टूबर–दिसंबर) का roadmap बनाना है। On-call और maintenance के बाद squad के पास **हर quarter 24 engineer-weeks की capacity है, H2 के लिए 48**। कोई काम दो quarters में तभी बाँटा जा सकता है जब आप साफ़ कहें और कारण बताएँ।

Team backlog को RICE से score करती है: Reach = प्रति quarter प्रभावित accounts, Impact 0.25–3 के scale पर, Confidence प्रतिशत में, Effort engineer-weeks में।

**Backlog export (planning sheet से)**

| ID | Item | Reach | Impact | Confidence | Effort | Notes |
|---|---|---|---|---|---|---|
| F1 | Technician mobile app के लिए offline mode | 420 | 2 | 80% | 16 | Churn interviews में सबसे बड़ी माँग (tier-2/3 शहरों में कमज़ोर network) |
| F2 | Route optimisation v2 | 300 | 3 | 50% | 20 | नए map provider (F5) पर निर्भर |
| F3 | SAML single sign-on | 35 | 1 | 100% | 6 | Brightwell Utilities (₹1.5 crore ARR) के contract में तय: 31 अक्टूबर 2026 तक live |
| F4 | Customer self-booking portal (WhatsApp Business link सहित) | 510 | 1 | 70% | 12 | |
| F5 | Map provider migration | — | — | — | 8 | मौजूदा map contract 31 दिसंबर 2026 को खत्म; renewal पर +40% |
| F6 | Invoice PDF redesign (GST invoice format) | 600 | 0.5 | 90% | 3 | |
| F7 | Technician skills matching | 250 | 2 | 60% | 45 | Squad lead का estimate, engineer-days में भेजा गया |

**Stakeholders की राय**

> "Route optimisation v2 को H2 की headline होना ही चाहिए। हर enterprise prospect को मैं यही pitch कर रहा हूँ।" (रिचर्ड रो, VP Sales)

> "कृपया SSO को फिर से खिसकने मत दीजिए। अगर 31 अक्टूबर चूका, तो Brightwell के contract में exit clause है।" (मैरी मेजर, Head of Customer Success)

> "हम 5 दिन का engineer-week मानते हैं। F5 plumbing है: किसी ग्राहक को फ़र्क नहीं दिखेगा, लेकिन साल के अंत तक नहीं हुआ तो या तो बढ़ी हुई कीमत देनी होगी या maps बंद हो जाएँगे।" (जेन डो, Engineering Manager)

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. Scored backlog table: हर RICE input का अलग column, एक normalised effort column और RICE score। हर computed column का formula बताइए। जिस item को RICE score नहीं मिल सकता, उसे अलग category में रखिए और बताइए कि आपने उसे कैसे handle किया।
2. Quarter के अनुसार H2 plan table: कौन-से items शामिल हैं, उनका effort, और हर quarter तथा पूरे H2 के लिए capacity check (used बनाम available)।
3. Cut list: जो H2 में नहीं आ पाए, हर एक का एक-पंक्ति कारण।
4. रिचर्ड रो और मैरी मेजर के लिए एक छोटा memo (अधिकतम 250 शब्द) जो plan समझाए। Capacity के आख़िरी slot के लिए आपस में टकराने वाले items के बीच आपने जो मुख्य trade-off किया, उसका नाम लीजिए, और बताइए कि क्या चीज़ आपका फ़ैसला बदल सकती है।

## A strong answer

- Converts F7 from 45 engineer-days to 9 engineer-weeks, giving a RICE of about 33.3 (not about 6.7), and states RICE = Reach × Impact × Confidence ÷ Effort. The other scores are F6 90.0, F1 42.0, F4 29.75, F2 22.5 and F3 about 5.8.
- Schedules F3 SSO in Q3 (or with clear margin before 31 October) and F5 before 31 December regardless of their RICE scores, because they are a contractual deadline (₹1.5 crore ARR at risk) and a cost deadline.
- Doesn't schedule F2 before F5. Recognises that F2 (20 weeks) can't fit alongside F3 + F5 + F1 within 48, and tells the VP Sales so plainly, with the conditions under which F2 could lead instead.
- Every quarter stays at or under 24 engineer-weeks, and H2 at or under 48, with the totals shown. A typical valid plan is F3 + F5 + F6 + F1 plus either F4 (45 weeks) or F7 (42 weeks).
- Makes and justifies the F4 versus F7 call explicitly, for example total R×I×C (357 vs 300) against effort and confidence, rather than ranking mechanically.

## Card

brief: RICE backlog से एक SaaS squad का H2 2026 roadmap हर quarter 24 engineer-weeks में बनाएँ और stakeholders को trade-offs समझाएँ।
given:
- Capacity: हर quarter 24 engineer-weeks, H2 के लिए 48, बिना कारण बताए दो quarters में बाँटना नहीं
- RICE की परिभाषा: reach, impact, confidence और effort के scale
- Backlog export: RICE inputs और notes के साथ 7 items
- Stakeholders की राय: VP Sales, Head of Customer Success और Engineering Manager के कथन
asked:
- Normalised effort, RICE score और formulas के साथ scored backlog table; जिसे score न मिले वह अलग
- Quarter के अनुसार H2 plan, हर quarter और पूरे H2 का capacity check
- Cut list, हर item का एक-पंक्ति कारण
- रिचर्ड रो और मैरी मेजर के लिए memo (अधिकतम 250 शब्द), मुख्य trade-off के नाम के साथ
limit: लगभग 1,200 शब्दों के भीतर, markdown में
hard: Backlog में पकड़ने लायक एक असंगति है, deadlines और dependencies score से ऊपर हैं, और आख़िरी capacity slot का फ़ैसला करीबी है।

## Scorecard

- Converts F7's 45 engineer-days to 9 weeks: RICE ≈ 33.3, not 6.7; RICE formula stated
- Other scores correct: F6 90.0, F1 42.0, F4 29.75, F2 22.5, F3 ≈ 5.8
- Schedules F3 SSO in Q3 (before 31 Oct; ₹1.5 crore ARR) and F5 before 31 Dec, despite RICE
- F2 not before F5; VP Sales told F2 can't fit with F3, F5 and F1, and when it could
- Quarters ≤ 24 and H2 ≤ 48 weeks, totals shown; e.g. F3, F5, F6, F1 plus F4 or F7
- Justifies F4 vs F7 explicitly, e.g. R × I × C 357 vs 300 against effort and confidence

## Scorecard, shown

- F7 के 45 engineer-days को 9 weeks में बदलता है: RICE ≈ 33.3, 6.7 नहीं; RICE formula बताया गया
- बाकी score सही: F6 90.0, F1 42.0, F4 29.75, F2 22.5, F3 ≈ 5.8
- RICE से परे F3 SSO को Q3 में (31 अक्टूबर से पहले, ₹1.5 crore ARR) और F5 को 31 दिसंबर से पहले रखता है
- F2 को F5 से पहले नहीं रखता; VP Sales को बताता है कि F2, F3, F5 और F1 के साथ नहीं समाता, और कब समा सकता है
- हर quarter ≤ 24 और H2 ≤ 48 weeks, totals सहित; जैसे F3, F5, F6, F1 और साथ में F4 या F7
- F4 बनाम F7 का फ़ैसला साफ़ justify करता है, जैसे R × I × C 357 बनाम 300, effort और confidence के मुकाबले
