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
