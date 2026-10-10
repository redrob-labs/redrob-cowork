---
profession: small-team
task: answer-customers
language: hi
deliverable: none
---

## Prompt

आप Mitti & Chaak चलाने में मदद करते हैं। यह जयपुर का चार लोगों का pottery studio है, जो handmade ceramics online बेचता है और classes भी लेता है। आज **मंगलवार 14 अप्रैल 2026** है। Owner जेन डो चाहती हैं कि आप shared inbox साफ़ करें: सब कुछ triage करें, जवाबों के draft बनाएँ, और बताएँ कि किन बातों पर उन्हें फ़ैसला लेना है।

**Policies**

- ग्राहक द्वारा class cancel करने पर: class से 7 या अधिक दिन पहले पूरा refund; 2–6 दिन पहले 50% refund; 48 घंटे के भीतर कोई refund नहीं। अगर **studio** class cancel करे: पूरा refund (UPI पर) या मुफ़्त reschedule, ग्राहक की पसंद।
- Shipping में टूट-फूट: **delivery के 7 दिनों के भीतर** photo के साथ बताएँ, तो मुफ़्त replacement या refund। कोई भी channel मान्य है।
- Wholesale: न्यूनतम 48 units, retail से 40% कम। Custom logo पर प्रति unit ₹50 अतिरिक्त। Lead time 6 सप्ताह। Wholesale के लिए kiln capacity 40 mugs प्रति सप्ताह।
- Retail mug की कीमत: ₹850।

**Class calendar**

| Class | तारीख और समय | Booked / capacity |
|---|---|---|
| Wheel-throwing intro | शनि 18 अप्रैल, 10:00 | 8 / 8 |
| Wheel-throwing intro | गुरु 23 अप्रैल, 18:30 | 5 / 8 |
| Glaze workshop | शनि 4 अप्रैल, 14:00 | **Studio ने 2 अप्रैल को cancel किया (kiln repair)** |
| Glaze workshop | शनि 25 अप्रैल, 14:00 | 6 / 10 |

**Booking और order system notes**

- Online shop Shopfront platform पर चलता है। असली account emails no-reply@shopfront.example.com से आते हैं।
- रिचर्ड रो: 4 अप्रैल का glaze workshop book किया था (₹1,800)। Cancellation email: **bounce** हुआ (file में address richard.reo@example.com है)।
- Order #1042 (जॉन स्टाइल्स): एक mug, बुध 25 मार्च को deliver हुआ।
- WhatsApp Business message, शुक्र 27 मार्च, जॉन स्टाइल्स के number से: "Order 1042 का मेरा mug crack के साथ आया 😞 [photo]।" Status: unread।

**Inbox**

1. **जेन डो** (ग्राहक, owner से कोई संबंध नहीं): "मैंने शनि 18 अप्रैल की wheel intro के लिए 2 spots book किए हैं। क्या मैं अपनी बहन को भी जोड़ सकती हूँ? और क्या कोई शाम का option है? शनिवार बहुत भागदौड़ वाले होते हैं।"
2. **रिचर्ड रो:** "मुझे 4 अप्रैल के glaze workshop का refund चाहिए। आख़िर में मैं आ नहीं पाया। पता है देर हो गई, माफ़ कीजिए।"
3. **मैरी मेजर** (café owner): "क्या आप हमारे café के logo वाले 60 mugs ₹430 प्रति mug में बना सकते हैं? हम 1 मई को खुल रहे हैं, तो उससे पहले चाहिए।"
4. **"Store Support" <security@shopfront-billing-alerts.example.net>:** "आपका store 24 घंटे में suspend हो जाएगा। अपनी KYC और payment details यहाँ verify करें: [link]।"
5. **जॉन स्टाइल्स:** "फिर से follow up कर रहा हूँ। Order #1042 का mug टूटा हुआ आया था। किसी ने अब तक जवाब नहीं दिया। काफ़ी निराश हूँ।"

**क्या देना है** (markdown में, लगभग 1,200 शब्दों के भीतर):

