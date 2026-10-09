---
profession: lawyer
task: review
language: hi
deliverable: documents
---

## Prompt

आप Riverbend Health Network Pvt. Ltd. (मुंबई का hospital system) में in-house counsel हैं। Procurement शुक्रवार तक Calyx Workforce Software Pvt. Ltd. (registered office बेंगलुरु) के Master Subscription Agreement (MSA) पर हस्ताक्षर करना चाहता है। यह ShiftPilot के लिए है, एक nurse-scheduling platform, जो staffing levels तय करने के लिए रोज़ का patient census import करता है, जिसमें मरीज़ों के नाम, ward और acuity scores शामिल हैं। Order form: 3 साल की initial term, ₹1,44,00,000 (₹1.44 crore) प्रति वर्ष subscription और ₹48,00,000 (₹48 लाख) की one-time implementation fee (सभी राशियाँ GST अतिरिक्त)। Riverbend के playbook के विरुद्ध अंशों की समीक्षा कीजिए और review memo तैयार कीजिए।

**Riverbend contracting playbook (SaaS)**

| विषय | स्थिति |
|---|---|
| Liability cap | कम से कम 12 महीने की सभी paid या payable fees; data-protection breaches के लिए कम से कम 3× annual fees का super-cap |
| Indemnities | Vendor, IP infringement और अपने data breaches के लिए indemnify करे, cap के बाहर |
| Renewal | Renewal term 1 वर्ष या कम; notice period 60 दिन या कम; renewal पर मूल्य वृद्धि 3% या कम |
| Patient data | कोई भी patient personal data साझा करने से पहले signed Data Processing Agreement (DPA) अनिवार्य |
| SLA | 99.9% monthly uptime; लगातार विफलता पर credits एकमात्र उपाय नहीं |
| Law / venue | भारतीय क़ानून; मुंबई के न्यायालय |
| Exit | Standard format में बिना शुल्क data export; termination के बाद data वापस लेने के लिए 60 दिन |

**MSA के अंश**

> **1.7 "Fees"** means the recurring subscription fees under an Order Form, excluding implementation, professional services and pass-through charges.
>
> **7.3** Vendor will comply with the Data Processing Agreement attached as Exhibit C.
>
> **Exhibit C.** [Intentionally omitted.]
>
> **8.1** Vendor will use commercially reasonable efforts to make the Service available 99.5% of each month, excluding scheduled maintenance announced at least 24 hours in advance. Service credits are Customer's sole and exclusive remedy for any failure to meet this commitment.
>
> **9.1** EXCEPT FOR OBLIGATIONS UNDER SECTION 10.4, EACH PARTY'S AGGREGATE LIABILITY ARISING OUT OF THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID BY CUSTOMER IN THE THREE (3) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.
>
> **9.2** NEITHER PARTY SHALL BE LIABLE FOR INDIRECT, INCIDENTAL OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF DATA AND COSTS OF BREACH NOTIFICATION.
>
> **10.1** Vendor will defend Customer against third-party claims that the Service infringes an Indian patent, copyright or trademark. **10.2** Customer will defend and indemnify Vendor against any claim arising from Customer Data. **10.3** This Section 10 states each party's entire liability for third-party claims. *(कोई Section 10.4 नहीं है।)*
>
> **12.2** This Agreement renews automatically for successive three (3)-year terms unless either party gives notice of non-renewal at least 120 days before the end of the then-current term. Fees for a renewal term may increase by up to 9%.
>
> **13.1** This Agreement is governed by the laws of India. The courts at Bengaluru shall have exclusive jurisdiction.
>
> **14.3** Vendor will delete Customer Data 30 days after termination. Export assistance is available at Vendor's then-current professional-services rates.

**क़ानून (संक्षिप्त)**

