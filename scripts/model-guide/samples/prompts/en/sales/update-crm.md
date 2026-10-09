---
profession: sales
task: update-crm
language: en
deliverable: spreadsheets
---

## Prompt

You are the sales rep at Gridpoint Sensors, which sells industrial IoT vibration and temperature sensors. Today is **Friday 13 March 2026**, and the quarter ends **31 March**. Your manager, John Stiles, wants your CRM cleaned up and a Q1 forecast before Monday's call. He asks: "Can I put Pinecrest in Q1 as won?"

**Stage probabilities (company standard):** Discovery 10%, Solution 25%, Proposal 50%, Negotiation 75%, Closed Won 100%, Closed Lost 0%. The CRM amount field is in **USD**. Finance's forecasting rate is 1 EUR = 1.08 USD.

**CRM export (before your updates)**

| Opp | Account | Stage | Amount ($) | Close date | Next step |
|---|---|---|---|---|---|
| O-101 | Bayfront Water Utility | Negotiation | 84,000 | 2026-03-27 | Legal redlines |
| O-102 | Kestrel Mills | Proposal | 46,500 | 2026-02-27 | Send revised quote |
| O-103 | Harrow Chemicals | Solution | 120,000 | 2026-06-30 | Site survey |
| O-104 | Pinecrest Foods | Negotiation | 38,000 | 2026-03-31 | Await PO |
| O-105 | Pinecrest Foods | Proposal | 38,000 | 2026-04-15 | — |
| O-106 | Eastbrook Packaging GmbH | Proposal | 52,000 | 2026-03-31 | Pricing call |
| O-107 | Tidemark Ports | Discovery | 210,000 | 2026-03-31 | Intro call |

**This week's activity (notes, emails, calendar)**

- **Mon, call with Jane Doe (Bayfront procurement):** The legal redlines are agreed. Signature is expected on 24 March. The amount hasn't changed. *Calendar:* "Bayfront signing call, Tue 24 Mar."
- **Mon, email from Kestrel Mills (Richard Miles):** "We've reduced scope to two lines. Please re-quote for 30 sensors instead of the 45 in your proposal. We'll decide by 10 April." The original quote was a flat per-sensor price.
- **Tue, Harrow Chemicals site survey done:** "Budget won't be approved until our fiscal year starts on 1 July. We'll revisit in August."
- **Wed, your own note:** "Pinecrest WON!!" *Email from Mary Major (Pinecrest), same day:* "Good news: we've chosen Gridpoint. The PO is in our approval workflow and should be issued by 3 April. We'll sign your order form once it's issued."
- **Wed:** O-105 was created by the marketing automation when Pinecrest downloaded a datasheet.
- **Thu, Eastbrook pricing call:** The quote sent was **€52,000**. They asked for a 3-year pricing option and will decide at their board meeting on 26 March.
- **Thu, Tidemark Ports intro call (Richard Roe):** "We're exploring options for our 2027 capital plan. No budget yet." Your note: "Amount is my guess."

**Deliver** (markdown, at most ~1,200 words):

1. The updated CRM table, with the same columns plus Weighted ($) and "Changed / why". State the formula for every computed column, and show any amount or currency recalculation.
2. A Q1 forecast table: before and after your updates, with Commit / Best case / Pipeline categories. Define each category.
3. The CRM hygiene issues you found and fixed, as a list.
4. Your reply to John Stiles (at most 120 words).

## A strong answer

- Keeps Pinecrest in Negotiation, not Closed Won, because the PO and the signature are still pending. Moves its close date to about 3 April, which takes it out of Q1, and merges or deletes the duplicate O-105. The reply to Stiles says "not in Q1 as won" plainly.
- Re-prices Kestrel Mills to $31,000 (46,500 ÷ 45 = $1,033.33 per sensor × 30) and replaces the past close date with 10 April. Converts Eastbrook's €52,000 to $56,160 and keeps it in Q1 given the 26 March decision.
- Moves Harrow (to Q3) and Tidemark (to a 2027-realistic date) out of Q1, and flags Tidemark's $210,000 as an unqualified placeholder.
- The weighted values use Amount × stage probability. The Q1 weighted forecast drops from $161,750 (as exported) to $91,080 (Bayfront $63,000 + Eastbrook $28,080), with Bayfront as Commit.
- The hygiene list covers the past-dated close, the duplicate, the currency mismatch, the guessed amount and the premature Closed Won.
