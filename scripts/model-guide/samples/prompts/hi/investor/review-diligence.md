---
profession: investor
task: review-diligence
language: hi
deliverable: spreadsheets
---

## Prompt

आप Alder Row Equity की deal team में हैं। Alder Row, Keystone Fleet Software Pvt. Ltd. के अधिग्रहण पर विचार कर रहा है, जिसकी कीमत ARR के multiple पर आधारित है। Management के data room में लिखा है "30 जून 2025 को ARR ₹21.00 crore", और deck कहता है "ARR = live customers से annualized contracted recurring revenue, INR में, GST रहित"। Management के ARR schedule को नीचे दिए contract abstracts और billing data से reconcile कीजिए, और diligence-adjusted ARR निकालिए।

**Management ARR schedule (30 जून 2025, ₹ लाख)**

| # | Customer | ARR |
|---|---|---|
| C1 | Atlas Freight | 420.00 |
| C2 | Birchway Foods | 310.00 |
| C3 | Cobalt Mining Co. | 275.00 |
| C4 | Delmar Transit | 240.00 |
| C5 | Evergreen Utilities | 198.00 |
| C6 | Fairhaven Logistics | 180.00 |
| C7 | Granite Builders | 150.00 |
| C8 | Halcyon Retail | 132.00 |
| C9 | Ironwood Ag (Singapore) | 120.00 |
| C10 | Juniper Couriers | 75.00 |
| | **Total** | **2,100.00** |

**Contract abstracts और billing data (legal और finance diligence teams द्वारा तैयार; सभी राशियाँ GST रहित)**

- **C1:** 3 साल की अवधि, 1 जनवरी 2024 – 31 दिसंबर 2026। वार्षिक subscription fee: Year 1 ₹300 लाख, Year 2 ₹360 लाख, Year 3 ₹420 लाख।
- **C2:** Subscription ₹260 लाख प्रति वर्ष। अलग से ₹50 लाख की one-time implementation fee, फ़रवरी 2025 में invoice की गई।
- **C3:** अवधि 31 मार्च 2025 को समाप्त। Renewal proposal 10 अप्रैल 2025 को भेजा गया, अब तक unsigned। Product usage logs में 1 मई 2025 के बाद कोई login नहीं।
- **C4:** ₹240 लाख प्रति वर्ष, अवधि 31 दिसंबर 2027 तक। Clause 14.2: "Customer may terminate for convenience on ninety (90) days' written notice at any time after September 30, 2025."
- **C5:** ₹198 लाख प्रति वर्ष, अवधि 30 जून 2026 तक। कोई समस्या नहीं।
- **C6:** List fee ₹15 लाख प्रति माह। Order form: "20% introductory discount 31 दिसंबर 2025 तक लागू।" जून 2025 invoice: ₹12 लाख।
- **C7:** ₹150 लाख प्रति वर्ष, अवधि 31 मार्च 2027 तक। कोई समस्या नहीं।
- **C8:** 20 जून 2025 को signed। Subscription ₹132 लाख प्रति वर्ष, service start date 1 सितंबर 2025। अभी onboard नहीं हुआ।
- **C9:** Export contract, US dollars में: USD 1,20,000 प्रति वर्ष। Management ने FY26 plan की ₹100/USD दर इस्तेमाल की है। 30 जून 2025 की दर ₹85.50 प्रति USD इस्तेमाल कीजिए।
- **C10:** कोई minimum commitment नहीं; usage पर मासिक billing। Invoices: अप्रैल ₹4.75 लाख, मई ₹5.50 लाख, जून ₹6.25 लाख।

**Markdown tables के रूप में दीजिए:**

1. **Reconciliation table**: customer, management ARR, adjusted ARR, adjustment (₹), issue category (जैसे ramp, one-time fee, churned, FX, not live, usage-based, discount, termination risk), और हर adjustment का आधार। हर computed figure का formula बताइए।
2. **Bridge**: management ARR → adjusted live ARR, category के अनुसार, और contracted-but-not-live ARR के लिए अलग line।
3. **Risk-weighted view**: वे customers जिनका ARR आज वास्तविक है लेकिन अगले 12 महीनों में जोखिम में है, कारण और दाँव पर लगे ARR के साथ।
4. **Concentration**: adjusted ARR में top 3 customers का हिस्सा।
5. **Investment committee के लिए summary**: अधिकतम 6 bullets, जिसमें management के प्रस्तावित 6.0× ARR multiple पर purchase price पर असर शामिल हो।

जहाँ treatment judgement call है (जैसे C6 और C10), विकल्प और उसका असर बताइए। उत्तर लगभग 1,200 शब्दों के भीतर रखिए।

## A strong answer

- Makes the core adjustments: C1 to the Year 2 rate of ₹360 lakh (−₹60 lakh); C2 to ₹260 lakh (−₹50 lakh one-time fee); C3 to ₹0, as churned or unrenewed (−₹275 lakh); C9 to USD 1,20,000 × ₹85.50 = ₹102.60 lakh (−₹17.40 lakh FX).
- Treats C8 as contracted-not-live, so ₹0 in live ARR with ₹132 lakh shown separately, under the deck's own definition. C6 is taken at the current billed ₹12 lakh × 12 = ₹144 lakh (−₹36 lakh) with ₹180 lakh noted as the alternative after the discount expires. C10 is taken at the 3-month average, ₹5.50 lakh × 12 = ₹66 lakh (−₹9 lakh), noting that management annualized June (₹6.25 lakh × 12 = ₹75 lakh) and that usage revenue is uncommitted.
- Arrives at adjusted live ARR of about ₹1,520.60 lakh (₹15.21 crore; −₹579.40 lakh, or −27.6%), or ₹1,652.60 lakh including C8. The bridge ties exactly to ₹2,100 lakh.
- Flags C4 (₹240 lakh, terminable for convenience after 30 Sep 2025) and C5 (renewal due June 2026) as at-risk. Computes the top-3 concentration (C1 + C2 + C4 = ₹860 lakh ≈ 56.6%), with C1 about 23.7% of adjusted ARR.
- Translates the result into price: at 6.0×, ₹21.00 crore implies ₹126.0 crore against about ₹91.2 crore on adjusted ARR, a gap of about ₹34.8 crore. Recommends how to handle it, such as a re-price, an earn-out tied to C3 or C8, or an escrow.
