---
profession: lawyer
task: client
language: en
deliverable: none
---

## Prompt

You are outside litigation counsel to Harborview Millwork, Inc. in *Harborview Millwork, Inc. v. Crescent Builders Group LLC*, a breach-of-contract action pending in New York Supreme Court, New York County. Today is Friday, November 7, 2025. Write the email to your client's CEO, Mary Major, advising on two settlement proposals and asking for a decision.

**The case in brief**

- Claim: $1,850,000 in unpaid invoices for custom millwork (average due date June 1, 2024), plus $300,000 in lost profits from crews diverted while waiting on payment.
- Counterclaim by Crescent: $500,000 in delay damages.
- Preliminary conference order: note of issue due Feb 27, 2026; trial expected around June 2026.
- Your team's assessment: about 65% likelihood of winning the invoice claim in full; about 30% likelihood that Crescent wins its counterclaim in full; estimated Harborview legal fees from now through trial $350,000 (the contract has no fee-shifting clause).
- Separately, Crescent Holdings, Inc. (Crescent's parent) guaranteed Harborview's $400,000 invoice on an unrelated project (Pier 9). That claim has not been filed.

**Supply Agreement §11.3 (New York law governs)**

> In no event shall either party be liable to the other for any indirect, incidental, consequential or special damages, including lost profits, arising out of this Agreement.

**Proposal 1: CPLR 3221 offer, served personally on your office on Monday, Nov 3, 2025**

> Defendant offers to allow judgment to be taken against it in the sum of $1,200,000, with costs then accrued.

CPLR 3221 (abridged): *"…at any time not later than ten days before trial, any party against whom a claim is asserted… may serve upon the claimant a written offer to allow judgment to be taken against him for a sum… with costs then accrued. If within ten days thereafter the claimant serves a written notice that he accepts the offer, either party may file the summons, complaint and offer, with proof of acceptance, and thereupon the clerk shall enter judgment accordingly. If the offer is not accepted and the claimant fails to obtain a more favorable judgment, he shall not recover costs from the time of the offer, but shall pay costs from that time."*

CPLR 5004 (abridged): *"interest shall be at the rate of nine per centum per annum, except where otherwise provided by statute."*

**Proposal 2: letter from Crescent's counsel, Nov 5, 2025, open until Nov 21**

> $1,350,000, payable in three equal installments at 0, 4 and 9 months, in exchange for a mutual general release of all claims, known or unknown, between Harborview and Crescent Builders Group LLC "and its parents, subsidiaries and affiliates". Mutual confidentiality and non-disparagement. No admission of liability.

**Mary Major's email to you (Nov 6)**

> We have until the end of the month on all this, right? My gut says counter at $1.6M. I've cc'd Richard Miles (richard.miles@example.com), our outside business consultant, so he's in the loop, and I forwarded him your October strategy memo. Can you lay out the options in plain English?

**Deliver** the email to Mary Major in markdown: subject line, then the body. Plain English, no case citations. It must cover:

- the real deadlines, with dates
- a comparison of the two proposals and of going to trial, with your expected-value arithmetic shown simply
- what each proposal would cost Harborview beyond the dollar figure
- your recommendation and a suggested counteroffer strategy
- exactly what you need from her, and by when

Handle the cc and the forwarded memo appropriately. Keep it under about 1,200 words.

## A strong answer

- Corrects the deadline: acceptance of the CPLR 3221 offer must be served within 10 days of Nov 3, so by Thursday, Nov 13, 2025, not the end of the month. Proposal 2 is open until Nov 21. Asks for her decision before Nov 13.
- Explains that §11.3 likely bars the $300,000 lost-profits claim, and builds a simple expected-value model. Roughly: 0.65 × ($1.85M + about $333K of 9% interest over two years) − 0.30 × $500K − $350K in fees ≈ $0.9M. Concludes that both offers compare well with trial on a risk-adjusted basis.
- Spots that Proposal 2's general release covering "parents … and affiliates" would wipe out the separate $400,000 Pier 9 guaranty claim against Crescent Holdings, so its real value is lower. Also notes the credit risk of installments, compared with Proposal 1's immediate judgment.
- Explains the cost-shifting consequence of rejecting the 3221 offer and failing to beat it, without overstating it: "costs" means statutory costs, not attorneys' fees.
- Removes Richard Miles from the thread or advises against copying him, and explains the risk that sharing privileged advice and the strategy memo with a third party waives privilege. Gives a clear recommendation and counter strategy, for example accepting or countering Proposal 2 with a carve-out for Pier 9 and security for the installments.
