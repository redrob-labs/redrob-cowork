---
profession: small-team
task: prepare-quotes
language: hi
deliverable: documents
---

## Prompt

आप Neelkanth IT में काम करते हैं। यह हैदराबाद की पाँच लोगों की managed IT services कंपनी है। एक नए client, Jamun Lane Dental Care, के लिए quote तैयार कीजिए।

**Client का email (मैरी मेजर, office manager)**

> "हम अपने 10 PCs बदलना चाहते हैं, ठीक-ठाक Wi-Fi लगवाना चाहते हैं, ऐसे backups set up करना चाहते हैं जो DPDP Act के हिसाब से compliant हों, और चाहते हैं कि आप हर महीने हमारी देखरेख करें। Project का हमारा budget लगभग ₹8 लाख + GST है। क्या इसी हफ़्ते quote भेज सकते हैं?"

**Site survey notes (जॉन स्टाइल्स, Neelkanth)**

- 11 staff users। **12 PCs इस्तेमाल में हैं**: 10 staff workstations और 2 operatory imaging PCs जो RVG X-ray sensors से जुड़े हैं। Imaging PCs पर SensorView v6 चलता है, जिसे imaging vendor केवल ख़ास hardware पर certify करता है। इन्हें बदलने के लिए vendor का sign-off चाहिए।
- Network: ISP router, 8-port unmanaged switch, consumer Wi-Fi, कोई business firewall नहीं। Coverage के लिए 3 access points चाहिए।
- Backups: front desk द्वारा बदली जाने वाली एक USB drive। **आख़िरी सफल backup 4 महीने पहले हुआ था।** Practice-management database में patient records हैं।
- मौजूदा monitors ठीक हैं और दोबारा इस्तेमाल होंगे।

**Neelkanth price list (cost → list sell, सभी GST से पहले)**

| Item | Unit cost | List sell |
|---|---|---|
| Business PC (i5, 16 GB, 512 GB SSD) | ₹48,000 | ₹59,900 |
| Wi-Fi access point | ₹15,000 | ₹18,750 |
| Firewall appliance | ₹36,000 | ₹45,000 |
| Firewall security subscription (वार्षिक) | ₹24,000/वर्ष | ₹30,000/वर्ष |
| 24-port managed PoE switch | ₹42,000 | ₹52,500 |
| Backup appliance | ₹66,000 | ₹82,500 |
| Encrypted cloud backup (India region; vendor Data Processing Agreement sign करता है) | ₹6,000/माह | ₹9,000/माह |

**Labour और services**

- ₹1,500/घंटा। PC deployment और data migration: प्रति PC 2.5 घंटे। Network install: 10 घंटे। Backup setup और test restore: 6 घंटे। Project management: labour का 10%।
- Managed support: ₹1,500 प्रति user प्रति माह।

**Neelkanth quoting policy**

- Hardware पर न्यूनतम **25% gross margin**, जहाँ margin = (sell − cost) ÷ sell।
- सभी कीमतें GST से पहले; quote में 18% GST अलग line में दिखाएँ।
- Quotes 30 दिन तक valid हैं। Acceptance पर hardware का 50% deposit देय है, बाकी completion पर।
- Neelkanth healthcare clients के साथ Data Processing Agreement (DPA) sign करेगा। किसी solution को कभी "DPDP certified" या "DPDP compliant" न कहें। कहें कि यह client की Digital Personal Data Protection Act, 2023 के तहत ज़िम्मेदारियों को support करता है।

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. Quote document: summary, scope, one-off costs के लिए line-item table (quantity, unit price, amount), recurring costs (मासिक और वार्षिक) के लिए अलग table, totals (GST सहित), assumptions और exclusions, और terms।
2. अगर scope budget में नहीं आता, तो options या phases दीजिए। एक की recommendation कीजिए, reasoning के साथ।
3. मैरी मेजर को cover email (अधिकतम 150 शब्द)।
4. Owner के लिए internal note (अधिकतम 100 शब्द), pricing या scope की किसी भी समस्या पर जो आपको मिली।

## A strong answer

- Catches that the list prices are a roughly 25% *markup*, not a 25% *margin*. The PC margin is (59,900 − 48,000) ÷ 59,900 ≈ 19.9%, and every other hardware line is at 20%, all below 25%. The answer re-prices to policy (cost ÷ 0.75: PC ₹64,000, AP ₹20,000, firewall ₹48,000, switch ₹56,000, backup appliance ₹88,000) or flags the issue with numbers for the owner.
- Scopes 10 staff PCs and handles the 2 imaging PCs as excluded or optional pending the vendor's sign-off, explaining the 10 versus 12 count.
- The totals are correct for the prices used. Labour is 41 h × ₹1,500 = ₹61,500 plus 10% PM = ₹67,650. With policy pricing, hardware is ₹8,92,000 and the one-off total is ₹9,59,650 before GST (₹1,72,737 GST, ₹11,32,387 including GST). Recurring costs are shown separately: support at 11 × ₹1,500 = ₹16,500/month, cloud backup at ₹9,000/month and the firewall subscription at ₹30,000/year (plus GST).
- Addresses the ₹8 lakh + GST budget with options or phases, and prioritises the backup appliance, cloud backup and firewall in phase 1, given the 4-month-old last backup and the patient data.
- Uses compliant language (a DPA is offered, and the solution supports the clinic's DPDP Act obligations rather than being "DPDP compliant") and includes the 30-day validity and the 50% hardware deposit terms.
