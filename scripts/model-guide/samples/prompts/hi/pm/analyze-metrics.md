---
profession: pm
task: analyze-metrics
language: hi
deliverable: spreadsheets
---

## Prompt

आप Kaamdhara में product analyst हैं। Kaamdhara पुणे की एक project-management SaaS है, जिसमें 14 दिन का free trial मिलता है और जिसके ज़्यादातर users भारत के SMB हैं। Growth team ने नए trial sign-ups को दिखाई जाने वाली एक नई onboarding checklist का A/B test चलाया। Assignment sign-up के समय **50/50** होना था। Test 14 दिन के लिए planned था, लेकिन **9वें दिन** रोक दिया गया। Growth PM जॉन स्टाइल्स इसे ship करना चाहते हैं:

> "Activation 23.0% से बढ़कर 26.0% हो गया है। यह 13% का relative lift है। सोमवार को इसे 100% users पर roll out कर देते हैं।"

**Activation** = sign-up के 48 घंटे के भीतर 3 या अधिक tasks बनाना। **Paid** = sign-up के 48 घंटे के भीतर paid plan पर upgrade करना (UPI AutoPay या card से)। नीचे की tables में वे users हैं जिन्होंने दिन 1–7 में sign up किया, इसलिए हर user की 48 घंटे की window पूरी है।

**कुल नतीजे**

| Variant | Assigned users | Activated | Paid |
|---|---|---|---|
| Control | 10,000 | 2,300 | 410 |
| Checklist | 9,200 | 2,392 | 386 |

**Platform के अनुसार**

| Variant | Platform | Users | Activated | Paid |
|---|---|---|---|---|
| Control | Web | 6,000 | 1,500 | 270 |
| Control | Android | 2,500 | 500 | 90 |
| Control | iOS | 1,500 | 300 | 50 |
| Checklist | Web | 6,000 | 1,620 | 276 |
| Checklist | Android | 1,700 | 442 | 62 |
| Checklist | iOS | 1,500 | 330 | 48 |

**Engineering note (दिन 7 पर post किया गया)**

> "Android build 5.2.0 कुछ पुराने, कम RAM वाले devices पर checklist render करते समय crash हो रहा था। Crash assignment event log होने से पहले होता था। 5.2.1 में fix किया, दिन 6 को roll out हुआ।" (जेन डो)

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. Data-quality check: जाँचिए कि split कुल मिलाकर और हर platform पर intended 50/50 से मेल खाता है या नहीं। इस्तेमाल किया गया test और उसका नतीजा दिखाइए।
2. Platform के अनुसार और कुल नतीजों की table। Activation और paid दोनों के लिए rate, absolute और relative difference, और significance test (जैसे two-proportion z-test) दीजिए। हर computed column के पीछे का formula बताइए।
3. Interpretation: किन numbers पर आप भरोसा करते हैं, किन पर नहीं, और क्यों।
4. जॉन स्टाइल्स के लिए recommendation (अधिकतम 200 शब्द): ship करें, न करें, या कोई ठोस विकल्प। यह भी बताइए कि आपकी recommendation बदलने के लिए आपको क्या देखना होगा।

## A strong answer

- Detects a sample ratio mismatch: 10,000 vs 9,200 against an expected 9,600 each gives χ² ≈ 33 (p < 0.001). It is traced to Android (2,500 vs 1,700) and linked to the crash before assignment logging. Web and iOS are balanced.
- Refuses to report the pooled +13% relative lift, or the Android lift (20% → 26%), as valid, because the surviving Android users (newer, higher-RAM devices) are a biased sample.
- Analyses the platforms with valid splits separately. Web activation rises from 25.0% to 27.0% (z ≈ 2.5, p ≈ 0.01). iOS goes from 20.0% to 22.0% (z ≈ 1.3, not significant).
- Notes that paid conversion is essentially flat (4.10% vs about 4.20% overall; web 4.5% vs 4.6%), that the test was stopped early at day 9 of 14, and that 48-hour activation is only a proxy for retention and revenue.
- Recommends a specific path, such as not shipping on the pooled result, fixing logging, and rerunning or extending to the full 14 days (optionally starting web-first), with a stated decision criterion. Formulas are shown.
