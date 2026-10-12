---
profession: designer
task: review-usability
language: hi
deliverable: web
---

## Prompt

आप मंचदीप टिकट्स (एक काल्पनिक इवेंट-टिकटिंग साइट) में डिज़ाइन लीड हैं। एक बड़े संगीत उत्सव की हाई-ट्रैफ़िक टिकट बिक्री से पहले टीम checkout के "आपका विवरण" स्टेप का usability और accessibility review चाहती है। इंजीनियर रिचर्ड माइल्स लिखते हैं: "हम WCAG AA पास करते हैं: Lighthouse accessibility स्कोर 100 है। मार्केटिंग यह भी चाहती है कि न्यूज़लेटर वाला बॉक्स पहले से टिक रहे, क्योंकि इससे sign-ups दोगुने हो जाते हैं।"

यह मौजूदा markup है, छोटा करके:

```html
<style>
  body { font: 14px/1.4 system-ui; color: #222; }
  input { border: 1px solid #ddd; padding: 6px; width: 100%; }
  input:focus { outline: none; }
  .hint { color: #a0a0a0; font-size: 12px; }
  .err { border-color: #e53935; }
  .timer { position: fixed; top: 0; right: 0; background: #fff3; }
  .pay { background: #ff7a00; color: #fff; padding: 6px 10px; font-size: 13px; }
  .tiny a { font-size: 11px; }
</style>

<div class="timer">टिकट होल्ड पर: <span id="t">2:00</span></div>
<h3>आपका विवरण</h3>
<form>
  <input type="text" name="name" placeholder="पूरा नाम">
  <input type="text" name="email" placeholder="ईमेल" class="err">
  <span class="hint">टिकट इसी पते पर भेजे जाते हैं</span>
  <input type="text" name="phone" placeholder="फ़ोन (वैकल्पिक)">
  <input type="text" name="card" placeholder="कार्ड नंबर" maxlength="16">
  <div style="display:flex;gap:4px">
    <input name="exp" placeholder="MM/YY"><input name="cvc" placeholder="CVV">
  </div>
  <img src="captcha.png">
  <input name="captcha" placeholder="ऊपर के अक्षर टाइप करें">
  <label><input type="checkbox" name="news" checked> मुझे समाचार और ऑफ़र भेजें</label>
  <div class="pay" onclick="submitOrder()">अभी भुगतान करें</div>
  <p class="tiny"><a href="/terms">नियम व शर्तें</a> · <a href="/refunds">रिफ़ंड</a></p>
</form>
<script>
  // टाइमर 0:00 पर पहुँचते ही होल्ड छूट जाता है और पेज इवेंट पेज पर redirect हो जाता है।
</script>
```

संदर्भ: checkout ट्रैफ़िक का 68% मोबाइल से आता है। सपोर्ट लॉग में शिकायतें हैं कि "कार्ड नंबर टाइप करते-करते टाइमर ख़त्म हो गया", और यह कि टिकट "कभी आए ही नहीं" क्योंकि ईमेल पता गलत टाइप हुआ था। पेज भारत और EU दोनों में इस्तेमाल होता है।

**डिलीवर करें** (गद्य लगभग 1,200 शब्दों के भीतर; कोड इससे लंबा हो सकता है):

1. प्राथमिकता क्रम में findings तालिका: समस्या, यह किसे प्रभावित करती है, गंभीरता (blocker/major/minor), जहाँ लागू हो वहाँ WCAG 2.2 success criterion, और समाधान।
2. Lighthouse वाले दावे पर रिचर्ड को एक छोटा जवाब, और पहले से टिक किए न्यूज़लेटर बॉक्स पर आपका निर्णय, तर्क सहित।
3. इस स्टेप का सुधारा हुआ single-file HTML/CSS/JS संस्करण एक code block में, वही fields और ब्रांड का नारंगी रंग रखते हुए, जो आपकी पाई गई समस्याओं को ठीक करे। जो भी business निर्णय आपको मानकर चलना पड़ा, उसे नोट करें।

## A strong answer

