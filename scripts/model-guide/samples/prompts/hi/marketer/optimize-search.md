---
profession: marketer
task: optimize-search
language: hi
deliverable: none
---

## Prompt

आप Fieldnote में SEO और content lead हैं। Fieldnote, AC installation और service businesses के लिए field-service management app है। `fieldnote.example.com/hi/ac-service-scheduling-software` पर हिंदी product page को दोबारा लिखिए ताकि वह बेहतर rank करे और AI answer engines उसे सही-सही quote करें। Page हिंदी में हो; queries में आने वाले English terms (जैसे "AC service scheduling software") जस के तस रखे जा सकते हैं। Data यह है।

**Google Search Console, पिछले 90 दिन, यह page**

| Query | Impressions | Clicks | CTR | Avg. position |
|---|---|---|---|---|
| ac service scheduling software | 18,400 | 312 | 1.7% | 8.4 |
| ac service dispatch software | 9,700 | 105 | 1.1% | 11.2 |
| best ac service software for small business | 6,200 | 41 | 0.7% | 14.8 |
| ac service app free | 4,900 | 22 | 0.4% | 9.1 |
| fieldnote pricing | 2,300 | 1,150 | 50.0% | 1.2 |
| ac service software tally integration | 1,800 | 9 | 0.5% | 17.5 |
| fieldnote offline chalta hai | 640 | 48 | 7.5% | 3.1 |

Blog post `/hi/blog/ac-service-scheduling-guide` भी "ac service scheduling software" के लिए rank करता है (avg. position 9.6)। दोनों URLs results में बारी-बारी से आते-जाते रहते हैं।

**मौजूदा page (अंश)**

> **Title tag:** Fieldnote | Software
> **H1:** अपना business चलाने का सबसे smart तरीका
> Fieldnote contractors के लिए #1 tool है। Plans ₹499/माह से। Tally के साथ काम करता है। आज ही free शुरू करें!

**Product facts (product team से, नवंबर 2025 तक सही)**

- Pricing: ₹799 प्रति user प्रति माह (वार्षिक billing) या ₹999 month-to-month, दोनों पर 18% GST अतिरिक्त। कोई free plan नहीं; 14 दिन का free trial, card की ज़रूरत नहीं।
- Scheduling: drag-and-drop dispatch board, recurring AMC (annual maintenance contract) visits, और skill व दूरी के आधार पर technician का automatic assignment।
- Integrations: TallyPrime (customers, GST invoices और payments का two-way sync)। पुराना Tally.ERP 9 supported नहीं है।
- Offline: technician mobile app offline चलता है और network आने पर sync होता है। Office web app के लिए connection ज़रूरी है।
- Customers: 1,200 AC service companies। Median customer: 6 technicians।
- Customer data: dispatchers का scheduling समय हफ़्ते में 9 से घटकर 4 घंटे हुआ (customer survey, n = 210, मार्च 2025)।

**ASCI Code (Advertising Standards Council of India), संबंधित अंश (संक्षिप्त)**

> Chapter I.1: विज्ञापन सच्चे हों; वस्तुनिष्ठ रूप से जाँचे जा सकने वाले तथ्यों से जुड़े सभी descriptions, claims और comparisons substantiate किए जा सकने चाहिए। Chapter I.4: विज्ञापन implication या omission के ज़रिये उपभोक्ता को गुमराह न करें। ASCI leadership-claim guidelines (सारांश): "No.1" जैसे दावे के लिए विश्वसनीय, स्वतंत्र data चाहिए, और उसका source व अवधि विज्ञापन में बताई जानी चाहिए। (Fieldnote के पास ऐसा कोई data नहीं है।)

**Answer engines अभी क्या कहते हैं (snapshot)**

> "ac service scheduling software" का AI overview: तीन competitors की सूची, प्रति user कीमत, Tally support और offline mode की comparison table के साथ। Fieldnote का ज़िक्र नहीं।
> "fieldnote offline chalta hai" का AI answer: "Fieldnote के लिए internet connection ज़रूरी है।" (source: 2022 का एक forum thread)

**Markdown में दीजिए:**

1. 60 characters या कम का title tag और 155 characters या कम का meta description, हर एक के साथ उसकी character count।
2. दोबारा लिखा गया page: H1, intro, H2 sections, एक छोटी "Fieldnote एक नज़र में" fact table, और 5–7 सवालों का FAQ जिसके जवाब स्वतंत्र हों, यानी अकेले quote किए जाने पर भी हर जवाब का अर्थ साफ़ रहे।
3. FAQPage और SoftwareApplication JSON-LD code block में, page copy से मेल खाता हुआ।
4. Blog post और internal linking की योजना (अधिकतम 5 bullets)।
5. Rationale (अधिकतम 150 शब्द): आपने किन queries को target किया, किन्हें जानबूझकर नहीं किया, और क्यों।

लिखित हिस्से लगभग 1,200 शब्दों के भीतर रखिए। JSON-LD इस सीमा में नहीं गिना जाएगा।

## A strong answer

- Corrects the outdated or false claims on the current page: the price is ₹799 per user per month annually or ₹999 month-to-month, plus GST, not "from ₹499"; there is no free plan, only a 14-day trial; Tally support is TallyPrime only, not Tally.ERP 9; the "#1" and "सबसे smart" claims are removed because they cannot be substantiated under the ASCI Code (no independent data, source or period).
- Answers "ac service app free" honestly with the trial instead of implying a free plan (which would mislead by implication under ASCI Chapter I.4), and explains that choice in the rationale.
- Corrects the AI answers with an FAQ entry stating plainly that the technician app works offline and the office web app does not. The page includes a quotable fact table (price per user, TallyPrime, offline mode) that mirrors the comparison format in the AI overview.
- Targets "ac service scheduling software" and "ac service dispatch software" in the title, H1 and H2s. Resolves the cannibalisation with a specific plan, such as repositioning the blog post for informational intent and linking it to the product page with exact-match anchor text.
- The title is 60 characters or fewer and the meta description 155 or fewer, with accurate counts (Devanagari counted by Unicode characters, including matras). The JSON-LD is valid and matches the page (price 799, priceCurrency INR, offer, FAQ text), and the survey claim is attributed (n = 210, March 2025).
