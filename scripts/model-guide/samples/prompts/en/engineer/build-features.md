---
profession: engineer
task: build-features
language: en
deliverable: none
---

## Prompt

You work on the checkout service of Basketly, a fictional grocery-delivery app (TypeScript, Node 20, Vitest). Implement promo codes in the cart pricing module. This is the current module:

```ts
// pricing.ts
export type Category = 'grocery' | 'household' | 'alcohol';

export interface LineItem {
  sku: string;
  name: string;
  unitPrice: number; // dollars, e.g. 1.99
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
  const tax = taxable * 0.0825;
  return { subtotal, memberDiscount, tax, total: taxable + tax };
}
```

**Spec (from the PM, Jane Doe, with finance and legal notes)**

1. A cart can carry at most one promo code. Codes are case-insensitive.
2. Promo codes:

   | Code | Type | Value | Minimum eligible subtotal | Valid through (inclusive, store local date) |
   |---|---|---|---|---|
   | FRESH10 | percent | 10% | $40.00 | 2025-12-31 |
   | SAVE5 | fixed | $5.00 | $25.00 | 2025-06-30 |
   | HOME15 | percent | 15%, household items only | $0.00 | 2025-12-31 |

3. Alcohol is never discounted, by promo or by membership (legal requirement). Only non-alcohol items count toward the minimum eligible subtotal.
4. The Plus member discount (5%) applies first; the promo applies to what remains of the eligible items.
5. A fixed discount can never exceed the eligible amount and must be allocated across eligible lines in proportion to their value, so tax can be computed per line.
6. Tax (finance): grocery items are tax-exempt; household and alcohol are taxed at 8.25% on the post-discount line amount.
7. All money is handled in integer cents. Round each line's discount and tax half-up to the cent; allocation remainders go to the largest line.
8. An invalid code must not break checkout. Return the price without the promo and a machine-readable reason (`unknown`, `expired`, `below_minimum`, `no_eligible_items`).

**Deliver** (at most ~1,200 words of prose; code may run longer):

1. The new `pricing.ts`: typed, with pure functions and the code table as data. Keep a `priceCart(cart, promoCode?, today?)` entry point and return a per-line breakdown plus totals in cents.
2. A Vitest test file covering the rules above, including rounding and allocation edge cases.
3. The result of pricing this cart for a Plus member with code `fresh10` on 2025-07-02, shown as a short table:

   | Item | Unit | Qty | Category |
   |---|---|---|---|
   | Organic apples | $1.99 | 3 | grocery |
   | Sourdough loaf | $6.49 | 1 | grocery |
   | Dish soap | $4.25 | 2 | household |
   | IPA 6-pack | $11.99 | 1 | alcohol |
   | Olive oil | $14.50 | 1 | grocery |

4. A short list of the bugs in the current module, and any spec ambiguity you resolved, with the choice you made.

## A strong answer

- Lists the current bugs: floating-point dollars, the member discount applied to alcohol, tax applied to groceries, and tax on the whole cart rather than per line.
- Correctly rejects FRESH10 for the sample cart with `below_minimum`. The cart totals $47.45, but the eligible non-alcohol subtotal is $35.46, which is under $40 even before the member discount. The answer also notes whether the minimum is checked before or after the member discount, as a stated choice.
- Prices the sample cart with only the Plus discount applied to the $35.46 of non-alcohol items, tax only on the dish soap and the IPA, and line results that sum exactly to the totals in cents.
- Implements fixed-discount proportional allocation with remainder handling, caps the discount at the eligible amount, and makes the date check inclusive.
- The tests are meaningful, cover each reason code, case-insensitivity, the alcohol exclusion, HOME15 scoped to household items, and rounding at half-cent boundaries, and would pass against the code as written.
