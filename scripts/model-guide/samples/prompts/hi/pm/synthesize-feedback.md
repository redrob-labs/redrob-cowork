---
profession: pm
task: synthesize-feedback
language: hi
deliverable: spreadsheets
---

## Prompt

आप Kharchapani में PM हैं। यह मध्यम आकार की भारतीय कंपनियों के लिए expense-management SaaS है। Q3 planning से पहले आपके VP को पिछले महीने के customer feedback का synthesis चाहिए: themes क्या हैं, हर theme के पीछे कितना revenue है, और किन तीन पर काम करना है। NPS survey, support tickets और sales call notes में जो कुछ log हुआ, वह सब नीचे है (ARR ₹ lakh में)।

| # | Source | Account | Plan | ARR | NPS | Verbatim |
|---|---|---|---|---|---|---|
| 1 | Survey | Deodar Logistics | Enterprise | ₹96 lakh | 4 | "Receipt scanning अंग्रेज़ी के अलावा कुछ भी ठीक से नहीं पढ़ता। हमारी चेन्नई team तमिल bills सब हाथ से type करती है।" |
| 2 | Support | Genda Studio | Starter | ₹3 lakh | — | "क्या हमारे accounting software में export करने का कोई तरीका है? मैं हर महीने CSV हाथ से बनाती हूँ।" |
| 3 | Survey | Sanjeevani Health | Business | ₹28 lakh | 6 | "Approval chains बहुत rigid हैं। ₹50,000 से ऊपर के हर खर्च के लिए हमें दूसरा approver चाहिए।" |
| 4 | Sales call | Deodar Logistics | Enterprise | ₹69 lakh | — | "Q2 तक multi-language OCR नहीं आया तो renewal ख़तरे में है। तमिल और मराठी receipts।" |
| 5 | Survey | Kesar & Co. | Business | ₹22 lakh | 7 | "Mobile app मुझे रोज़ log out कर देता है।" |
| 6 | Support | Neelgiri Robotics | Business | ₹31 lakh | — | "Mobile हमारे field technicians को बार-बार log out करता है और उनके draft expenses गायब हो जाते हैं।" |
| 7 | Survey | Muskaan Dental | Starter | ₹2.4 lakh | 9 | "बहुत बढ़िया है। Dark mode हो तो अच्छा रहेगा।" |
| 8 | Survey | Sanjeevani Health | Business | ₹28 lakh | 5 | "Approval rules में amount thresholds चाहिए।" |
| 9 | Support | Lavanya Media | Starter | ₹3.6 lakh | — | "Accounting software connect करने का option कहाँ है, मिल ही नहीं रहा।" |
| 10 | Survey | Garud Freight | Enterprise | ₹74 lakh | 3 | "बांग्ला और गुजराती receipts बिगड़ी हुई निकलती हैं। Finance उन्हें दोबारा type करता है।" |
| 11 | Sales call | Chinar Labs | Business | ₹18 lakh | — | "Competitor के बजाय हमें चुना, लेकिन department के हिसाब से conditional approvals चाहिए।" |
| 12 | Survey | Neelgiri Robotics | Business | ₹31 lakh | 4 | "Mobile app लगातार log out होता है।" |
| 13 | Survey | Utsav Events | Starter | ₹1.8 lakh | 8 | "Accounting में export हो जाए तो मेरे घंटों बचेंगे।" |
| 14 | Survey | Dhaniya Grocers | Business | ₹26 lakh | 2 | "हर महीने card reconciliation एक हफ़्ता पीछे रहता है। Bank feed transactions छोड़ देता है।" |
| 15 | Support | Dhaniya Grocers | Business | ₹26 lakh | — | "Bank feed में फिर से transactions गायब हैं, 3 से 9 तारीख़ तक के।" |
| 16 | Survey | Vastukala Architecture | Business | ₹15 lakh | 7 | "Mobile पर session timeout सच में परेशान करता है।" |

**Product notes**

- Accounting export (LedgerSync, Tally और दूसरे accounting software के लिए) मार्च में ship हो चुका है। यह Settings › Integrations में है और हर plan पर उपलब्ध है।
- Engineering के मोटे अनुमान: multi-language OCR, 1 quarter। Mobile session fix, शायद token-refresh bug, 2 सप्ताह। Approval thresholds, 6 सप्ताह। Bank feed reliability, अज्ञात (Account Aggregator partner पर निर्भर)।

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. Coding table: हर row number, उसकी theme, वह feature gap, bug, reliability problem या discoverability problem है, और क्या वह किसी दूसरी row का duplicate है।
2. Theme summary table, इन columns के साथ: mentions, unique accounts, unique accounts का ARR, सबसे कम NPS, और प्रभावित plans। हर computed column के पीछे का method बताइए (जैसे accounts को deduplicate कैसे किया और किस ARR figure पर भरोसा किया)।
3. Priority क्रम में आपकी शीर्ष तीन recommendations, हर एक का reasoning और evidence के साथ। बताइए कि revenue concentration, breadth और effort को आपने एक-दूसरे के मुकाबले कैसे तौला।
4. Data के बारे में caveats जो VP को कदम उठाने से पहले पता होने चाहिए।

## A strong answer

- Deduplicates by account: mobile logout is 3 unique accounts / ₹68 lakh (Neelgiri Robotics counted once), OCR 2 accounts, approvals 2 accounts / ₹46 lakh, and the bank feed 1 account / ₹26 lakh. The method is stated.
- Flags that Deodar Logistics' ARR conflicts between the rows (₹96 lakh vs ₹69 lakh, likely a transposition), says which figure it uses (for example, OCR at ₹170 lakh on ₹96 lakh), and recommends checking the CRM.
- Classifies the accounting-export requests (rows 2, 9 and 13) as discoverability or onboarding problems, because LedgerSync already shipped, not as a build request.
- The recommendations weigh the OCR renewal risk (two Enterprise accounts) against the cheap, broad mobile bug fix, and treat the bank feed as a data-integrity risk even with a single account. Each call is justified.
- The caveats cover the small, mixed-source sample: 16 rows, about 12 accounts, NPS from only 10 survey responses, and sales notes that aren't comparable with survey data.
