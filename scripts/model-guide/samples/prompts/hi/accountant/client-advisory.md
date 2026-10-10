---
profession: accountant
task: client-advisory
language: hi
deliverable: spreadsheets
---

## Prompt

आप केसर बेकहाउस प्राइवेट लिमिटेड के outsourced CFO सलाहकार हैं। कंपनी बेंगलुरु में तीन रिटेल बेकरी स्टोर और एक होलसेल ब्रेड लाइन चलाती है। मालिक जेन डो गुरुवार की मैनेजमेंट मीटिंग से पहले Q2 FY 2025-26 (जुलाई–सितंबर 2025) की budget-versus-actual variance रिपोर्ट चाहती हैं। उनके बुककीपर का सारांश कहता है: "EBITDA बजट से ₹5,35,000 कम रहा, ज़्यादातर बीमे की वजह से।"

**Q2 FY 2025-26 का P&L (₹, सभी राशियाँ GST रहित)**

| मद | बजट | वास्तविक |
|---|---|---|
| राजस्व – होलसेल | 42,00,000 | 45,12,000 |
| राजस्व – रिटेल | 61,00,000 | 56,63,000 |
| सामग्री (ingredients) | 28,84,000 | 31,29,000 |
| पैकेजिंग | 4,12,000 | 4,07,000 |
| प्रत्यक्ष श्रम | 24,72,000 | 26,18,000 |
| किराया | 9,60,000 | 9,60,000 |
| बिजली, गैस, पानी | 3,80,000 | 4,46,000 |
| मार्केटिंग | 3,09,000 | 1,24,000 |
| बीमा | 90,000 | 3,60,000 |
| सामान्य और प्रशासनिक | 5,20,000 | 4,93,000 |

**परिचालन डेटा**

| ड्राइवर | बजट | वास्तविक |
|---|---|---|
| होलसेल ब्रेड (loaves) | 1,68,000, ₹25 प्रति loaf | 1,80,480, ₹25 प्रति loaf |
| रिटेल लेन-देन (bills) | 61,000 | 55,300 |
| रिटेल औसत बिल | ₹100.00 | ₹102.40 (rounded) |

**टीम के नोट्स**

- संपत्ति और लायबिलिटी बीमे का ₹3,60,000 का वार्षिक प्रीमियम (पॉलिसी वर्ष 1 जुलाई 2025 से 30 जून 2026) जुलाई में चुकाया गया और पूरा खर्च में डाल दिया गया।
- आटे के कॉन्ट्रैक्ट की कीमत 1 जुलाई से 9% बढ़ गई। सामग्री का बजट राजस्व का 28% रखा गया था।
- पूर्वी स्टोर में अगस्त से दो बेकर कम हैं; यह कमी दोगुनी दर (2×) वाले ओवरटाइम से पूरी की गई।
- सितंबर के लिए तय त्योहारी मार्केटिंग अभियान अक्टूबर में खिसका दिया गया; पूरा ₹3,09,000 अब Q3 (अक्टूबर–दिसंबर) में खर्च होगा।
- 1 जुलाई को रिटेल कीमतें लगभग 2.5% बढ़ाई गईं। होलसेल का gross margin रिटेल से लगभग 12 प्रतिशत अंक कम रहता है।
- बिजली-गैस: जुलाई से PNG का नया टैरिफ लागू हुआ, और पश्चिमी स्टोर के ओवन की सर्विसिंग देर से हुई।

**डिलीवर करें** (markdown, लगभग 1,200 शब्दों के भीतर):

1. Variance तालिका: हर मद के लिए बजट, वास्तविक, ₹ variance, % variance और अनुकूल/प्रतिकूल, gross profit और EBITDA के subtotal के साथ। अपना sign convention और हर गणना वाले कॉलम का फ़ॉर्मूला बताएँ।
2. बजट EBITDA से वास्तविक EBITDA तक का bridge, और एक "normalized" EBITDA जो उन चीज़ों को ठीक करे जो इस तिमाही में नहीं होनी चाहिए, adjustment दिखाते हुए।
3. रिटेल राजस्व variance का price/volume विभाजन, पद्धति सहित।
4. जेन के लिए टिप्पणी: हर बड़े variance पर कुछ वाक्य, timing अंतर को वास्तविक प्रदर्शन से अलग करते हुए।
5. प्राथमिकता क्रम में तीन सिफ़ारिशें, जिनमें यह राय भी हो कि रिटेल कीमतें फिर बढ़ानी चाहिए या होलसेल वॉल्यूम पर ज़्यादा ज़ोर देना चाहिए, कारण सहित।

