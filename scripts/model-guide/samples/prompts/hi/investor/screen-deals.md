---
profession: investor
task: screen-deals
language: hi
deliverable: spreadsheets
---

## Prompt

आप Halden Peak Ventures में associate हैं। Fund एक SEBI-registered Category II AIF है। Partners की सोमवार की meeting में तीन first meetings की जगह है। इस हफ़्ते की inbound Series A pipeline को fund के criteria पर screen कीजिए और बताइए कि किन तीन को लेना चाहिए।

**Fund criteria (सभी pass होने चाहिए, जब तक कोई partner किसी एक को waive न करे)**

| Criterion | Threshold |
|---|---|
| Sector | B2B software; hardware पर निर्भर revenue नहीं |
| Geography | भारत में headquartered (Indian company) |
| ARR (केवल recurring) | ₹15 – ₹40 crore |
| YoY ARR growth | ≥ 80% |
| Net revenue retention (NRR) | ≥ 110% |
| Gross margin | ≥ 70% |
| Burn multiple (net burn ÷ net new ARR, पिछले 12 महीने) | ≤ 2.0 |
| Round | हम ₹80–120 crore के cheque से lead करते हैं, इसलिए round size कम से कम ₹80 crore |

Fund की legal team का note: SEBI AIF नियमों के तहत किसी विदेशी company में निवेश के लिए SEBI से overseas investment limit का आवंटन चाहिए, और यह केवल उन्हीं investee companies में संभव है जिनका "Indian connection" हो (जैसे front office विदेश में, back office/operations भारत में)।

**Pipeline (founders द्वारा बताए गए, CRM से; ₹ crore)**

| Company | क्या करती है | HQ | ARR अभी | ARR 12 माह पहले | Net burn (TTM) | NRR | Gross margin | Raising |
|---|---|---|---|---|---|---|---|---|
| Ledgerly | Mid-market के लिए AP automation | बेंगलुरु | 32 | 16 | 24 | 118% | 78% | 100 |
| Fleetwise | Fleet telematics: SaaS + in-vehicle devices | गुरुग्राम | 28 | 14 | 35 | 121% | 52% | 120 |
| Quorum HR | HR और labour-code compliance workflows | पुणे | 46 | 29 | 20 | 113% | 82% | 150 |
| Parcel Lane | 3PLs के लिए shipping orchestration | मुंबई | 39 | 15 | 26 | 112% | 74% | 110 |
| Sentinel Docs | In-house legal के लिए AI contract review | बेंगलुरु | 24 | 6 | 18 | 125% | 80% | 90 |
| Northbeam Analytics | Marketing attribution | हैदराबाद | 21 | 10 | 14 | 104% | 81% | 60 |
| Tallow | Restaurant groups के लिए back-office SaaS | चेन्नई | 19 | 9 | 16 | 115% | 72% | 90 |
| Corvid Security | SMBs के लिए endpoint security | Singapore | 35 | 17 | 27 | 116% | 79% | 100 |

**Data rooms और first calls के notes**

- Parcel Lane: "ARR अभी" में पिछले 12 महीनों में bill की गई ₹11 crore की one-time implementation fees शामिल हैं। 12 महीने पहले का ARR पिछले साल के deck से है और केवल recurring है।
- Sentinel Docs: ARR = "दिसंबर revenue × 12"। दिसंबर revenue ₹2.0 crore था, जिसमें ₹0.9 crore की one-off pilot fee शामिल थी।
- Tallow: सबसे बड़ा customer ARR का 40% है, और उसका contract 5 महीने में renew होना है।
- Corvid Security: "अगले साल India में reverse flip और मुंबई office की योजना"। 60 लोगों की engineering team पुणे में है। सभी customers अभी Southeast Asia और Middle East में हैं।
- Northbeam: एक partner, जेन डो, founders को अच्छी तरह जानती हैं और "बाकी सब शानदार हो तो" एक criterion waive करने पर विचार करेंगी।

**Markdown tables के रूप में दीजिए:**

1. **Screening table**: हर company की एक row, जिसमें corrected recurring ARR, YoY growth %, burn multiple, हर criterion पर pass/fail, और fail हुए criteria की संख्या। हर computed column का formula बताइए। जहाँ आपने founder का बताया आँकड़ा सुधारा, reported और corrected दोनों दिखाइए।
2. **Ranking**: सोमवार के लिए top तीन, हर एक के लिए दो वाक्यों का तर्क और first meeting में पूछे जाने वाले तीन सवाल।
3. **Near-misses**: अधिकतम तीन companies जिन पर waiver की चर्चा हो सकती है, waive किए जाने वाले criterion और waive करने पर आपकी राय के साथ।

