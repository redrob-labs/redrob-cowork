---
profession: small-team
task: send-invoices
language: hi
deliverable: documents
---

## Prompt

आप Kahaani Films में billing देखते हैं। यह मुंबई का तीन लोगों का video production studio है (hello@kahaanifilms.example.com), GST में registered (GSTIN placeholder चलेगा)। आज **10 मार्च 2026** है। आपको Saarthi Cycles की brand film का final invoice जारी करना है, जो आज deliver हुई, और overdue accounts संभालने हैं।

**Saarthi Cycles SOW (28 जनवरी 2026 को sign हुआ; client contact जेन डो, ap@saarthicycles.example.com)**

> Fixed fee: एक 90-second brand film के लिए ₹9,00,000। Signing पर 50% deposit; बाकी delivery पर।
> Change orders: ₹70,000 प्रति दिन के day rate पर bill होंगे। Change order **नामित client contact (जेन डो) द्वारा लिखित रूप में approve होना ज़रूरी है**।
> Expenses: travel, equipment rental और permits cost पर + 10% handling के साथ billable हैं। Meals billable नहीं हैं।
> सभी fees और billable expenses पर 18% GST लगेगा।
> Payment terms: net 15। Late fee: overdue balance पर 1.5% प्रति माह।

**Saarthi job file**

| Item | विवरण |
|---|---|
| INV-0141 | Deposit ₹4,50,000 + GST ₹81,000 = ₹5,31,000, 2 फ़रवरी को paid |
| CO-1 | अतिरिक्त shoot day (1 दिन)। जेन डो ने 20 फ़रवरी को email से approve किया |
| CO-2 | अतिरिक्त 30-second cut-down (0.5 दिन)। जॉन डो (Saarthi marketing intern) ने 3 मार्च को project के WhatsApp group में माँगा। जेन डो की कोई approval file में नहीं |
| Expenses | Drone rental ₹32,000; travel (cab/mileage) ₹9,000; crew meals ₹10,600; location permit ₹17,500 |

Kahaani का अगला invoice number INV-0152 है।

**Accounts receivable (आज से पहले; राशियाँ GST सहित)**

| Invoice | Client | राशि | Due | Contract में late-fee clause? | Notes |
|---|---|---|---|---|---|
| INV-0133 | Bhatti Coffee Roasters | ₹2,10,000 | 5 जनवरी | हाँ, 1.5%/माह | दो reminders भेजे (15 जनवरी, 5 फ़रवरी)। कोई जवाब नहीं |
| INV-0137 | Sahyadri Nagar Parishad | ₹3,37,500 | 15 फ़रवरी | नहीं | 6 साल पुराना client। पिछले साल का note: "Parishad का accounts विभाग PO number के बिना invoices reject कर देता है।" PO 77-3310 project email में है, लेकिन invoice पर नहीं |
| INV-0139 | Tern Studios | ₹1,15,000 | 28 फ़रवरी | हाँ | — |

**1 मार्च से bank में जमा**

| तारीख | Reference | राशि |
|---|---|---|
| 3 मार्च | NEFT TERN STUDIOS INV0193 | ₹1,15,000 |
| 6 मार्च | UPI SETTLEMENT | ₹57,000 (retail stock-footage बिक्री) |

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. Saarthi Cycles के लिए Invoice INV-0152, पूरे document के रूप में: header details, bill-to, invoice और due dates, line items (quantity, rate, amount), subtotal, GST, total, पहले से मिला deposit, payment instructions (placeholders चलेंगे) और terms। हर line की गणना कैसे हुई, दिखाइए।
2. जेन डो को छोटा email जो invoice भेजे और CO-2 को संभाले।
3. हर उस overdue invoice के लिए एक collection email जिसका वास्तव में पीछा करना चाहिए, हर एक अधिकतम 150 शब्द। लहजा client और contract के हिसाब से रखिए।
4. आज के कदमों के बाद updated AR table, हर invoice के status और अगली follow-up तारीख़ के साथ।

## A strong answer

