---
profession: marketer
task: optimize-search
language: en
deliverable: none
---

## Prompt

You are the SEO and content lead at Fieldnote, a field-service management app for HVAC contractors. Rewrite the product page at `fieldnote.example.com/hvac-scheduling-software` so it ranks better and is quoted accurately by AI answer engines. Here is the data.

**Google Search Console, last 90 days, this page**

| Query | Impressions | Clicks | CTR | Avg. position |
|---|---|---|---|---|
| hvac scheduling software | 18,400 | 312 | 1.7% | 8.4 |
| hvac dispatch software | 9,700 | 105 | 1.1% | 11.2 |
| best hvac software for small business | 6,200 | 41 | 0.7% | 14.8 |
| hvac scheduling app free | 4,900 | 22 | 0.4% | 9.1 |
| fieldnote pricing | 2,300 | 1,150 | 50.0% | 1.2 |
| hvac software quickbooks integration | 1,800 | 9 | 0.5% | 17.5 |
| does fieldnote work offline | 640 | 48 | 7.5% | 3.1 |

The blog post `/blog/hvac-scheduling-guide` also ranks for "hvac scheduling software" (avg. position 9.6). Both URLs swap in and out of the results.

**Current page (excerpt)**

> **Title tag:** Fieldnote | Software
> **H1:** The Smartest Way to Run Your Business
> Fieldnote is the #1 tool for contractors. Plans from $29/month. Works with QuickBooks. Get started free today!

**Product facts (from the product team, current as of November 2025)**

- Pricing: $39 per user per month (billed annually) or $49 month-to-month. No free plan; a 14-day free trial, no card required.
- Scheduling: drag-and-drop dispatch board, recurring maintenance agreements, and automatic technician assignment by skill and distance.
- Integrations: QuickBooks Online (two-way sync of customers, invoices and payments). QuickBooks Desktop is not supported.
- Offline: the technician mobile app works offline and syncs when back online. The office web app needs a connection.
- Customers: 1,200 HVAC companies. Median customer: 6 technicians.
- Customer data: dispatchers cut scheduling time from 9 to 4 hours a week (customer survey, n = 210, March 2025).

**What answer engines currently say (snapshot)**

> AI overview for "hvac scheduling software": lists three competitors with a comparison table of price per user, QuickBooks support and offline mode. Fieldnote is not mentioned.
> AI answer for "does fieldnote work offline": "Fieldnote requires an internet connection." (source: a 2022 forum thread)

**Deliver** the following in markdown:

1. A title tag of 60 characters or fewer and a meta description of 155 characters or fewer, each with its character count.
2. The rewritten page: H1, intro, H2 sections, a short "Fieldnote at a glance" fact table, and an FAQ of 5–7 questions with self-contained answers, written so that each answer still makes sense when quoted on its own.
3. FAQPage and SoftwareApplication JSON-LD in a code block, consistent with the page copy.
4. A plan for the blog post and internal linking (at most 5 bullets).
5. A rationale (at most 150 words) covering which queries you targeted, which you deliberately didn't, and why.

Keep the written parts under about 1,200 words. The JSON-LD doesn't count toward the limit.

## A strong answer

- Corrects the outdated or false claims on the current page: the price is $39 per user per month annually or $49 month-to-month, not "from $29"; there is no free plan, only a 14-day trial; QuickBooks support is Online only, not Desktop; the "#1" and "Smartest" superlatives are removed.
- Answers "hvac scheduling app free" honestly with the trial instead of implying a free plan, and explains that choice in the rationale.
- Corrects the AI answers with an FAQ entry stating plainly that the technician app works offline and the office web app does not. The page includes a quotable fact table (price per user, QuickBooks Online, offline mode) that mirrors the comparison format in the AI overview.
- Targets "hvac scheduling software" and "hvac dispatch software" in the title, H1 and H2s. Resolves the cannibalisation with a specific plan, such as repositioning the blog post for informational intent and linking it to the product page with exact-match anchor text.
- The title is 60 characters or fewer and the meta description 155 or fewer, with accurate counts. The JSON-LD is valid and matches the page (price, offer, FAQ text), and the survey claim is attributed (n = 210, March 2025).