Growth को एक दशमलव और burn multiples को दो दशमलव तक round कीजिए। उत्तर लगभग 1,200 शब्दों के भीतर रखिए।

## A strong answer

- Corrects Parcel Lane to ₹28 crore recurring ARR, giving growth of 86.7% (not the 160% the reported figures imply) and a burn multiple of exactly 2.00 (26 ÷ 13), which is a borderline pass. Corrects Sentinel Docs to ₹1.1 crore × 12 = ₹13.2 crore ARR, which fails the ₹15 crore floor, with a burn multiple of 2.50.
- Computes the rest correctly: Ledgerly 100% growth and 1.50 burn multiple; Fleetwise 2.50 (also failing on gross margin and hardware); Quorum HR 58.6% growth and 1.18, with ARR above the range; Northbeam 1.27, failing on NRR and round size; Tallow 111.1% and 1.60; Corvid 105.9% and 1.50, failing on geography.
- Ledgerly is in the top three. The other picks are reasoned, for example Tallow (passes every criterion, with its 40% concentration and renewal date listed as the first diligence question) and Parcel Lane on recurring figures.
- Takes a clear position on waivers. For example, Corvid's geography is the most waivable gap: the Pune engineering team likely gives it the "Indian connection" SEBI requires, but it would need an overseas-limit allocation, or the investment could be conditioned on the reverse flip. Northbeam fails two criteria, so one waiver can't rescue it despite the relationship.

## Card

brief: 8 inbound Series A companies को fund के criteria पर screen कीजिए, founders के आँकड़े सुधारिए, और सोमवार के लिए तीन चुनिए।
given:
- Fund criteria: 8 thresholds, जिन्हें केवल कोई partner waive कर सकता है
- Legal team का note: विदेशी company में निवेश के लिए SEBI overseas limit और "Indian connection"
- Pipeline: 8 companies के founder-reported ARR, net burn, NRR, gross margin और round size
- Data rooms और first calls के notes: खास companies पर 5 notes
asked:
- Screening table: corrected recurring ARR, YoY growth, burn multiple, हर criterion पर pass/fail और fail की संख्या
- Ranking: top तीन, हर एक का तर्क और first meeting के तीन सवाल
- Near-misses: waiver की चर्चा लायक अधिकतम तीन companies
limit: लगभग 1,200 शब्दों के भीतर, Markdown tables, growth एक दशमलव और burn multiples दो दशमलव तक
hard: Founders के आँकड़े notes से सुधारने हैं, कुछ नतीजे ठीक threshold पर हैं, और waivers पर judgement call चाहिए।

## Scorecard

- Parcel Lane corrected to ₹28 crore: growth 86.7% (not 160%), burn multiple 2.00 (26 ÷ 13), a borderline pass
- Sentinel Docs corrected to ₹13.2 crore: fails the ₹15 crore ARR floor; burn multiple 2.50
- Ledgerly 100%/1.50; Fleetwise 2.50, fails margin and hardware; Quorum 58.6%/1.18, ARR above range
- Northbeam 1.27, fails NRR and round size; Tallow 111.1%/1.60; Corvid 105.9%/1.50, fails geography
- Top three include Ledgerly; other picks reasoned, e.g. Tallow with its 40% concentration as first question
- Waivers: Corvid most waivable (Pune team's "Indian connection", overseas limit or reverse flip); Northbeam fails two

## Scorecard, shown

- Parcel Lane सुधरकर ₹28 crore: growth 86.7% (160% नहीं), burn multiple 2.00 (26 ÷ 13), सीमा पर pass
- Sentinel Docs सुधरकर ₹13.2 crore: ₹15 crore की ARR सीमा पर fail; burn multiple 2.50
- Ledgerly 100%/1.50; Fleetwise 2.50, margin और hardware पर fail; Quorum 58.6%/1.18, ARR range से ऊपर
- Northbeam 1.27, NRR और round size पर fail; Tallow 111.1%/1.60; Corvid 105.9%/1.50, geography पर fail
- Top तीन में Ledgerly; बाकी चुनाव तर्कसंगत, जैसे Tallow, 40% concentration को पहले सवाल के रूप में रखकर
- Waivers: Corvid सबसे waivable (पुणे team से "Indian connection", overseas limit या reverse flip); Northbeam दो पर fail
