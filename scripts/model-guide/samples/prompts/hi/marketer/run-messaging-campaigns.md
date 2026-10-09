---
profession: marketer
task: run-messaging-campaigns
language: hi
deliverable: spreadsheets
---

## Prompt

आप Larder & Vine में lifecycle marketing manager हैं, जो भारत के metro शहरों में meal-kit subscription है। उन customers के लिए win-back campaign बनाइए जिन्होंने 60–180 दिन पहले subscription cancel किया, ताकि CRM team उसे load कर सके। Launch मंगलवार, 6 जनवरी 2026 को है।

**CRM export: cancellation reason के अनुसार lapsed subscribers**

| Segment | Cancel reason | Contacts | Email opt-in | SMS opt-in |
|---|---|---|---|---|
| A | बहुत महँगा | 8,400 | 7,980 | 2,100 |
| B | बहुत व्यस्त / यात्रा | 5,200 | 4,940 | 1,560 |
| C | खाने की quality की शिकायत | 1,900 | 1,710 | 380 |
| D | Delivery area से बाहर चले गए | 1,100 | 1,045 | 220 |
| E | कोई कारण नहीं बताया | 3,400 | 3,060 | 680 |
| | **Total** | **20,000** | **18,735** | **4,940** |

**CRM team के notes**

- Email opt-in column global suppression list (hard bounces और global unsubscribes) लागू होने से पहले export हुआ था। 615 opted-in addresses suppressed हैं: A 260, B 150, C 90, D 40, E 75। D के ये 40 सभी पुणे के बाहर के हैं।
- 1 अक्टूबर 2025 से delivery coverage पुणे metro तक बढ़ा। Segment D में 260 contacts के पुणे PIN codes हैं: 248 email opt-ins और 52 SMS opt-ins। D का बाकी हिस्सा अब भी coverage से बाहर है।
- हर SMS opt-in, email opt-in भी है और suppression list पर नहीं है।
- सभी contacts भारत में (IST) हैं, लेकिन CRM tool का scheduler UTC में चलता है (IST = UTC + 5:30)।

**Business rules**

- Manager का अनुरोध: "पहले box पर 50% off और हमेशा के लिए free dessert। बड़ा सोचो।"
- Finance: कुल incentive cost प्रति reactivated customer ₹450 से अधिक नहीं। Average पहला box ₹1,600 का है। Dessert add-on की लागत ₹75 प्रति box है।
- हर customer को एक ही offer; offers stack नहीं होते।
- TRAI के commercial communication नियमों के अनुसार promotional SMS केवल DLT-registered header ("LRDVIN") और DLT-approved template से, और केवल सुबह 10 बजे से रात 9 बजे IST के बीच भेजे जा सकते हैं। हर SMS में brand name और "Reply STOP to opt out" होना चाहिए। SMS English (GSM-7) में हो तो 160 characters या कम; हिंदी (Unicode) में हो तो 70 characters या कम।
- सितंबर से menus में नई recipes हैं, और quality complaints 35% घटी हैं (QA report)।
- पिछली win-back reactivation rates: email-only sequence, eligible contacts का 2.1%; email-plus-SMS sequence, eligible contacts का 3.4%।

**Markdown tables के रूप में दीजिए:**

1. **Audience table**: हर segment के लिए suppression और coverage rules के बाद eligible email contacts और eligible SMS contacts, हर column के formula के साथ।
2. **Sequence plan**: हर touch की एक row: step, send day (6 जनवरी के सापेक्ष), channel, segment(s), send window (IST और CRM scheduler के लिए UTC दोनों), subject line या SMS text (character count के साथ), preview text, offer, CTA, और exit condition।
3. **Offer table**: हर segment का offer, प्रति reactivated customer लागत, और finance ceiling पास होती है या नहीं। Manager के प्रस्ताव को भी एक row के रूप में शामिल कीजिए।
4. **Forecast**: हर segment और कुल अपेक्षित reactivations, और कुल incentive cost, formulas के साथ।
5. **QA checklist**: CRM team के लिए अधिकतम 6 items।

उत्तर लगभग 1,200 शब्दों के भीतर रखिए।

## A strong answer

- Applies the suppression list and coverage rules: eligible email A 7,720, B 4,790, C 1,620, D 248 (Pune only), E 2,985, total 17,363. Eligible SMS is 4,772, with D reduced to 52. Excludes the rest of segment D.
- Rejects the manager's offer with the arithmetic: 50% of ₹1,600 is ₹800 before dessert, well over the ₹450 ceiling. Recommends an offer within the ceiling, for example 25% off the first box (₹400), and doesn't stack the dessert.
- Tailors by segment: price-led for A, convenience and skip-a-week for B, and a quality-led message for C built on the new menus and the 35% fall in complaints. D-Pune gets a "अब हम आपके शहर में deliver करते हैं" message.
- Forecasts with the correct base: 4,772 × 3.4% ≈ 162 plus (17,363 − 4,772) × 2.1% ≈ 264, about 427 reactivations, at an incentive cost of about ₹1,70,800 at ₹400 each.
- SMS texts respect the right limit for their encoding (160 GSM-7 / 70 Unicode, with accurate counts), include the brand name and "Reply STOP to opt out", use the DLT header/template, and are scheduled within 10:00–21:00 IST, correctly converted to 04:30–15:30 UTC for the scheduler. Every sequence has an exit-on-reactivation condition.
