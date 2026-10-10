---
profession: designer
task: research-users
language: hi
deliverable: presentations
---

## Prompt

आप खर्चाबुक (KharchaBook) में UX researcher हैं। यह 50 से 500 कर्मचारियों वाली भारतीय कंपनियों के लिए एक काल्पनिक expense-management ऐप है। प्रोडक्ट लीड रिचर्ड रो ने पूछा है: "क्या अगली तिमाही का बड़ा दाँव बेहतर receipt capture होना चाहिए?" वे बोर्ड को पहले ही बता चुके हैं कि receipt capture सबसे बड़ी शिकायत है। नीचे दिए साक्ष्यों को product trio के लिए एक readout deck में संश्लेषित कीजिए।

**इंटरव्यू (8 प्रतिभागी, हर एक 45 मिनट)**

| ID | भूमिका | कंपनी का आकार | मुख्य कथन / अवलोकन |
|---|---|---|---|
| P1 | फ़ील्ड सेल्स रिप्रेज़ेंटेटिव | 320 | "बिल की फ़ोटो तो आराम से खिंच जाती है। फिर मेरी रिपोर्ट हफ़्ते भर मैनेजर के पास पड़ी रहती है और मेरा reimbursement अटक जाता है।" |
| P2 | फ़ाइनेंस मैनेजर (approver) | 140 | शुक्रवार को एक साथ सब approve करती हैं; कहती हैं कि मोबाइल approval स्क्रीन "policy flags छिपा देती है"। |
| P3 | कंसल्टेंट | 75 | मुड़ी-तुड़ी थर्मल पर्ची की फ़ोटो दो बार फ़ेल हुई; आख़िर में हाथ से टाइप किया। |
| P4 | इंजीनियरिंग मैनेजर (approver) | 410 | queue में 23 approvals pending; "मुझे कोई notification नहीं मिलता, लोग शिकायत करते हैं तब पता चलता है।" |
| P5 | ऑफ़िस एडमिन | 60 | दूसरों के खर्चों की category ठीक करने में महीने में लगभग 2 घंटे लगाती हैं। |
| P6 | सेल्स डायरेक्टर (approver) | 320 | "जब मैं टूर पर होता हूँ तो approvals किसी और को सौंपना नामुमकिन है।" |
| P7 | सपोर्ट इंजीनियर | 210 | Receipt capture ठीक है; लोकल कन्वेयंस के लिए माइलेज ट्रैकिंग चाहिए। |
| P8 | अकाउंट एग्ज़ीक्यूटिव | 140 | होटल के कई पेज वाले GST बिल में केवल पहला पेज capture होता है। यह भी कहते हैं कि approvals धीमे हैं। |

**इन-ऐप सर्वे (n = 212)**

पिछले महीने 20 या उससे अधिक खर्च submit करने वाले users को भेजा गया। प्रश्न: "आपकी सबसे बड़ी परेशानी क्या है?" (एक चुनें)

| उत्तर | हिस्सा |
|---|---|
| बिल की फ़ोटो फ़ेल होती है या गलत पढ़ी जाती है | 34% |
| approval का इंतज़ार | 27% |
| सही category चुनना | 22% |
| माइलेज | 9% |
| अन्य | 12% |

**प्रोडक्ट analytics, पिछले 90 दिन**

| मीट्रिक | मान |
|---|---|
| बिल की फ़ोटो जिनमें OCR को हाथ से सुधारना पड़ा | 6.2% |
| 5 दिन से अधिक approval का इंतज़ार कर रही expense reports | 41% |
| submission से approval तक का median समय | 4.8 दिन |
| approvers जिन्होंने मोबाइल approval स्क्रीन कम से कम एक बार खोली | 18% |
| मासिक सक्रिय submitters | 9,400 |
| मासिक सक्रिय approvers | 1,150 |

**डिलीवर करें:** markdown में एक readout deck, 8 से 10 स्लाइड, लगभग 1,200 शब्दों के भीतर। हर स्लाइड के लिए `### Slide n: शीर्षक`, फिर bullets, फिर एक पंक्ति का speaker note। इसमें शामिल हों:

- रिसर्च प्रश्न और पद्धति, ईमानदार सीमाओं के साथ।
- तीन से पाँच themes, हर एक विशिष्ट साक्ष्य (प्रतिभागी ID, सर्वे या analytics के आंकड़े) से समर्थित।
- अगली तिमाही के बड़े दाँव पर एक स्पष्ट सिफ़ारिश जो रिचर्ड के प्रश्न का सीधा उत्तर दे, भले ही उत्तर वह न हो जिसकी उन्हें उम्मीद है, और एक या दो छोटे follow-ups।
- बची हुई अनिश्चितता कम करने के लिए आप आगे क्या रिसर्च करेंगे।

## A strong answer

- Notices that the survey shares add up to 104% for a single-choice question and treats the figures as unreliable until they are checked.
- Flags the sampling bias: the survey went only to heavy submitters (20 or more expenses), and no approvers were in the sample, so it under-represents the approval side.
- Shows approval delays as the stronger, triangulated theme: 5 of 8 participants raise approval problems (P1, P2, P4, P6, P8), 41% of reports waiting more than 5 days, and only 18% mobile-approval adoption. Receipt capture is a real but narrower problem (6.2% need correction; crumpled thermal slips and multi-page hotel GST invoices).
- Recommends approval-flow work (notifications, delegation, policy flags on mobile) as the big bet and tells Richard directly that receipt capture is not the top problem. Receipt-capture edge cases are scoped as a smaller follow-up.
- Follows the slide format with a speaker note on every slide, cites evidence by ID, and states its limitations (n = 8, survey wording).
