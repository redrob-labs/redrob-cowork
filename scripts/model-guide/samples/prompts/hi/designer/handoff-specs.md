---
profession: designer
task: handoff-specs
language: hi
deliverable: web
---

## Prompt

आप फ़ॉर्मसेतु (FormSetu) में प्रोडक्ट डिज़ाइनर हैं। यह एक काल्पनिक ऑनलाइन फ़ॉर्म-बिल्डर है। प्राइसिंग पेज का redesign मंज़ूर हो चुका है और अगले sprint में फ़्रंट-एंड टीम (लीड: जॉन स्टाइल्स) के पास जाएगा। प्राइसिंग सेक्शन का developer handoff तैयार कीजिए: मासिक/वार्षिक बिलिंग टॉगल और तीन प्लान कार्ड। पेज की भाषा हिंदी है।

**डिज़ाइन फ़ाइल से export किए गए inspect नोट्स**

```text
Toggle: segmented control, 2 options [मासिक | वार्षिक], height 40, radius 20,
  selected bg #2F6FEB, selected text #FFFFFF, unselected text #4B5563
  Annual option has badge "20% बचाएँ" (bg #E8F7EE, text #1F7A45, 12px)
Card: width 320, padding 24, gap between cards 14, radius 12, border 1px #E5E7EB
  Recommended card (Pro): border 2px primary-600, label "सबसे लोकप्रिय"
Price: 40px/48px semibold; suffix "/माह" 16px #6B7280
CTA button: height 44, full width, radius 8, bg primary-600, text white
Feature list: 14px/20px, check icon 16px, row gap 10
Breakpoints: 3 columns ≥ 1040px; stacked below, Pro card first
```

**डिज़ाइन टोकन (codebase)**

```css
--primary-600: #2F6FED;
--primary-700: #2459C4;
--gray-500: #6B7280;
--gray-600: #4B5563;
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 20px; --space-6: 24px; --space-8: 32px;
--radius-md: 8px; --radius-lg: 12px; --radius-full: 9999px;
```

**प्लान कॉपी और कीमतें (प्राइसिंग डॉक से; सभी कीमतें GST रहित)**

| प्लान | मासिक | वार्षिक (दिखाई जाने वाली) | वार्षिक बिल | सुविधाएँ |
|---|---|---|---|---|
| Starter | ₹0 | ₹0 | ₹0 | 3 फ़ॉर्म, 100 responses/माह |
| Pro | ₹999/माह | ₹789/माह | ₹9,990/वर्ष | असीमित फ़ॉर्म, 5,000 responses/माह, logic, फ़ाइल अपलोड |
| Business | ₹2,499/माह | ₹1,999/माह | ₹23,988/वर्ष | Pro की सारी सुविधाएँ, SSO, audit log, 50,000 responses/माह |

PM की आवश्यकताएँ: वार्षिक टॉगल डिफ़ॉल्ट रूप से चुना हो; टॉगल बदलने पर layout shift न हो; वार्षिक कीमत के नीचे "₹X सालाना बिल किया जाएगा (+ GST)" दिखे; Starter का CTA "मुफ़्त शुरू करें" और बाकी दोनों का "14 दिन का ट्रायल शुरू करें" हो।

**डिलीवर करें** (गद्य लगभग 1,200 शब्दों के भीतर; कोड इससे लंबा हो सकता है):

1. एक code block में single-file HTML/CSS/vanilla-JS reference implementation। केवल codebase के टोकन इस्तेमाल करें, और इसमें टॉगल, तीनों कार्ड, states (hover, focus-visible, selected, loading के दौरान disabled CTA) और responsive व्यवहार शामिल हों।
2. Developers के लिए spec तालिका: element, property, value (टोकन का नाम) और नोट। Inspect नोट्स की हर raw value किसी टोकन से map हो, और जो value आपने बदली उसे अलग से बताएँ।
3. Accessibility नोट्स: टॉगल की semantics और keyboard व्यवहार, कीमत बदलने पर screen reader क्या बोलता है, और contrast।
4. PM और डिज़ाइनर के लिए खुले प्रश्नों या असंगतियों की सूची, हर एक के साथ आपका सुझाया समाधान।

## A strong answer

- Catches the Pro pricing inconsistency: ₹789 × 12 = ₹9,468, not ₹9,990, and "20% बचाएँ" does not hold for Pro (₹789 vs ₹999 is 21%; ₹9,990 vs ₹11,988 is about 17%). Business is consistent (₹1,999 × 12 = ₹23,988; 20%). The answer proposes a resolution, such as fixing the billed amount or changing the badge to "20% तक बचाएँ".
- Normalizes off-system values: #2F6FEB becomes --primary-600 (#2F6FED), the 14px card gap becomes --space-4 (or --space-3) and the 10px row gap goes to the nearest token, with the reason stated.
- Implements the toggle as an accessible control (radio group, or buttons with aria-pressed), with arrow or Tab keyboard support, a visible focus style and a polite live region or other sensible announcement of price changes. Annual is the default.
- Avoids layout shift when toggling (reserved space or fixed-width price area, the "सालाना बिल" line always present), and in the stacked layout the Pro card comes first.
- The code runs as a single file, uses CSS custom properties from the token list, and the spec table is complete enough to build from without the design file.
