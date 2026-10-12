---
profession: sales
task: update-crm
language: hi
deliverable: spreadsheets
---

## Prompt

आप Kampan Sensors में sales rep हैं। Kampan पुणे की कंपनी है जो industrial IoT vibration और temperature sensors बेचती है। आज **शुक्रवार 13 मार्च 2026** है, और quarter (Q4 FY2025-26, जनवरी–मार्च) **31 मार्च** को खत्म होता है। आपके manager जॉन स्टाइल्स सोमवार की call से पहले आपका CRM साफ़ और इस quarter का forecast चाहते हैं। उनका सवाल है: "क्या मैं Devdaru Foods को इस quarter में won दिखा दूँ?"

**Stage probabilities (company standard):** Discovery 10%, Solution 25%, Proposal 50%, Negotiation 75%, Closed Won 100%, Closed Lost 0%। CRM का amount field **INR** में है। Finance की forecasting rate है 1 EUR = ₹96।

**CRM export (आपके updates से पहले)**

| Opp | Account | Stage | Amount (₹) | Close date | Next step |
|---|---|---|---|---|---|
| O-101 | Tapti Water Utility | Negotiation | 70,00,000 | 2026-03-27 | Legal redlines |
| O-102 | Kesri Textile Mills | Proposal | 38,70,000 | 2026-02-27 | Revised quote भेजना |
| O-103 | Haritha Chemicals | Solution | 1,00,00,000 | 2026-06-30 | Site survey |
| O-104 | Devdaru Foods | Negotiation | 32,00,000 | 2026-03-31 | PO का इंतज़ार |
| O-105 | Devdaru Foods | Proposal | 32,00,000 | 2026-04-15 | — |
| O-106 | Eastbrook Packaging GmbH (जर्मनी) | Proposal | 52,000 | 2026-03-31 | Pricing call |
| O-107 | Tatrekha Ports | Discovery | 1,75,00,000 | 2026-03-31 | Intro call |

**इस हफ़्ते की activity (notes, emails, calendar)**

- **सोम, जेन डो (Tapti procurement) के साथ call:** Legal redlines पर सहमति हो गई। Signature 24 मार्च को अपेक्षित है। Amount नहीं बदला। *Calendar:* "Tapti signing call, मंगल 24 मार्च।"
- **सोम, Kesri Textile Mills (रिचर्ड माइल्स) का email:** "हमने scope घटाकर दो lines कर दिया है। कृपया आपके proposal के 45 sensors की जगह 30 sensors के लिए re-quote कीजिए। हम 10 अप्रैल तक फ़ैसला करेंगे।" Original quote flat per-sensor कीमत पर था।
- **मंगल, Haritha Chemicals site survey पूरा:** "हमारा FY2026-27 का capex budget जुलाई की board meeting से पहले approve नहीं होगा। हम अगस्त में फिर बात करेंगे।"
- **बुध, आपका अपना note:** "Devdaru WON!!" *उसी दिन मैरी मेजर (Devdaru) का email:* "अच्छी ख़बर: हमने Kampan को चुना है। PO हमारे approval workflow में है और 3 अप्रैल तक issue हो जाना चाहिए। Issue होते ही हम आपके order form पर sign कर देंगे।"
- **बुध:** O-105 marketing automation ने तब बनाया जब Devdaru ने एक datasheet download की।
- **गुरु, Eastbrook pricing call:** भेजा गया quote **€52,000** का था। उन्होंने 3 साल का pricing option माँगा है और 26 मार्च की अपनी board meeting में फ़ैसला करेंगे।
- **गुरु, Tatrekha Ports intro call (रिचर्ड रो):** "हम अपने 2027 capital plan के लिए विकल्प देख रहे हैं। अभी कोई budget नहीं।" आपका note: "Amount मेरा अंदाज़ा है।"

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. Updated CRM table, उन्हीं columns के साथ, और Weighted (₹) तथा "Changed / why" columns जोड़कर। हर computed column का formula बताइए, और किसी भी amount या currency की दोबारा गणना दिखाइए।
2. इस quarter का forecast table: आपके updates से पहले और बाद, Commit / Best case / Pipeline categories के साथ। हर category की परिभाषा दीजिए।
3. CRM hygiene की जो समस्याएँ आपको मिलीं और आपने ठीक कीं, उनकी सूची।
4. जॉन स्टाइल्स को आपका जवाब (अधिकतम 120 शब्द)।