> Digital Personal Data Protection Act, 2023: धारा 8(2) — Data Fiduciary अपनी ओर से processing के लिए Data Processor को केवल valid contract के तहत लगा सकता है। धारा 8(5) — Data Fiduciary, अपने Data Processor द्वारा किए गए processing सहित, reasonable security safeguards रखेगा। धारा 8(6) — personal data breach होने पर Data Fiduciary, Data Protection Board और हर प्रभावित Data Principal को सूचना देगा। Schedule: reasonable security safeguards में विफलता पर ₹250 crore तक की penalty।
>
> Code of Civil Procedure, 1908, धारा 20 (संक्षिप्त): वाद वहाँ संस्थित हो सकता है जहाँ defendant रहता है या कारोबार करता है, या जहाँ cause of action पूर्णतः या अंशतः उत्पन्न हुआ। Indian Contract Act, 1872, धारा 28 (संक्षिप्त): जो करार किसी पक्ष को सामान्य न्यायालयों में अपने अधिकार लागू करने से पूर्णतः रोकता है, वह उस हद तक void है। (सामान्य स्थिति: कई सक्षम न्यायालयों में से किसी एक को exclusive jurisdiction देना वैध है; किसी अक्षम न्यायालय को jurisdiction नहीं दी जा सकती।)
>
> Consumer Protection Act, 2019: धारा 2(46) — "unfair contract" में ऐसा contract शामिल है जो consumer पर कोई अनुचित शुल्क, दायित्व या शर्त थोपता है जिससे consumer को नुक़सान हो। धारा 2(7) — "consumer" में वह व्यक्ति शामिल नहीं जो किसी "commercial purpose" के लिए सेवा लेता है; Explanation (a): commercial purpose में वह उपयोग शामिल नहीं जो व्यक्ति स्व-रोज़गार द्वारा केवल अपनी आजीविका कमाने के लिए करता है।

**Deliver:** review memo markdown में, इन headed sections के साथ:

1. Bottom line: sign / अभी sign नहीं, और क्यों
2. Issues table: clause, issue, risk (High/Medium/Low), प्रस्तावित redline भाषा, और स्वीकार्य fallback
3. शुक्रवार की call पर जीतने के पाँच बिंदु, प्राथमिकता क्रम में
4. क़ानूनी प्रावधानों पर notes: क्या और कैसे हर एक Riverbend की मदद करता है

Cap को राशि में बताइए। उत्तर लगभग 1,200 शब्दों के भीतर रखिए।

## A strong answer

- Puts the DPA first as the blocking issue: ShiftPilot will receive patient personal data (health data), Riverbend is the Data Fiduciary and stays liable for the processor's safeguards under DPDP s.8(5), s.8(2) requires a valid contract, and Exhibit C is omitted. Recommends not signing, or not going live with census data, until a DPA is signed.
- Quantifies the cap: "Fees" excludes implementation, so three months is ₹1,44,00,000 ÷ 12 × 3 = ₹36,00,000 (₹36 lakh), against a playbook cap of at least ₹1.92 crore in year 1 (₹1.44 crore + ₹48 lakh) and a ₹4.32 crore super-cap; compares this with the up-to-₹250 crore DPDP penalty exposure.
- Notices that the carve-out cross-refers to a non-existent §10.4, so even the IP indemnity falls under the ₹36 lakh cap. Also notes that 9.2 excludes breach-notification costs (which Riverbend must incur under s.8(6)), and that the 10.2 customer indemnity is broad and uncapped.
- Flags the renewal (3-year terms, 120 days' notice, +9%), the 99.5% SLA with credits as the sole remedy, the Bengaluru venue, and the exit terms (30-day deletion, paid export), each with redlines tied to the playbook.
- Gets the law right. The Bengaluru clause is likely valid, because Calyx's registered office is there so those courts are competent under CPC s.20, and choosing one competent court does not offend s.28; the law therefore doesn't fix the venue, which must be negotiated to Mumbai. The Consumer Protection Act's "unfair contract" route is unlikely to be available because a hospital buying scheduling software for its business acts for a commercial purpose under s.2(7), so the memo calendars the non-renewal deadline and negotiates the clause rather than relying on the statute.