बुककीपर के सारांश में कोई गलती हो तो बताएँ।

## A strong answer

- Gets gross profit to ₹45,32,000 budget vs ₹40,21,000 actual and EBITDA to ₹22,73,000 budget vs ₹16,38,000 actual, a ₹6,35,000 miss, and corrects the bookkeeper's ₹5,35,000.
- Normalizes insurance: ₹2,70,000 of the premium is prepaid, so the quarter's expense should be ₹90,000 and normalized EBITDA is ₹19,08,000, ₹3,65,000 below budget. The answer also says the ₹1,85,000 marketing underspend is timing, not a saving.
- Splits retail roughly into volume (5,700 fewer bills × ₹100 = −₹5,70,000) and price/mix (about +₹1,33,000), totalling −₹4,37,000.
- Explains the ingredient overrun as about ₹2,80,000 above 28% of actual revenue (₹31,29,000 vs ₹28,49,000), consistent with the flour repricing, and names the labour overtime driver.
- Recommendations follow from the data. The answer notices that growing wholesale volume lowers margin while retail traffic is falling, and keeps the sign convention consistent throughout.

## Card

brief: बेंगलुरु की एक बेकरी की मालिक के लिए Q2 की budget-versus-actual variance रिपोर्ट बनाएँ, EBITDA normalize करें और बुककीपर का सारांश जाँचें।
given:
- बुककीपर का सारांश: EBITDA में बताई गई कमी और उसका कारण
- Q2 FY 2025-26 का P&L: 10 मदों का बजट और वास्तविक
- परिचालन डेटा: होलसेल loaves, रिटेल bills और औसत बिल, बजट और वास्तविक
- टीम के नोट्स: बीमा, आटा, स्टाफ़, मार्केटिंग, कीमतों और बिजली-गैस पर 6 नोट
asked:
- Gross profit और EBITDA subtotal वाली variance तालिका, sign convention और फ़ॉर्मूलों सहित
- बजट से वास्तविक EBITDA तक का bridge, और adjustment दिखाता normalized EBITDA
- रिटेल राजस्व variance का price/volume विभाजन, पद्धति सहित
- जेन के लिए टिप्पणी, timing अंतर को वास्तविक प्रदर्शन से अलग करते हुए
- प्राथमिकता क्रम में तीन सिफ़ारिशें, रिटेल कीमत बनाम होलसेल वॉल्यूम की राय सहित
limit: लगभग 1,200 शब्दों के भीतर, Markdown
hard: एक सारांश आंकड़े को सत्यापित करना है, कुछ खर्च शायद इस तिमाही के नहीं हैं, timing को प्रदर्शन से अलग करना है, और कीमत बनाम वॉल्यूम पर judgement चाहिए।

## Scorecard

- Gross profit ₹45,32,000 vs ₹40,21,000; EBITDA ₹22,73,000 vs ₹16,38,000, a ₹6,35,000 miss, not ₹5,35,000
- Treats ₹2,70,000 of insurance as prepaid: normalized EBITDA ₹19,08,000, ₹3,65,000 below budget
- Calls the ₹1,85,000 marketing underspend timing, not a saving
- Splits retail −₹4,37,000 into volume −₹5,70,000 (5,700 × ₹100) and price/mix about +₹1,33,000
- Ties ingredients ~₹2,80,000 over 28% of actual revenue (₹28,49,000) to flour repricing; names 2× overtime behind labour
- Recommendations follow the data: wholesale growth lowers margin as retail traffic falls; one sign convention throughout

## Scorecard, shown

- Gross profit बजट ₹45,32,000 बनाम वास्तविक ₹40,21,000; EBITDA ₹22,73,000 बनाम ₹16,38,000, यानी कमी ₹6,35,000 है, ₹5,35,000 नहीं
- बीमे के ₹2,70,000 को prepaid मानता है: normalized EBITDA ₹19,08,000, बजट से ₹3,65,000 कम
- मार्केटिंग के ₹1,85,000 कम खर्च को बचत नहीं, timing अंतर बताता है
- रिटेल −₹4,37,000 को volume −₹5,70,000 (5,700 × ₹100) और price/mix लगभग +₹1,33,000 में बाँटता है
- सामग्री का वास्तविक राजस्व के 28% (₹28,49,000) से लगभग ₹2,80,000 ज़्यादा होना आटे की बढ़ी कीमत से जोड़ता है; श्रम के पीछे 2× ओवरटाइम बताता है
- सिफ़ारिशें डेटा से निकलती हैं: रिटेल ट्रैफ़िक घटते समय होलसेल वृद्धि margin घटाती है; sign convention शुरू से अंत तक एक जैसा