## A strong answer

- Keeps Devdaru Foods in Negotiation, not Closed Won, because the PO and the signature are still pending. Moves its close date to about 3 April, which takes it out of the quarter, and merges or deletes the duplicate O-105. The reply to Stiles says "not in this quarter as won" plainly.
- Re-prices Kesri Textile Mills to ₹25,80,000 (₹38,70,000 ÷ 45 = ₹86,000 per sensor × 30) and replaces the past close date with 10 April. Converts Eastbrook's €52,000 to ₹49,92,000 (the CRM's "52,000" was the euro figure entered as rupees) and keeps it in the quarter given the 26 March decision.
- Moves Haritha (to Q2 FY2026-27, Jul–Sep, or later) and Tatrekha (to a 2027-realistic date) out of the quarter, and flags Tatrekha's ₹1,75,00,000 as an unqualified placeholder.
- The weighted values use Amount × stage probability. The quarter's weighted forecast drops from ₹1,13,61,000 (as exported) to ₹77,46,000 (Tapti ₹52,50,000 + Eastbrook ₹24,96,000), with Tapti as Commit.
- The hygiene list covers the past-dated close, the duplicate, the currency mismatch, the guessed amount and the premature Closed Won.

## Card

brief: इस हफ़्ते की activity से sensor कंपनी का CRM साफ़ करें, इस quarter का forecast बनाएँ, और एक "won" deal पर manager के सवाल का जवाब दें।
given:
- Stage probabilities: 6 stages, INR amount field और EUR की forecasting rate
- CRM export: stage, amount, close date और next step के साथ 7 opportunities
- इस हफ़्ते की activity: 7 notes, emails और calendar entries
asked:
- Weighted (₹) और "Changed / why" के साथ updated CRM table, formulas और दोबारा गणना सहित
- Updates से पहले और बाद का quarter forecast, Commit, Best case और Pipeline के अनुसार, परिभाषाओं सहित
- मिली और ठीक की गई CRM hygiene समस्याएँ
- जॉन स्टाइल्स को जवाब (अधिकतम 120 शब्द)
limit: लगभग 1,200 शब्दों के भीतर, markdown में
hard: Activity को CRM से record दर record मिलाना है, और manager के उम्मीद भरे सवाल का सीधा जवाब देना है।

## Scorecard

- Devdaru stays Negotiation, close ≈ 3 April (out of quarter), O-105 merged; Stiles told "not this quarter"
- Kesri re-priced to ₹25,80,000 (38,70,000 ÷ 45 × 30) with close date 10 April
- Eastbrook €52,000 converted to ₹49,92,000 and kept in the quarter for the 26 March decision
- Haritha moved to Q2 FY2026-27 or later; Tatrekha to a 2027-realistic date, ₹1,75,00,000 flagged as placeholder
- Weighted = Amount × probability; quarter falls from ₹1,13,61,000 to ₹77,46,000, Tapti as Commit
- Hygiene list: past close date, duplicate, currency mismatch, guessed amount, premature Closed Won

## Scorecard, shown

- Devdaru Negotiation में ही, close ≈ 3 अप्रैल (quarter से बाहर), O-105 merge; स्टाइल्स को "इस quarter में नहीं"
- Kesri की नई कीमत ₹25,80,000 (38,70,000 ÷ 45 × 30), close date 10 अप्रैल
- Eastbrook के €52,000 को ₹49,92,000 में बदलकर 26 मार्च के फ़ैसले के लिए quarter में रखा
- Haritha को Q2 FY2026-27 या बाद में; Tatrekha को 2027 के यथार्थ date पर, ₹1,75,00,000 placeholder के रूप में flag
- Weighted = Amount × probability; quarter ₹1,13,61,000 से घटकर ₹77,46,000, Tapti Commit में
- Hygiene सूची: बीती close date, duplicate, currency mismatch, अंदाज़े वाला amount, समय से पहले Closed Won
