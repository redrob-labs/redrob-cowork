---
profession: hr
task: run-performance-reviews
language: hi
deliverable: spreadsheets
---

## Prompt

आप Copperleaf Health Software Pvt. Ltd. (हैदराबाद) के Product Engineering group के HR business partner हैं। कल calibration है। नीचे दिए managers के submissions से calibration workbook तैयार कीजिए। Submissions के साथ आए HRBP summary में लिखा है: "प्रस्ताव payroll का 8.8% हैं, 9% budget के भीतर। कोई समस्या नहीं।"

**Rating guide (company policy)**

| Rating | Anchor (goal attainment) | Merit increment range |
|---|---|---|
| 5 | ≥110% और peer average ≥4.3 | 12–15% |
| 4 | 100–109% | 9–11% |
| 3 | 85–99% | 6–8% |
| 2 | 70–84% | 0–3% |
| 1 | <70% | 0% |

Managers लिखित justification के साथ anchor से एक level ऊपर-नीचे जा सकते हैं। जो कर्मचारी 3 महीने से अधिक protected leave पर रहे (जैसे Maternity Benefit Act, 1961 के तहत maternity leave), उनका rating केवल वास्तव में काम की गई अवधि पर, pro-rated goals के विरुद्ध होगा। Merit budget group के कुल annual fixed payroll का 9% है।

**Manager submissions** (fixed salary ₹ लाख प्रति वर्ष में)

| ID | Team | Manager | Fixed salary (₹ लाख) | Mgr rating | Goal attainment | Peer avg (1–5) | Proposed merit | Manager note |
|---|---|---|---|---|---|---|---|---|
| E01 | Platform | रिचर्ड रो | 24.0 | 5 | 118% | 4.6 | 15% | — |
| E02 | Platform | रिचर्ड रो | 21.0 | 5 | 96% | 4.1 | 15% | — |
| E03 | Platform | रिचर्ड रो | 19.6 | 5 | 62% | 3.2 | 14% | "Attitude बहुत अच्छा है" |
| E04 | Platform | रिचर्ड रो | 22.4 | 4 | 101% | 4.3 | 11% | — |
| E05 | Data | मैरी मेजर | 26.0 | 4 | 109% | 4.4 | 10% | — |
| E06 | Data | मैरी मेजर | 19.0 | 3 | 92% | 3.8 | 7% | — |
| E07 | Data | मैरी मेजर | 17.6 | 2 | n/a | 4.0 | 2% | "फ़रवरी–अगस्त maternity leave पर; ज़्यादातर goals miss किए।" Pro-rated आधार पर goals: 103% |
| E08 | Data | मैरी मेजर | 20.2 | 3 | 85% | 3.5 | 7% | — |
| E09 | Growth | जॉन स्टाइल्स | 18.4 | 3 | 104% | 4.2 | 7% | — |
| E10 | Growth | जॉन स्टाइल्स | 19.8 | 4 | 97% | 3.9 | 10% | "Billing migration lead किया, जो original goals में नहीं था" |
| E11 | Growth | जॉन स्टाइल्स | 17.2 | 2 | 71% | 2.9 | 3% | — |
| E12 | Growth | जॉन स्टाइल्स | 22.0 | 3 | 88% | 3.6 | 8% | — |

**Markdown tables के रूप में दीजिए:**

1. **Calibration table**: हर कर्मचारी की एक row, जिसमें submitted rating, guide के अनुसार anchor rating, gap, flag (OK / Needs justification / Policy issue), आपकी recommended rating और merit %, merit ₹, और एक पंक्ति का तर्क।
2. **Budget table**: कुल payroll, budget ₹ में, submitted कुल merit ₹ में और payroll के % के रूप में, और आपका recommended कुल ₹ और %।
3. **Manager-pattern table**: हर manager की औसत submitted rating और औसत anchor rating।
4. **Discussion guide**: calibration facilitator के लिए अधिकतम 8 bullets, जिनमें चर्चा के cases और हर manager से पूछा जाने वाला सवाल हो।

हर computed column के पीछे का formula बताइए (जैसे merit ₹ = fixed salary × merit %)। आपका recommended plan budget और merit ranges दोनों के भीतर होना चाहिए। जहाँ आप किसी manager की rating बदलते हैं, बताइए कि यह firm policy issue है या चर्चा के लिए सिफ़ारिश। उत्तर लगभग 1,200 शब्दों के भीतर रखिए।

## A strong answer

- Computes payroll correctly as ₹247.2 lakh (₹2,47,20,000), the budget as ₹22,24,800 and the submitted total as ₹23,19,800 (9.38%). Calls out the HRBP summary's "8.8%, within budget" as wrong: the submissions are ₹95,000 over.
- Flags E07 as a firm policy issue. She must be rated on pro-rated goals (103%, which anchors at 4), not marked down for maternity leave (which would also cut against the Maternity Benefit Act's protection), and her merit should be raised into the 9–11% range.
- Flags E03 (5 at 62% goal attainment, an anchor of 1, with no valid justification) and E02 (5 at 96%, an anchor of 3, two levels above with no note). Identifies Richard Roe's leniency pattern in the manager table (average submitted 4.75 vs anchor 3.25; Major 3.0 vs 3.5; Stiles 3.0 vs 3.0).
- Handles the one-level deviations with judgement: E10's 4 has a justification and can stand for discussion, and E09 looks under-rated at 3 against a 104% anchor of 4.
- The recommended plan totals no more than ₹22,24,800, keeps every merit % inside its rating's range, and every merit ₹ equals fixed salary × %.
