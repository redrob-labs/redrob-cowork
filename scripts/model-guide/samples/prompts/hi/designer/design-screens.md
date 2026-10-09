---
profession: designer
task: design-screens
language: hi
deliverable: web
---

## Prompt

आप पेटसाथी (PetSathi) में प्रोडक्ट डिज़ाइनर हैं। यह काल्पनिक पशु चिकित्सा क्लिनिकों की एक चेन के लिए बुकिंग ऐप है। गुलमोहर मार्ग क्लिनिक के लिए मोबाइल अपॉइंटमेंट-बुकिंग फ़्लो डिज़ाइन कीजिए: पालतू जानवर का मालिक पहले सेवा चुनता है, फिर डॉक्टर, फिर टाइम स्लॉट, और फिर पुष्टि करता है। यह 375 px viewport चौड़ाई पर काम करना चाहिए। ऐप का इंटरफ़ेस हिंदी में है।

**ब्रांड टोकन (ब्रांड टीम से)**

```json
{
  "color.primary": "#7FD1AE",
  "color.primary.text": "#FFFFFF",
  "color.ink": "#1D2B33",
  "color.surface": "#FFFFFF",
  "color.muted": "#5E6B73",
  "radius.card": "12px",
  "font.family": "system-ui, sans-serif",
  "font.size.body": "16px"
}
```

ब्रांड टीम चाहती है कि primary बटन `color.primary` में हों और उन पर लेबल `color.primary.text` में। ऐप को WCAG 2.2 AA पूरा करना है।

**क्लिनिक डेटा**

क्लिनिक का समय: सोमवार से शनिवार, 09:00–17:00, लंच के लिए 13:00–14:00 बंद।

| सेवा | अवधि | कीमत | कौन कर सकता है |
|---|---|---|---|
| वेलनेस जाँच | 30 मिनट | ₹600 | कोई भी डॉक्टर |
| टीकाकरण विज़िट | 15 मिनट | ₹400 | कोई भी डॉक्टर |
| दाँतों की सफ़ाई | 90 मिनट | ₹3,500 से | केवल डॉ. मैरी मेजर |
| एक्ज़ॉटिक पेट जाँच | 45 मिनट | ₹900 | केवल डॉ. मैरी मेजर |

| डॉक्टर | कार्यदिवस |
|---|---|
| डॉ. मैरी मेजर | मंगल, गुरु, शनि |
| डॉ. रिचर्ड माइल्स | सोम–शनि |

गुरुवार के लिए API से लौटे उपलब्ध स्लॉट:

```json
[
  {"vet": "Richard Miles", "service": "Exotic pet check-up", "start": "10:00"},
  {"vet": "Mary Major", "service": "Exotic pet check-up", "start": "11:00"},
  {"vet": "Mary Major", "service": "Dental cleaning", "start": "12:00"},
  {"vet": "Richard Miles", "service": "Wellness exam", "start": "13:30"},
  {"vet": "Richard Miles", "service": "Wellness exam", "start": "15:00"},
  {"vet": "Mary Major", "service": "Wellness exam", "start": "16:45"}
]
```

**प्रोडक्ट आवश्यकताएँ (PM जॉन डो से)**

- पुष्टि से पहले कीमत दिखाएँ; काउंटर पर कोई सरप्राइज़ नहीं।
- लगभग 70% बुकिंग वेलनेस जाँच और टीकाकरण की होती हैं; इन्हें सबसे तेज़ बनाइए।
- "कोई भी उपलब्ध डॉक्टर" का विकल्प दें।
- पुष्टि में तारीख, समय, डॉक्टर, सेवा, कीमत और क्लिनिक का पता (12, गुलमोहर मार्ग, उदाहरणपुर) दिखे।

**डिलीवर करें** (गद्य लगभग 1,200 शब्दों के भीतर; कोड इससे लंबा हो सकता है):

1. एक code block में single-file HTML/CSS प्रोटोटाइप, थोड़ी-सी vanilla JS के साथ ताकि स्टेप्स क्लिक करके देखे जा सकें। ऊपर का स्लॉट डेटा इस्तेमाल करें। केवल वही स्लॉट दिखाएँ जो वास्तव में बुक हो सकते हैं, और साफ़ दिखाएँ कि बुकिंग सारांश कैसे अपडेट होता है।
2. डिज़ाइन rationale: आपने progressive sections वाली एक स्क्रीन रखी या अलग-अलग स्टेप्स, और क्यों; "से" वाली कीमत को कैसे संभाला; और ब्रांड टीम के निर्देशों से आप कहाँ हटे।
3. आपको मिली डेटा समस्याओं की सूची, और हर एक को UI या API को कैसे संभालना चाहिए।

## A strong answer

- Notices that white text on #7FD1AE fails AA contrast (about 1.8:1). Keeps the brand colour but uses dark ink text on it, or a darker shade, and explains the departure.
- Filters out invalid slots: Richard Miles cannot do exotic check-ups; the 13:30 slot falls in the lunch closure; the 12:00 dental cleaning (90 min) runs into lunch; the 16:45 wellness exam (30 min) runs past 17:00. The answer explains each one and suggests fixing them in the API.
- Shows the "₹3,500 से" dental price honestly (for example, "₹3,500 से, अंतिम कीमत जाँच के बाद") and gives a reason, which is in tension with the PM's no-surprises rule.
- The prototype runs as a single file at 375 px, sets `lang="hi"`, works with a keyboard (visible focus, labelled controls, tap targets of at least 24 px), makes the common services quick to reach, and offers "कोई भी उपलब्ध डॉक्टर".
- The rationale for one screen versus separate steps is tied to the 70% fast-path requirement.
