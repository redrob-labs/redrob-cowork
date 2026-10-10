---
profession: small-team
task: create-marketing
language: en
deliverable: graphics
---

## Prompt

You handle marketing for Crumb & Copper, a neighbourhood bakery with five staff. The owner, Mary Major, is launching a **weekend sourdough subscription** and wants an Instagram post and an A5 flyer for the counter and local cafés. Here is her brief, word for word:

> "Launching 2 May! Subscribers get one loaf every Saturday, 4 a month, for $36/month. That's 25% off! Pick up 8–11am Saturday at the shop. All our bread is 100% organic, and there's a gluten-free option too. Sign up at crumbandcopper.example.com/subscribe. Make it feel warm and local, not corporate. First 50 sign-ups get a free tote."

**Facts from the bakery**

- A single sourdough loaf costs $10 at the counter.
- Flour supplier note: "Our flours are certified organic." The seed mix used in two of the loaves is *not* certified organic.
- The "gluten-free" loaf is a buckwheat and rice loaf baked in the same kitchen and ovens as the wheat bread. There is no separate gluten-free facility and no testing.
- Allergens on site: wheat, sesame, milk, eggs, tree nuts.
- Brand colours: copper `#B87333`, cream `#F5EBDD`, charcoal `#2B2B2B`. Fonts: a serif for headlines, a clean sans-serif for body text.

**Recent Instagram performance (last 60 days, followers ≈ 3,100)**

| Post type | Example | Reach | Likes | Saves | Link-in-bio clicks |
|---|---|---|---|---|---|
| Single photo | Loaf on the counter | 1,900 | 140 | 22 | 12 |
| Reel (15 s) | Behind-the-scenes shaping at 5am | 6,400 | 410 | 60 | 38 |
| Carousel (5 slides) | Weekly menu with prices | 2,700 | 180 | 95 | 41 |

The goal is subscription sign-ups. Mary also wants as many locals as possible to hear about it.

**Deliver** (markdown, at most ~1,200 words excluding the SVG):

1. The Instagram plan: the format you choose and why (use the data), the slide or scene list, the caption (at most 120 words) and up to 8 hashtags.
2. The A5 flyer:
   - all the copy
   - the layout, by zone
   - visual direction (photography, colour, typography, accessibility)
   - an inline SVG mock-up in a code block (`viewBox="0 0 420 595"`, A5 proportions, no external assets)
3. A short note to Mary (at most 120 words) on any wording in her brief you changed and why.

## A strong answer

- Fixes the savings claim: $36 versus 4 × $10 = $40 is a 10% saving ($4 a month), not 25%. The copy uses the accurate figure or simply says "$9 a loaf".
- Doesn't claim "100% organic" (the seed mix isn't certified) or "gluten-free" (it's baked in a shared kitchen with no testing). Uses accurate wording such as "made with certified organic flour" and "made without wheat; baked in a kitchen that handles gluten; not suitable for coeliacs", and includes the allergen note. The note to Mary explains these as consumer-protection and allergy-safety issues.
- Chooses the format from the data and the two goals. The carousel has the best click-through (about 1.5% vs about 0.6% for the reel and the single photo) for sign-ups, and the reel has the best reach. The answer makes the trade-off explicit, for example a carousel as the main post with a reel to support it.
- Both pieces carry the essentials: the 2 May launch, Saturday 8–11am pickup, $36/month for 4 loaves, the sign-up URL and the first-50 tote offer.
- The SVG is valid and self-contained at A5 proportions, uses the brand colours, and has a clear hierarchy with legible text sizes and sufficient contrast.

## Card

brief: Create an Instagram post plan and an A5 counter flyer for a bakery's sourdough subscription launch from the owner's brief.
given:
- Owner's brief: Mary Major's launch details and claims, word for word
- Bakery facts: loaf price, ingredient sourcing, how the gluten-free loaf is made, allergens
- Brand: 3 colours and the font styles
- Instagram performance: reach, likes, saves and clicks for 3 post types
asked:
- An Instagram plan: format and why, slide or scene list, caption up to 120 words, up to 8 hashtags
- An A5 flyer: copy, layout by zone, visual direction and an inline SVG mock-up
- A note to Mary, up to 120 words, on wording changed and why
limit: Up to about 1,200 words in Markdown, excluding the SVG
hard: The brief's claims must be checked against the bakery's facts, and the format choice balances two goals the data pulls apart.

## Scorecard

- Savings fixed: $36 vs $40 (4 × $10) is 10%, $4 a month, not 25% (or "$9 a loaf")
- No "100% organic" (seed mix uncertified); uses wording like "made with certified organic flour"
- No "gluten-free" (shared kitchen, no testing); allergen note included; note to Mary explains both risks
- Format from data: carousel best click-through (≈ 1.5% vs ≈ 0.6%), reel best reach; trade-off explicit
- Both pieces carry 2 May, Saturday 8–11am pickup, $36/month for 4 loaves, URL, first-50 tote
- SVG valid at A5 proportions, brand colours, clear hierarchy, legible text sizes, sufficient contrast