1. Triage table: message, category, priority, action, और क्या जेन को कुछ तय करना है।
2. हर उस message के लिए भेजने-लायक जवाब जिसे जवाब मिलना चाहिए, हर एक अधिकतम 150 शब्द, एक आत्मीय, छोटे business वाले लहजे में।
3. Internal notes: system fixes और जो कुछ जेन को approve करना है, आँकड़ों के साथ।

## A strong answer

- Doesn't add a third person to the full Sat 18 Apr class. Offers to move all three to the Thu 23 Apr 18:30 class, which has exactly 3 seats left and answers the evening question.
- Gives Richard Roe a full ₹1,800 refund, or a free reschedule, because the studio cancelled the class. The answer realises he may never have been told (the email bounced to a misspelt address), apologises, and fixes the address.
- For the wholesale request, calculates ₹560 per mug (₹850 × 60% + ₹50), or ₹33,600 for 60, and doesn't accept ₹430 without flagging it to Jane. It flags that 1 May is impossible (6-week lead time; 60 mugs take 1.5 weeks of the 40-a-week capacity) and offers alternatives, such as a later date or a partial or stock order.
- Identifies message 4 as phishing (a lookalike domain, urgency and a KYC lure). No reply, no clicking, and a note to report it and check the real store admin directly.
- Honours John Stiles' replacement or refund, because he reported the damage with a photo via WhatsApp on 27 Mar, within 7 days of delivery. The reply apologises for the missed message.

## Card

brief: Pottery studio के shared inbox के पाँच messages triage करें, policies के अनुसार जवाब draft करें, और owner के फ़ैसले वाली बातें बताएँ।
given:
- Policies: class cancellation, shipping में टूट-फूट, wholesale शर्तें और retail mug की कीमत
- Class calendar: तारीख़ और bookings के साथ 4 classes
- Booking और order notes: platform का असली sender address, bounce हुआ email, एक order और unread WhatsApp message
- Inbox: 5 messages
asked:
- Triage table: category, priority, action और क्या जेन को फ़ैसला करना है
- जिन messages को जवाब चाहिए, उनके भेजने-लायक जवाब, हर एक अधिकतम 150 शब्द
- Internal notes: system fixes और ज़रूरी approvals, आँकड़ों के साथ
limit: लगभग 1,200 शब्दों के भीतर, markdown में
hard: Messages को अलग-अलग channels के policies और records से मिलाना है, एक message वैसा नहीं जैसा दावा करता है, और कुछ माँगें जैसी माँगी गईं वैसी पूरी नहीं हो सकतीं।

## Scorecard

- Doesn't overbook Sat 18 Apr; offers all three the Thu 23 Apr 18:30 class (3 seats left)
- Richard Roe gets a full ₹1,800 refund or free reschedule (studio cancelled); bounced email noted, address fixed
- Wholesale at ₹560 a mug (₹33,600 for 60); ₹430 flagged to Jane, not accepted
- Says 1 May is impossible (6-week lead time; 1.5 weeks of capacity); offers alternatives
- Message 4 is phishing (lookalike domain, urgency, KYC lure): no reply, no click, report it, check real admin
- Honours John Stiles' replacement or refund (WhatsApp photo 27 Mar, within 7 days); apologises for missed message

## Scorecard, shown

- शनि 18 अप्रैल को overbook नहीं करता; तीनों को गुरु 23 अप्रैल 18:30 की class (3 seats बाकी) offer
- रिचर्ड रो को पूरा ₹1,800 refund या मुफ़्त reschedule (studio ने cancel किया); bounce हुआ email पकड़ा, address ठीक
- Wholesale ₹560 प्रति mug (60 के ₹33,600); ₹430 जेन के सामने रखता है, स्वीकार नहीं करता
- बताता है कि 1 मई असंभव है (6 सप्ताह lead time; 1.5 सप्ताह की capacity); विकल्प देता है
- Message 4 phishing है (मिलता-जुलता domain, जल्दबाज़ी, KYC का लालच): जवाब नहीं, click नहीं, report करें, असली admin जाँचें
- जॉन स्टाइल्स को replacement या refund (27 मार्च का WhatsApp photo, 7 दिन के भीतर); छूटे message के लिए माफ़ी
