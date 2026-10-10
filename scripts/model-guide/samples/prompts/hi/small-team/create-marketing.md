---
profession: small-team
task: create-marketing
language: hi
deliverable: graphics
---

## Prompt

आप Khameer & Co. का marketing देखते हैं। यह पुणे के कोथरूड में पाँच लोगों की एक मोहल्ले की bakery है। Owner मैरी मेजर एक **weekend sourdough subscription** launch कर रही हैं और उन्हें एक Instagram post और counter तथा आसपास के cafés के लिए एक A5 flyer चाहिए। उनका brief, शब्दशः:

> "2 मई को launch! Subscribers को हर शनिवार एक loaf मिलेगा, महीने में 4, ₹900/महीना में। यानी 25% off! Pick up शनिवार सुबह 8–11 बजे दुकान से। भुगतान UPI AutoPay से। हमारी सारी bread 100% organic है, और gluten-free option भी है। Sign up करें khameer.example.com/subscribe पर। इसे warm और local feel दीजिए, corporate नहीं। पहले 50 sign-ups को मुफ़्त tote bag।"

**Bakery से तथ्य**

- Counter पर एक sourdough loaf ₹250 का है।
- Flour supplier का note: "हमारे flours certified organic (India Organic) हैं।" दो loaves में इस्तेमाल होने वाला seed mix certified organic *नहीं* है।
- "Gluten-free" loaf buckwheat (kuttu) और चावल के आटे का है, जो wheat bread वाली उसी kitchen और उन्हीं ovens में बनता है। कोई अलग gluten-free facility नहीं है और कोई testing नहीं होती।
- Site पर allergens: wheat, तिल (sesame), दूध, अंडे, tree nuts।
- Brand colours: copper `#B87333`, cream `#F5EBDD`, charcoal `#2B2B2B`। Fonts: headlines के लिए serif, body text के लिए साफ़ sans-serif (हिंदी के लिए Devanagari support के साथ)।

**हाल का Instagram performance (पिछले 60 दिन, followers ≈ 3,100)**

| Post type | उदाहरण | Reach | Likes | Saves | Link-in-bio clicks |
|---|---|---|---|---|---|
| Single photo | Counter पर loaf | 1,900 | 140 | 22 | 12 |
| Reel (15 s) | सुबह 5 बजे shaping का behind-the-scenes | 6,400 | 410 | 60 | 38 |
| Carousel (5 slides) | कीमतों के साथ weekly menu | 2,700 | 180 | 95 | 41 |

लक्ष्य subscription sign-ups है। मैरी यह भी चाहती हैं कि ज़्यादा से ज़्यादा स्थानीय लोग इसके बारे में सुनें।

**क्या देना है** (markdown में, SVG छोड़कर लगभग 1,200 शब्दों के भीतर):

1. Instagram plan: आप कौन-सा format चुनते हैं और क्यों (data का इस्तेमाल करके), slide या scene list, caption (अधिकतम 120 शब्द) और अधिकतम 8 hashtags।
2. A5 flyer:
   - पूरी copy
   - layout, zone के अनुसार
   - visual direction (photography, रंग, typography, accessibility)
   - code block में inline SVG mock-up (`viewBox="0 0 420 595"`, A5 अनुपात, कोई external asset नहीं)
3. मैरी के लिए छोटा note (अधिकतम 120 शब्द): उनके brief के किन शब्दों को आपने बदला और क्यों।

## A strong answer

- Fixes the savings claim: ₹900 versus 4 × ₹250 = ₹1,000 is a 10% saving (₹100 a month), not 25%. The copy uses the accurate figure or simply says "₹225 a loaf".
- Doesn't claim "100% organic" (the seed mix isn't certified) or "gluten-free" (it's baked in a shared kitchen with no testing, so it can't support an FSSAI-style gluten-free claim). Uses accurate wording such as "made with certified organic flour" and "made without wheat; baked in a kitchen that handles gluten; not suitable for people with coeliac disease", and includes the allergen note. The note to Mary explains these as consumer-protection (misleading claims) and allergy-safety issues.
- Chooses the format from the data and the two goals. The carousel has the best click-through (about 1.5% vs about 0.6% for the reel and the single photo) for sign-ups, and the reel has the best reach. The answer makes the trade-off explicit, for example a carousel as the main post with a reel to support it.
- Both pieces carry the essentials: the 2 May launch, Saturday 8–11am pickup, ₹900/month for 4 loaves (UPI AutoPay), the sign-up URL and the first-50 tote offer.
- The SVG is valid and self-contained at A5 proportions, uses the brand colours, and has a clear hierarchy with legible text sizes and sufficient contrast.

## Card

brief: Owner के brief से bakery के sourdough subscription launch के लिए Instagram post plan और A5 counter flyer बनाएँ।
given:
- Owner का brief: launch के ब्योरे और दावे, मैरी मेजर के शब्दों में
- Bakery से तथ्य: loaf की कीमत, सामग्री का स्रोत, "gluten-free" loaf कैसे बनता है, allergens
- Brand: 3 रंग और fonts
- Instagram performance: 3 post types की reach, likes, saves और clicks
asked:
- Instagram plan: format और कारण, slide या scene list, caption (अधिकतम 120 शब्द), अधिकतम 8 hashtags
- A5 flyer: copy, zone के अनुसार layout, visual direction और inline SVG mock-up
- मैरी के लिए note (अधिकतम 120 शब्द): कौन-से शब्द बदले और क्यों
limit: SVG छोड़कर लगभग 1,200 शब्द, markdown में
hard: Brief के दावों को bakery के तथ्यों से परखना है, और format का चुनाव उन दो लक्ष्यों के बीच संतुलन है जिन्हें data अलग दिशाओं में खींचता है।

## Scorecard

- Savings fixed: ₹900 vs ₹1,000 (4 × ₹250) is 10%, ₹100 a month, not 25% (or "₹225 a loaf")
- No "100% organic" (seed mix uncertified); uses wording like "made with certified organic flour"
- No "gluten-free" (shared kitchen, no testing); allergen note included; note to Mary explains both risks
- Format from data: carousel best click-through (≈ 1.5% vs ≈ 0.6%), reel best reach; trade-off explicit
- Both pieces carry 2 May, Saturday 8–11am pickup, ₹900/month for 4 loaves (UPI AutoPay), URL, first-50 tote
- SVG valid at A5 proportions, brand colours, clear hierarchy, legible text sizes, sufficient contrast

## Scorecard, shown

- बचत ठीक: ₹900 बनाम ₹1,000 (4 × ₹250) यानी 10%, ₹100 प्रति माह, 25% नहीं (या "₹225 प्रति loaf")
- "100% organic" नहीं (seed mix certified नहीं); "certified organic flour से बना" जैसे शब्द
- "Gluten-free" नहीं (साझा kitchen, कोई testing नहीं); allergen note शामिल; मैरी को note दोनों जोखिम समझाता है
- Data से format: carousel का click-through सबसे अच्छा (≈ 1.5% बनाम ≈ 0.6%), reel की reach सबसे ज़्यादा; trade-off साफ़
- दोनों में 2 मई, शनिवार सुबह 8–11 pickup, 4 loaves के ₹900/महीना (UPI AutoPay), URL, पहले 50 को tote
- A5 अनुपात में valid SVG, brand रंग, साफ़ hierarchy, पढ़ने योग्य text size, पर्याप्त contrast
