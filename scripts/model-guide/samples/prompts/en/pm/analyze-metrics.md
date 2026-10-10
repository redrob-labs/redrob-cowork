---
profession: pm
task: analyze-metrics
language: en
deliverable: spreadsheets
---

## Prompt

You are a product analyst at Fernwork, a project-management SaaS with a 14-day free trial. The growth team ran an A/B test of a new onboarding checklist shown to new trial sign-ups. Assignment was meant to be **50/50** at sign-up. The test was planned for 14 days and was stopped on **day 9**. The growth PM, John Stiles, wants to ship it:

> "Activation is up from 23.0% to 26.0%. That's a 13% relative lift. Let's roll it out to 100% on Monday."

**Activation** = created 3 or more tasks within 48 hours of sign-up. **Paid** = upgraded to a paid plan within 48 hours of sign-up. The tables cover users who signed up on days 1–7, so every user has a complete 48-hour window.

**Overall results**

| Variant | Users assigned | Activated | Paid |
|---|---|---|---|
| Control | 10,000 | 2,300 | 410 |
| Checklist | 9,200 | 2,392 | 386 |

**By platform**

| Variant | Platform | Users | Activated | Paid |
|---|---|---|---|---|
| Control | Web | 6,000 | 1,500 | 270 |
| Control | iOS | 2,500 | 500 | 90 |
| Control | Android | 1,500 | 300 | 50 |
| Checklist | Web | 6,000 | 1,620 | 276 |
| Checklist | iOS | 1,700 | 442 | 62 |
| Checklist | Android | 1,500 | 330 | 48 |

**Engineering note (posted on day 7)**

> "iOS build 5.2.0 crashed when rendering the checklist on some older devices. The crash happened before the assignment event was logged. Fixed in 5.2.1, rolled out day 6." (Jane Doe)

**Deliver** (markdown, at most ~1,200 words):

1. A data-quality check: test whether the split matches the intended 50/50 overall and by platform. Show the test you use and its result.
2. A results table by platform and overall. For both activation and paid, include the rate, the absolute and relative difference, and a significance test (for example a two-proportion z-test). State the formula behind each computed column.
3. An interpretation: which numbers you trust, which you don't, and why.
4. A recommendation to John Stiles (at most 200 words): ship, don't ship, or a specific alternative. Include what you would need to see to change your recommendation.

## A strong answer

- Detects a sample ratio mismatch: 10,000 vs 9,200 against an expected 9,600 each gives χ² ≈ 33 (p < 0.001). It is traced to iOS (2,500 vs 1,700) and linked to the crash before assignment logging. Web and Android are balanced.
- Refuses to report the pooled +13% relative lift, or the iOS lift (20% → 26%), as valid, because the surviving iOS users are a biased sample.
- Analyses the platforms with valid splits separately. Web activation rises from 25.0% to 27.0% (z ≈ 2.5, p ≈ 0.01). Android goes from 20.0% to 22.0% (z ≈ 1.3, not significant).
- Notes that paid conversion is essentially flat (4.10% vs about 4.20% overall; web 4.5% vs 4.6%), that the test was stopped early at day 9 of 14, and that 48-hour activation is only a proxy for retention and revenue.
- Recommends a specific path, such as not shipping on the pooled result, fixing logging, and rerunning or extending to the full 14 days (optionally starting web-first), with a stated decision criterion. Formulas are shown.