- Explains that automated tools catch only a share of WCAG issues and that a Lighthouse score of 100 does not show conformance. Points to failures the tool can miss, such as the 2-minute timer with no way to extend (2.2.1 Timing Adjustable) and the CAPTCHA image with no alt text or alternative (1.1.1).
- Finds the core form defects: placeholders used as labels (1.3.1/3.3.2/4.1.2), an error shown only by a red border (1.4.1/3.3.1), the hint not tied to its field, removed focus outlines (2.4.7), the hint text #a0a0a0 at about 2.6:1 (1.4.3), white on #ff7a00 failing contrast, and a clickable div instead of a button (2.1.1). Small Devanagari text (11–13 px) is flagged as hard to read.
- Covers mobile and error-prevention issues: input types and autocomplete (email, tel, cc-number, cc-exp, cc-csc; 1.3.5), a card maxlength of 16 that blocks 19-digit cards, small targets (2.5.8) and the timer overlay. Suggests ways to catch email typos.
- Declines the pre-ticked newsletter box, since pre-ticked consent is not valid under the GDPR in the EU or under India's DPDP Act, 2023 (consent needs a clear affirmative action), and is a dark pattern, and proposes an honest unticked opt-in.
- The corrected HTML runs, sets `lang="hi"`, keeps the fields, includes a timer warning and an extend option announced to assistive technology, and keeps the orange by using dark text or a darker shade for contrast.

## Card

brief: टिकटिंग checkout के "आपका विवरण" स्टेप की usability और accessibility review करें, Lighthouse दावे का जवाब दें, पहले से टिक बॉक्स पर निर्णय लें।
given:
- इंजीनियर का नोट: Lighthouse स्कोर का दावा और मार्केटिंग की पहले से टिक बॉक्स की माँग
- मौजूदा markup: "आपका विवरण" स्टेप का छोटा किया HTML और CSS, टाइमर वाली टिप्पणी के साथ
- संदर्भ: 68% मोबाइल ट्रैफ़िक, सपोर्ट की 2 तरह की शिकायतें, भारत और EU में उपयोग
asked:
- प्राथमिकता क्रम में findings तालिका: समस्या, किसे प्रभावित करती है, गंभीरता, WCAG 2.2 criterion और समाधान
- Lighthouse पर रिचर्ड को जवाब, और पहले से टिक न्यूज़लेटर बॉक्स पर निर्णय, तर्क सहित
- वही fields और ब्रांड का नारंगी रखते हुए सुधारा हुआ single-file HTML/CSS/JS संस्करण
limit: गद्य लगभग 1,200 शब्दों के भीतर, Markdown; कोड इससे लंबा हो सकता है
hard: एक automated स्कोर को manual review से तौलना है, छोटे markup में अलग-अलग गंभीरता की कई कमियाँ छिपी हैं, और एक business माँग कानूनी व नैतिक सीमाओं से टकराती है।

## Scorecard

- Explains Lighthouse 100 doesn't prove conformance; cites the unextendable 2-minute timer (2.2.1) and CAPTCHA (1.1.1)
- Flags placeholder-only labels, colour-only error, unlinked hint, removed focus outline, clickable div; small Devanagari text
- Flags contrast failures: #a0a0a0 hint at about 2.6:1 and white on #ff7a00
- Covers input types and autocomplete (1.3.5), maxlength 16 blocking 19-digit cards, small targets, timer overlay, email typos
- Declines the pre-ticked box as invalid consent under GDPR and the DPDP Act, 2023, and a dark pattern; unticked opt-in
- Corrected HTML runs, lang="hi", keeps fields, announced timer warning and extend option, keeps orange accessibly

## Scorecard, shown

- बताता है कि Lighthouse 100 conformance साबित नहीं करता; न बढ़ सकने वाले 2 मिनट के टाइमर (2.2.1) और CAPTCHA (1.1.1) का उदाहरण देता है
- केवल placeholder वाले labels, सिर्फ़ रंग से दिखती error, field से न जुड़ा hint, हटाई गई focus outline और क्लिक होने वाला div पकड़ता है; छोटा देवनागरी टेक्स्ट भी
- Contrast की विफलताएँ बताता है: #a0a0a0 वाला hint लगभग 2.6:1 पर, और #ff7a00 पर सफ़ेद
- Input types और autocomplete (1.3.5), 19 अंकों वाले कार्ड रोकने वाला maxlength 16, छोटे targets, टाइमर overlay और ईमेल की typos cover करता है
- पहले से टिक बॉक्स को GDPR और DPDP Act, 2023 के तहत अमान्य सहमति और dark pattern मानकर मना करता है; बिना टिक का opt-in देता है
- सुधारा HTML चलता है, lang="hi" है, fields वही हैं, टाइमर चेतावनी और बढ़ाने का विकल्प घोषित होते हैं, नारंगी accessible ढंग से बना रहता है