- INV-0152 totals **₹6,89,533**: the ₹4,50,000 balance, CO-1 at ₹70,000, and billable expenses of ₹58,500 (₹32,000 + ₹9,000 + ₹17,500) plus 10% handling (₹64,350), giving a subtotal of ₹5,84,350 and 18% GST of ₹1,05,183. Meals (₹10,600) are excluded. It is due 25 March (net 15) and shows the ₹4,50,000 + GST deposit (INV-0141, ₹5,31,000) as already received.
- Doesn't bill CO-2, because there is no written approval from Jane Doe (a WhatsApp request from an intern doesn't count). The email asks Jane to approve it (₹35,000 + GST for 0.5 day) so it can be billed separately.
- Doesn't chase Tern Studios. Matches the 3 Mar ₹1,15,000 deposit to INV-0139 (the reference "INV0193" is likely a typo for "INV0139"), marks it paid or confirms it, and flags the reference mismatch.
- The Bhatti Coffee Roasters email is firm and cites the contractual late fee, about ₹6,300 (1.5% × 2 full months on ₹2,10,000, 64 days overdue), with a clear deadline and next step. The Sahyadri Nagar Parishad email is polite, adds no late fee (there's no clause), and re-issues the invoice with PO 77-3310.
- The invoice is complete and professional: unique number, dates, GST line, terms, payment details, and figures that add up.

## Card

brief: Deliver हुई brand film के लिए video studio का final invoice जारी करें, एक change order संभालें, और overdue accounts का उचित पीछा करें।
given:
- Saarthi Cycles SOW: fixed fee, deposit, change-order नियम, expense नियम, GST और payment terms
- Saarthi job file: deposit invoice, 2 change orders और 4 expenses
- Accounts receivable: due dates, late-fee clauses और notes के साथ 3 open invoices
- Bank में जमा: 1 मार्च से 2 deposits
asked:
- Saarthi Cycles के लिए पूरा Invoice INV-0152, हर line की गणना के साथ
- जेन डो को invoice भेजने और CO-2 संभालने वाला email
- जिस overdue invoice का पीछा करना है, उसके लिए collection email, हर एक अधिकतम 150 शब्द
- हर invoice के status और अगली follow-up तारीख़ के साथ updated AR table
limit: लगभग 1,200 शब्दों के भीतर, markdown में
hard: Contract की शर्तें तय करती हैं कि क्या billable है, पीछा करने से पहले भुगतान records मिलाने हैं, और लहजा हर client और contract के अनुसार होना चाहिए।

## Scorecard

- INV-0152 totals ₹6,89,533: ₹4,50,000 balance + CO-1 ₹70,000 + expenses ₹58,500 × 1.10 = ₹64,350, plus 18% GST ₹1,05,183
- Excludes the ₹10,600 meals; due 25 March (net 15); shows the INV-0141 deposit (₹5,31,000) as received
- CO-2 not billed (no Jane Doe approval); email asks her to approve ₹35,000 + GST for 0.5 day
- Doesn't chase Tern: matches 3 Mar ₹1,15,000 to INV-0139, flags the "INV0193" reference mismatch
- Bhatti firm with ≈ ₹6,300 late fee (1.5% × 2 months × ₹2,10,000); Parishad polite, no fee, PO 77-3310
- Invoice complete and professional: unique number, dates, GST line, terms, payment details, figures add up

## Scorecard, shown

- INV-0152 का total ₹6,89,533: ₹4,50,000 बाकी + CO-1 ₹70,000 + expenses ₹58,500 × 1.10 = ₹64,350, और 18% GST ₹1,05,183
- ₹10,600 के meals बाहर; due 25 मार्च (net 15); INV-0141 का deposit (₹5,31,000) मिला हुआ दिखाता है
- CO-2 bill नहीं (जेन डो की approval नहीं); email में 0.5 दिन के ₹35,000 + GST की approval माँगता है
- Tern का पीछा नहीं: 3 मार्च के ₹1,15,000 को INV-0139 से मिलाता है, "INV0193" reference का फ़र्क flag करता है
- Bhatti को सख़्त email, ≈ ₹6,300 late fee (1.5% × 2 माह × ₹2,10,000); Parishad को विनम्र, fee नहीं, PO 77-3310
- Invoice पूरा और professional: unique number, तारीखें, GST line, terms, payment details, आँकड़े सही जुड़ते हैं
