---
profession: marketer
task: analyze-campaigns
language: hi
deliverable: spreadsheets
---

## Prompt

आप Ridgeback Outfitters में marketing analyst हैं, जो एक direct-to-consumer outdoor-gear और trekking brand है। "Monsoon Trek Launch" campaign 1 जुलाई से 30 सितंबर 2025 तक चला। CMO की draft board slide कहती है: **"Monsoon Trek Launch ने 2,480 conversions और ₹2,57,20,000 revenue दिया, 2.37× ROAS पर।"** नतीजों का विश्लेषण कीजिए और Q4 (अक्टूबर–दिसंबर) के budget split की सिफ़ारिश कीजिए।

**Ad platform exports (हर platform की अपनी reporting के अनुसार)**

| Channel | Spend | Platform conversions | Platform revenue | Export date range |
|---|---|---|---|---|
| Meta (Facebook + Instagram) | ₹33,60,000 | 610 | ₹63,44,000 | 1 जुलाई – 30 सितंबर |
| Google Search | ₹28,80,000 | 540 | ₹60,48,000 | 1 जुलाई – 30 सितंबर |
| Google Performance Max | ₹22,40,000 | 470 | ₹48,88,000 | 1 जुलाई – 30 सितंबर |
| Moj (ShareChat) | ₹14,40,000 | 220 | ₹19,36,000 | 15 जुलाई – 14 अक्टूबर |
| Affiliate network | ₹7,20,000 | 260 | ₹27,04,000 | 1 जुलाई – 30 सितंबर |
| Email | ₹2,00,000 | 380 | ₹38,00,000 | 1 जुलाई – 30 सितंबर |

**Campaign से tagged Shopify orders, GA4 last-click channel के साथ, 1 जुलाई – 30 सितंबर (revenue GST रहित, RTO/cancelled orders हटाकर)**

| GA4 channel | Orders | Revenue |
|---|---|---|
| Meta | 330 | ₹33,00,000 |
| Google Search | 420 | ₹45,36,000 |
| Google PMax | 260 | ₹26,62,400 |
| Moj | 90 | ₹7,92,000 |
| Affiliate | 210 | ₹22,17,600 |
| Email | 250 | ₹28,00,000 |
| Direct / organic | 80 | ₹7,48,000 |
| **Total** | **1,640** | **₹1,70,56,000** |

**अन्य तथ्य**

- Campaign orders पर gross margin 55% है, cost of goods, shipping और payment-gateway fees के बाद।
- Affiliate "spend" में केवल commissions हैं। Network ने तिमाही के लिए ₹3,20,000 की platform fee अलग से ली।
- Google के अनुसार PMax conversions का 35% brand-name search queries से आया।
- अगस्त में Meta पर geo holdout test (10 matched शहरों/क्षेत्रों में 3 हफ़्ते ads बंद) में, जिन क्षेत्रों में ads चले वहाँ कुल store orders में 14% lift दिखा।
- Moj team का कहना है कि "अक्टूबर के numbers बहुत छोटे हैं, इसलिए window से फ़र्क नहीं पड़ता"।

**Markdown tables के रूप में दीजिए:**

1. **Reconciliation**: platform-claimed conversions और revenue बनाम Shopify actuals, over-attribution units और % में।
2. **Channel scorecard**: हर channel के लिए true cost (spend + fees), GA4 orders, GA4 revenue, ROAS, CAC, contribution (revenue × margin − cost) और verdict। हर formula बताइए।
3. **Board slide के लिए corrected headline numbers**: orders, revenue, blended ROAS, और कुल contribution, साथ में एक वाक्य की corrected headline।
4. **Q4 budget recommendation**: Q3 spend + fees जितना ही कुल, channel के अनुसार पुनर्वितरित, तर्क सहित, और यह note कि last-click किस channel को कम या ज़्यादा credit देता है।
5. **Caveats और next tests**: अधिकतम 5 bullets।

ROAS को दो दशमलव तक और राशि को निकटतम रुपये तक round कीजिए। उत्तर लगभग 1,200 शब्दों के भीतर रखिए।

## A strong answer

- Explains that the CMO's figures add up the platforms' self-reported numbers: 2,480 conversions and ₹2,57,20,000 against 1,640 actual orders and ₹1,70,56,000. That is over-attribution of 840 orders (about 51%), and ₹2,57,20,000 ÷ ₹1,08,40,000 = 2.37× is not a real ROAS. Also flags that Moj's export window doesn't match the campaign period.
- Includes the ₹3,20,000 affiliate fee: true cost is ₹1,11,60,000. Corrected blended ROAS is ₹1,70,56,000 ÷ ₹1,11,60,000 ≈ 1.53×. Contribution is ₹1,70,56,000 × 55% − ₹1,11,60,000 = −₹17,79,200, so the campaign lost money on a first-order basis.
- Computes channel ROAS correctly: Meta 0.98, Search 1.58, PMax 1.19 (and lower once brand cannibalisation is considered), Moj 0.55, Affiliate 2.13 (on ₹10,40,000 true cost), Email 14.00.
- Shows judgement on attribution: uses the Meta holdout to argue that last-click under-credits Meta, discounts PMax for brand queries, and treats Moj as the weakest case. Doesn't cut purely on last-click ROAS.
- The Q4 allocation sums to ₹1,11,60,000, follows from the scorecard, and proposes specific tests, such as a Moj holdout, PMax with brand exclusions, and a repeat-purchase or LTV view to complement first-order contribution (with Q4 festive-season seasonality noted as a caveat).
