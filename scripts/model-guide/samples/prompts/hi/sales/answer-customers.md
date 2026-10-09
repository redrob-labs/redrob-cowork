---
profession: sales
task: answer-customers
language: hi
deliverable: none
---

## Prompt

आप जॉन डो हैं, Brightquill में account manager। Brightquill healthcare clinics के लिए workforce-scheduling और time-clock (attendance) का SaaS product है। आज **20 फ़रवरी 2026** है। एक ग्राहक का यह email अभी आया है:

> **From:** मैरी मेजर, Operations Director, Devdar Clinics (mary.major@example.com)
> **Subject:** Seriously switch करने की सोच रहे हैं
>
> जॉन, चार बातें।
> 1. उन्हीं 120 seats के लिए हमारा फ़रवरी का invoice ₹96,000 से बढ़कर ₹1,10,400 (GST से पहले) हो गया, और किसी ने बताया तक नहीं।
> 2. 3 फ़रवरी के आपके outage ने हमारे सभी clinics को 9 घंटे ठप रखा। Staff clock in नहीं कर पाया। मुझे पूरे महीने का refund चाहिए।
> 3. क्या Brightquill HL7 support करता है, या हमारे HIS (Mediscribe) से integrate होता है? हमारे नए CMO पूछ रहे हैं।
> 4. मार्च से हमें 15 और seats चाहिए, हमारी original कीमत पर।
>
> मुझे इसी हफ़्ते जवाब चाहिए।

**Contract excerpt (start date 1 मार्च 2025, 36 महीने की अवधि; सभी fees GST से पहले, 18% GST अलग से)**

> §3.1 Fees: 120 seats, ₹800.00 प्रति seat प्रति माह, मासिक billing।
> §3.2 Price protection: अवधि के पहले 24 महीनों के लिए per-seat कीमत fixed है।
> §3.3 Price-protection अवधि में जोड़ी गई अतिरिक्त seats की billing §3.1 की per-seat कीमत पर होगी।

**Price change notice (सभी ग्राहकों को 5 जनवरी 2026 को भेजा गया)**

> 1 फ़रवरी 2026 से नए contracts और renewals के लिए list price ₹920 प्रति seat प्रति माह होगा।

**SLA excerpt**

> Monthly Uptime % = (महीने के कुल मिनट − Downtime मिनट) ÷ महीने के कुल मिनट। Downtime का अर्थ है core service उपलब्ध न होना। Degraded performance इसमें शामिल नहीं है।
> Service credits, उस महीने की fee के प्रतिशत के रूप में: 99.9% से कम → 10%; 99.0% से कम → 25%; 95.0% से कम → 50%।
> Credits incident के 30 दिनों के भीतर माँगने होंगे। Downtime के लिए credits ही एकमात्र उपाय हैं।

**Status page, incident 3 फ़रवरी 2026 (Devdar Clinics, Mumbai region में hosted है; समय IST में)**

> 09:05–12:45: Mumbai region में core service उपलब्ध नहीं।
> 12:45–14:30: degraded। Backlog process होने तक mobile clock-in sync में देरी रही। सभी punches सुरक्षित रहे।

**Product docs**

> Brightquill staff, shift और location data के लिए FHIR R4 API देता है। कोई HL7 v2 interface नहीं है। कोई native HIS/EHR integration नहीं है। Partners API पर integration बना सकते हैं।

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. मैरी मेजर को reply email (अधिकतम 400 शब्द) जो चारों बातों का जवाब ठोस आँकड़ों के साथ दे, और ईमानदारी से बताए कि Brightquill क्या कर सकता है और क्या नहीं।
2. Billing और Support के लिए internal note, bullets में: कौन-से corrections या credits जारी करने हैं और कितनी राशि के, हर एक के पीछे की गणना के साथ।
3. Contract के सख़्त शब्दों से आगे जाकर आपने जो भी judgement call लिया, उसका छोटा explanation (अधिकतम 150 शब्द), और क्यों।

## A strong answer

- Recognises that §3.2 price protection runs until 28 Feb 2027. The ₹1,10,400 February invoice (120 × ₹920) is therefore a billing error, and the answer commits to correcting it by ₹14,400 (plus the GST on it) back to ₹96,000 before GST.
- Calculates the SLA credit from the status page: 220 minutes of downtime (09:05–12:45) in February's 40,320 minutes gives about 99.45% uptime, which earns a 10% credit (about ₹9,600 on the correct ₹96,000 fee). The request is within 30 days. The answer explains the gap with the "9 hours" claim (the 105-minute degraded period isn't downtime under the SLA), invites Mary to share her records, and doesn't promise a full-month refund. Any goodwill gesture is labelled and justified.
- Answers the integration question honestly: there is a FHIR R4 API, but no HL7 v2 interface and no native Mediscribe integration. A sensible next step is offered, such as a technical call.
- Confirms the 15 extra seats at ₹800 under §3.3: 135 seats and ₹1,08,000 a month (before GST) from March.
- The tone is accountable and empathetic without grovelling or blame, and the internal note lists each action with an amount.
