---
profession: engineer
task: build-features
language: hi
deliverable: none
---

## Prompt

आप टोकरी (Tokri) की checkout service पर काम करते हैं। यह एक काल्पनिक ग्रॉसरी-डिलीवरी ऐप है (TypeScript, Node 20, Vitest)। कार्ट pricing module में promo codes लागू कीजिए। मौजूदा module यह है:

```ts
// pricing.ts
export type Category = 'grocery' | 'household' | 'infant_formula';

export interface LineItem {
  sku: string;
  name: string;
  unitPrice: number; // रुपये में, MRP, जैसे 189.00
  qty: number;
  category: Category;
}

export interface Cart {
  items: LineItem[];
  memberTier: 'none' | 'plus';
}

export function priceCart(cart: Cart) {
  const subtotal = cart.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const memberDiscount = cart.memberTier === 'plus' ? subtotal * 0.05 : 0;
  const taxable = subtotal - memberDiscount;
  const tax = taxable * 0.18; // GST
  return { subtotal, memberDiscount, tax, total: taxable + tax };
}
```

**Spec (PM जेन डो से, finance और legal के नोट्स के साथ)**

1. एक कार्ट पर अधिकतम एक promo code लग सकता है। Codes case-insensitive हैं।
2. Promo codes:

   | Code | प्रकार | मान | न्यूनतम eligible subtotal | कब तक मान्य (सम्मिलित, स्टोर की स्थानीय तारीख, IST) |
   |---|---|---|---|---|
   | FRESH10 | percent | 10% | ₹1,000.00 | 2025-12-31 |
   | SAVE100 | fixed | ₹100.00 | ₹750.00 | 2025-06-30 |
   | HOME15 | percent | 15%, केवल household आइटम | ₹0.00 | 2025-12-31 |

3. Infant formula पर कभी छूट नहीं दी जाती, न promo से न membership से (legal: Infant Milk Substitutes Act, 1992 के तहत छूट या प्रोत्साहन वर्जित है)। न्यूनतम eligible subtotal में केवल non-formula आइटम गिने जाते हैं।
4. Plus member छूट (5%) पहले लगती है; promo eligible आइटमों की बची हुई राशि पर लगता है।
5. Fixed छूट कभी eligible राशि से अधिक नहीं हो सकती और उसे eligible lines में उनके मूल्य के अनुपात में बाँटना होगा, ताकि GST हर line पर निकाला जा सके।
6. GST (finance): सभी कीमतें GST सहित MRP हैं; ग्राहक छूट के बाद की line राशि ही चुकाता है, ऊपर से कुछ नहीं जुड़ता। Invoice के लिए हर line का GST अलग दिखाना है: `GST = line राशि × दर ÷ (100 + दर)`। Finance की HSN mapping के अनुसार दरें: grocery (ताज़े, बिना ब्रांड वाले आइटम) 0%; household और infant_formula 18%।
7. सारा पैसा integer पैसे (paise) में संभाला जाए। हर line की छूट और GST को पैसे तक half-up round करें; allocation के remainder सबसे बड़ी line को जाएँ।
8. Invalid code से checkout नहीं टूटना चाहिए। promo के बिना कीमत लौटाएँ और एक machine-readable कारण दें (`unknown`, `expired`, `below_minimum`, `no_eligible_items`)।

**डिलीवर करें** (गद्य लगभग 1,200 शब्दों के भीतर; कोड इससे लंबा हो सकता है):

1. नया `pricing.ts`: typed, pure functions के साथ, और code तालिका data के रूप में। `priceCart(cart, promoCode?, today?)` entry point रखें और पैसे में per-line breakdown और totals लौटाएँ।
2. एक Vitest test फ़ाइल जो ऊपर के नियमों को cover करे, जिसमें rounding और allocation के edge cases शामिल हों।
3. एक Plus member के लिए 2025-07-02 को code `fresh10` के साथ इस कार्ट की pricing का परिणाम, एक छोटी तालिका में:

   | आइटम | Unit (₹) | मात्रा | Category |
   |---|---|---|---|
   | सेब (1 kg) | 189.00 | 2 | grocery |
   | केले (1 दर्जन) | 46.50 | 1 | grocery |
   | अंडे (30 का ट्रे) | 214.00 | 1 | grocery |
   | डिशवॉश लिक्विड | 112.50 | 2 | household |
   | इन्फ़ैंट फ़ॉर्मूला (400 g) | 449.00 | 1 | infant_formula |

