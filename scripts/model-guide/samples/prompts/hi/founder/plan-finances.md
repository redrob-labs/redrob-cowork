---
profession: founder
task: plan-finances
language: hi
deliverable: spreadsheets
---

## Prompt

आप फ़ील्डनोट एनालिटिक्स के founder और CEO हैं। यह एक काल्पनिक स्टार्टअप है जो किसान उत्पादक संगठनों (FPOs) और सहकारी समितियों को मासिक subscription पर मिट्टी की नमी का analytics बेचता है। आपके co-founder जॉन डो ने runway का एक जल्दी वाला अनुमान बनाया है। बोर्ड मीटिंग से पहले आप अप्रैल 2026 से सितंबर 2027 तक का एक सही 18 महीने का cash budget चाहते हैं, और hiring व fundraising के समय पर एक फ़ैसला।

**जॉन का अनुमान**

> पेरोल ₹10,50,000/माह (= ₹1.26 करोड़ ÷ 12), डेटा लाइसेंस ₹1,20,000/माह, अन्य opex ₹3,80,000/माह, राजस्व ₹5,20,000/माह। Burn ≈ ₹10,30,000/माह। नकद ₹2.4 करोड़ → runway लगभग 23 महीने। हम चारों hires कर सकते हैं और सितंबर 2027 के आसपास raise करेंगे।

**तथ्य और मान्यताएँ** (सभी राशियाँ GST रहित)

| मद | मान |
|---|---|
| नकद, 1 अप्रैल 2026 | ₹2,40,00,000 |
| शुरुआती MRR, अप्रैल 2026 | ₹5,20,000 |
| हर महीने जुड़ने वाला नया MRR | सितंबर 2026 तक ₹60,000; अक्टूबर 2026 से ₹90,000 (नए AE के ramp होने के बाद) |
| Churn | हर महीने के शुरुआती MRR का 2% |
| राजस्व और वसूली | हर महीने का राजस्व = शुरुआती MRR, उसी महीने वसूल |
| Gross margin | 78% (hosting और data processing) |
| मौजूदा टीम | 9 लोग, कुल वार्षिक फ़िक्स्ड वेतन ₹1,26,00,000 |
| पेरोल बोझ | सभी नकद वेतन पर 15% (employer PF, ग्रेच्युटी, ग्रुप हेल्थ इंश्योरेंस) |
| नियोजित hires | 2 engineers, ₹16,50,000 प्रति व्यक्ति, 1 जून 2026 से; 1 account executive, ₹16,00,000 OTE (variable target पर, मासिक भुगतान मानें), 1 जुलाई 2026 से; 1 customer success manager, ₹9,00,000, 1 अक्टूबर 2026 से |
| अन्य opex | ₹3,80,000/माह, साथ में हर नए hire के लिए उसके joining महीने से ₹15,000/माह |
| सैटेलाइट डेटा लाइसेंस | ₹14,40,000 प्रति वर्ष, हर अप्रैल में पूरा अग्रिम भुगतान |

बोर्ड की नीति: raise तब तक close हो जाना चाहिए जब तक उस समय के burn पर कम से कम 6 महीने का नकद बचा हो। Raise में पहली मीटिंग से पैसा आने तक लगभग 5 महीने लगते हैं।

**डिलीवर करें** (markdown, लगभग 1,200 शब्दों के भीतर):

1. अप्रैल 2026 से सितंबर 2027 तक की मासिक तालिका, इन कॉलम के साथ: शुरुआती MRR, राजस्व, gross profit, पेरोल (बोझ सहित), अन्य opex, डेटा लाइसेंस, net burn और अंतिम नकद। हर कॉलम का फ़ॉर्मूला बताएँ।
2. जॉन का अनुमान कहाँ गलत है इसका संक्षिप्त मिलान, हर गलती का मासिक burn पर प्रभाव सहित।
3. इस योजना में नकद किस महीने ख़त्म होता है, और बोर्ड की नीति के अनुसार fundraising शुरू करने का आख़िरी महीना।
4. आपकी सिफ़ारिश: hiring plan जैसा है वैसा रखें, किसी hire को टालें या हटाएँ, या पहले raise करें। कम से कम एक वैकल्पिक scenario संक्षेप में model करें (जैसे CS hire को टालना, या AE hire न करके नया MRR ₹60,000 पर रखना) और बताएँ कि उससे runway पर क्या असर पड़ता है।

निकटतम रुपये तक round करें, और जो भी मान्यता आप जोड़ें उसे बताएँ।

## A strong answer

- Finds John's three errors: payroll without the 15% burden (and without the new hires), the data licence spread over the year when the cash leaves in April, and revenue subtracted in place of gross profit (78%).
- April 2026 net burn is about ₹26,21,900 (payroll ₹12,07,500 + opex ₹3,80,000 + licence ₹14,40,000 − gross profit ₹4,05,600). Burn settles at about ₹14.5–15.8 lakh a month from June to December 2026 and falls slowly as MRR grows.
- Under the full plan, cash runs out in July 2027 (about ₹4.9 lakh left at the end of June 2027), about 15 months, not 23. The second licence payment in April 2027 is a cliff (about ₹26.9 lakh of burn that month).
- Works back from the board policy: the raise must close by about December 2026 (about ₹95.8 lakh left, roughly 6.5 months of ₹14.6 lakh burn; by January 2027 the ₹81.8 lakh left is under 6 × ₹14.1 lakh), so fundraising has to start by about July 2026, within three months and far earlier than John's September 2027. The answer says this plainly.
- MRR is computed correctly (opening × 0.98 + new MRR). Formulas are stated for every column, and the alternative scenario is modelled with a quantified runway effect (for example, delaying the CSM to January 2027 saves about ₹3 lakh but cash still runs out in July 2027; dropping the AE stretches it only to about August 2027 while MRR grows more slowly), with a clear, justified recommendation.
