---
profession: designer
task: handoff-specs
language: en
deliverable: web
---

## Prompt

You are the product designer at Brightline Forms, a fictional online-form builder. The pricing page redesign is approved and goes to the front-end team (lead: John Stiles) next sprint. Prepare the developer handoff for the pricing section: a monthly/annual billing toggle and three plan cards.

**Design inspect notes, exported from the design file**

```text
Toggle: segmented control, 2 options [Monthly | Annual], height 40, radius 20,
  selected bg #2F6FEB, selected text #FFFFFF, unselected text #4B5563
  Annual option has badge "Save 20%" (bg #E8F7EE, text #1F7A45, 12px)
Card: width 320, padding 24, gap between cards 14, radius 12, border 1px #E5E7EB
  Recommended card (Pro): border 2px primary-600, label "Most popular"
Price: 40px/48px semibold; suffix "/mo" 16px #6B7280
CTA button: height 44, full width, radius 8, bg primary-600, text white
Feature list: 14px/20px, check icon 16px, row gap 10
Breakpoints: 3 columns ≥ 1040px; stacked below, Pro card first
```

**Design tokens (codebase)**

```css
--primary-600: #2F6FED;
--primary-700: #2459C4;
--gray-500: #6B7280;
--gray-600: #4B5563;
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 20px; --space-6: 24px; --space-8: 32px;
--radius-md: 8px; --radius-lg: 12px; --radius-full: 9999px;
```

**Plan copy and prices (from the pricing doc)**

| Plan | Monthly | Annual (shown) | Annual billed | Features |
|---|---|---|---|---|
| Starter | $0 | $0 | $0 | 3 forms, 100 responses/mo |
| Pro | $19/mo | $15/mo | $190/yr | Unlimited forms, 5,000 responses/mo, logic, file uploads |
| Business | $49/mo | $39/mo | $468/yr | Everything in Pro, SSO, audit log, 50,000 responses/mo |

Requirements from the PM: the Annual toggle is selected by default; switching must not cause a layout shift; under the annual price show "Billed $X yearly"; the Starter CTA reads "Start free", the others "Start 14-day trial".

**Deliver** (at most ~1,200 words of prose; code may run longer):

1. A single-file HTML/CSS/vanilla-JS reference implementation in one code block. Use only the codebase tokens, and include the toggle, the three cards, the states (hover, focus-visible, selected, disabled CTA while loading) and the responsive behaviour.
2. A spec table for developers: element, property, value (token name) and note. Every raw value from the inspect notes should map to a token, with any you changed called out.
3. Accessibility notes: toggle semantics and keyboard behaviour, what screen readers announce when prices change, and contrast.
4. A list of open questions or inconsistencies for the PM and designer, each with your recommended resolution.

## A strong answer

- Catches the Pro pricing inconsistency: $15 × 12 = $180, not $190, and "Save 20%" does not hold for Pro ($15 vs $19 is 21%; $190 vs $228 is about 17%). Business is consistent ($39 × 12 = $468; about 20%). The answer proposes a resolution, such as fixing the billed amount or changing the badge to "Save up to 20%".
- Normalizes off-system values: #2F6FEB becomes --primary-600 (#2F6FED), the 14px card gap becomes --space-4 (or --space-3) and the 10px row gap goes to the nearest token, with the reason stated.
- Implements the toggle as an accessible control (radio group, or buttons with aria-pressed), with arrow or Tab keyboard support, a visible focus style and a polite live region or other sensible announcement of price changes. Annual is the default.
- Avoids layout shift when toggling (reserved space or fixed-width price area, "Billed $X yearly" line always present), and in the stacked layout the Pro card comes first.
- The code runs as a single file, uses CSS custom properties from the token list, and the spec table is complete enough to build from without the design file.