4. मौजूदा module के bugs की एक छोटी सूची, और spec की जो भी अस्पष्टता आपने सुलझाई, आपके चुने विकल्प के साथ।

## A strong answer

- Lists the current bugs: floating-point rupees, the member discount applied to infant formula, GST added on top of prices that already include it, GST applied to groceries, and tax on the whole cart rather than per line.
- Correctly rejects FRESH10 for the sample cart with `below_minimum`. The cart totals ₹1,312.50, but the eligible non-formula subtotal is ₹863.50, which is under ₹1,000 even before the member discount. The answer also notes whether the minimum is checked before or after the member discount, as a stated choice.
- Prices the sample cart with only the Plus discount (₹43.18, including the half-paisa case on the bananas, ₹2.325 → ₹2.33) applied to the ₹863.50 of non-formula items, for a payable total of ₹1,269.32. GST is extracted only from the dish soap (₹32.61 on ₹213.75) and the formula (₹68.49 on ₹449.00), ₹101.10 in all, and line results sum exactly to the totals in paise.
- Implements fixed-discount proportional allocation with remainder handling, caps the discount at the eligible amount, and makes the date check inclusive.
- The tests are meaningful, cover each reason code, case-insensitivity, the infant-formula exclusion, HOME15 scoped to household items, and rounding at half-paisa boundaries, and would pass against the code as written.

## Card

brief: एक ग्रॉसरी ऐप के TypeScript कार्ट pricing module में promo codes जोड़ें, legal और GST नियमों वाले spec के अनुसार, tests के साथ।
given:
- मौजूदा module: types और priceCart function वाला pricing.ts
- Spec: PM, finance और legal के 8 नियम, 3 codes की promo तालिका सहित
- नमूना कार्ट: grocery, household और infant formula के 5 आइटम, एक Plus member के लिए
asked:
- नया typed pricing.ts, code तालिका data के रूप में और पैसे में per-line breakdown के साथ
- नियमों को cover करती Vitest test फ़ाइल, rounding और allocation के edge cases सहित
- 2025-07-02 को fresh10 के साथ Plus member के नमूना कार्ट की pricing
- मौजूदा module के bugs और सुलझाई गई spec अस्पष्टताएँ
limit: गद्य लगभग 1,200 शब्दों के भीतर, Markdown; कोड इससे लंबा हो सकता है
hard: मौजूदा कोड में खामियाँ हैं, नियम एक-दूसरे पर असर डालते हैं (eligibility, छूट का क्रम, per-line GST), पैसे की rounding का जोड़ सटीक होना है, और spec कुछ अस्पष्टताएँ छोड़ता है।

## Scorecard

- Lists the bugs: float rupees, member discount on formula, GST added to inclusive MRP, GST on groceries, whole-cart tax
- Rejects FRESH10 with below_minimum: eligible ₹863.50 (cart ₹1,312.50) is under ₹1,000; states the minimum's check order
- Applies only the Plus discount, ₹43.18 on ₹863.50 (bananas ₹2.325 → ₹2.33); payable ₹1,269.32
- GST only from dish soap (₹32.61 on ₹213.75) and formula (₹68.49), ₹101.10; lines sum exactly in paise
- Proportional fixed-discount allocation with remainders, capped at the eligible amount; inclusive IST date check
- Passing tests cover each reason code, case-insensitivity, formula exclusion, HOME15 scope and half-paisa rounding

## Scorecard, shown

- Bugs गिनाता है: float रुपये, formula पर member छूट, GST-सहित MRP पर ऊपर से GST, grocery पर GST, पूरे कार्ट पर टैक्स
- FRESH10 को below_minimum से अस्वीकार करता है: eligible ₹863.50 (कार्ट ₹1,312.50) ₹1,000 से कम; minimum जाँच का क्रम बताता है
- केवल Plus छूट लगाता है, ₹863.50 पर ₹43.18 (केले ₹2.325 → ₹2.33); देय ₹1,269.32
- GST केवल डिशवॉश (₹213.75 में ₹32.61) और formula (₹68.49) से, कुल ₹101.10; lines का जोड़ पैसे तक सटीक
- Fixed छूट का अनुपातिक बँटवारा remainders के साथ, eligible राशि की सीमा तक; IST तारीख की जाँच सम्मिलित
- पास होने वाले tests हर reason code, case-insensitivity, formula की छूट से बाहर रहना, HOME15 का दायरा और half-paisa rounding cover करते हैं
