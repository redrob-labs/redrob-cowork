---
profession: investor
task: research-companies
language: hi
deliverable: spreadsheets
---

## Prompt

आप Marrow & Finch Capital में principal हैं। आप Wastewise का मूल्यांकन कर रहे हैं, एक seed-stage company जो भारत के commercial kitchens को food-waste tracking software (kitchen bin पर camera और weighing scale, साथ में analytics) बेचती है। Partner meeting से पहले आपको भारत के market size का defensible अनुमान और competitors का snapshot चाहिए। Research में यह मिला:

**[1] National Restaurant Census 2024 (trade association report)**
> भारत में 7,42,000 organised restaurant outlets: 38% full-service (casual और fine dining), 52% QSR और cloud kitchens, 10% अन्य (cafés, bars, food trucks)।

**[2] Institutional Foodservice Review, 2024 edition**
> भारत में लगभग 96,000 institutional kitchens: hospitals, universities, corporate cafeterias और hotel central kitchens।

**[3] Wastewise company blog, "हमने Wastewise क्यों बनाया" (2025)**
> "Food waste tech ₹35,000 crore का market है।" (Footnote एक global food-waste management report का हवाला देता है, जिसमें hauling, composting और biogas/anaerobic digestion शामिल हैं।)

**[4] Analyst note, Greenline Research, मई 2025**
> Waste-tracking software की penetration भारत के full-service restaurants में लगभग 3% और institutional kitchens में लगभग 11% है। QSR chains और cloud kitchens ज़्यादातर franchisor या aggregator द्वारा तय inventory tools इस्तेमाल करते हैं और "निकट भविष्य में buyer नहीं हैं"।

**[5] Pricing pages और articles (सभी कीमतें GST अतिरिक्त)**
> - "BinSight" (स्थापित incumbent): ₹4,499 प्रति location प्रति माह (pricing page, 2025)।
> - "Kitchen Ledger": ₹72,000 प्रति kitchen प्रति वर्ष, साथ में ₹45,000 का one-time hardware kit (pricing page, 2025)।
> - "Scrapless": "₹2,499/माह" (TechWire article, 2021)। Scrapless pricing page, 2025: "Plans ₹5,499/माह प्रति location से शुरू"।
> - Wastewise: average contract value ₹63,000 प्रति location प्रति वर्ष (company data room)।

**[6] Funding news**
> - StartupWire aggregator (2025): "Kitchen Ledger ने ₹330 crore का Series B जुटाया।"
> - Kitchen Ledger press release (12 मार्च 2025): "Kitchen Ledger ने Orchard Lane Partners के lead में ₹115 crore का Series B close किया।"
> - BinSight: "₹180 crore Series C" (press release, 2023)। Scrapless: "₹12 crore seed" (press release, 2022)।

**[7] Wastewise data room**
> 410 live locations, 70% institutional। पिछले 12 महीनों में logo churn 14%, ज़्यादातर independent full-service restaurants में।

**Markdown tables के रूप में दीजिए:**

1. **Market sizing**: bottom-up भारत TAM और SAM, साथ में current market (आज की penetration × कीमत), हर row में inputs और formula। TAM और SAM में कौन-से segments आते हैं, चुनिए और justify कीजिए। एक ही blended price इस्तेमाल कीजिए और बताइए कि वह कैसे निकाला।
2. **Top-down cross-check**: एक-दो पंक्तियों में बताइए कि source [3] क्यों इस्तेमाल नहीं हो सकता, और उसे reconcile करने के लिए क्या चाहिए।
3. **Competitor table**: company, pricing (प्रति location वार्षिक, source वर्ष सहित), hardware model, latest funding (आँकड़े पर आपका confidence), और Wastewise के लिए implication।
4. **Source reliability**: हर source को high, medium या low, एक पंक्ति के कारण के साथ।
5. **Founders के लिए open questions**: अधिकतम 5।

Market figures को निकटतम ₹1 crore तक round कीजिए। उत्तर लगभग 1,200 शब्दों के भीतर रखिए।

## A strong answer

- Builds the market bottom-up from 742,000 × 38% = 281,960 full-service locations plus 96,000 institutional kitchens = 377,960 locations. With a blended price of about ₹60,000–₹65,000 a year, the India TAM is about ₹2,268–2,457 crore. Excludes QSR/cloud kitchens from SAM, citing [4].
- Computes the current market from penetration: 281,960 × 3% ≈ 8,459 plus 96,000 × 11% = 10,560, about 19,019 locations, which is roughly ₹114–124 crore a year at the blended price.
- Rejects the ₹35,000 crore figure because it is global, covers hauling, composting and digestion rather than software, and is quoted by the company itself.
- Annualizes prices correctly (BinSight ₹4,499 × 12 = ₹53,988; Scrapless ₹5,499 × 12 = ₹65,988, with the 2021 ₹2,499 discarded as stale; Kitchen Ledger ₹72,000 plus the ₹45,000 kit), all ex-GST. Treats Kitchen Ledger's Series B as ₹115 crore from the primary press release, not the aggregator's ₹330 crore.
- Draws a judgement from the data, for example that Wastewise's institutional skew suits the higher-penetration, lower-churn segment, and that its 14% churn among independent restaurants questions whether full-service belongs in SAM. Turns that into a founder question.
