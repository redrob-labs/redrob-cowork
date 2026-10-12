---
profession: recruiter
task: prepare-interviews
language: en
deliverable: spreadsheets
---

## Prompt

You are the recruiter for Frostline Freight, a cold-chain logistics company hiring a **Regional Operations Manager**. Three candidates finished first-round panels. Prepare tomorrow's debrief: consolidate the feedback, decide who advances to the final round (**two slots**), and draft the final-round interview plan.

**Process rules**

- Four competencies: Operational leadership (OPS), Data/KPI fluency (DATA), Safety and food-safety compliance (SAFE), Stakeholder communication (COMM).
- The standard scorecard uses a 1–4 scale. A candidate must average **at least 3.0 on SAFE** to advance.
- Only scorecards from interviews that actually took place count.

**Scorecards**

| Candidate | Interviewer | OPS | DATA | SAFE | COMM | Comment |
|---|---|---|---|---|---|---|
| Jane Doe | John Stiles (hiring mgr) | 3 | 3 | 4 | 3 | "Solid, a bit reserved." |
| Jane Doe | Richard Miles (safety lead) | 4 | 3 | 4 | 3 | "Excellent on HACCP deviations." |
| Jane Doe | John Doe (finance partner) | 4 | 5 | 4 | 4 | "Very strong on cost-per-pallet metrics." |
| Richard Roe | John Stiles | 4 | 4 | 3 | 4 | "Great culture fit, reminds me of me at his age. Strong hire." |
| Richard Roe | Richard Miles | 3 | 2 | 2 | 3 | "Couldn't walk through a temperature-excursion response." |
| Richard Roe | John Doe | 5 | 4 | 5 | 4 | "Impressive." |
| Mary Major | John Stiles | 3 | 4 | 3 | 4 | "Strong, but she has two young kids. Not sure she can handle the on-call rota." |
| Mary Major | Richard Miles | 3 | 4 | 4 | 4 | "Good practical safety instincts." |
| Mary Major | John Doe | 4 | 4 | 3 | 5 | "Best communicator of the three." |

John Doe's form header reads "Rating (1 = poor, 5 = exceptional)".

**Interview calendar export (week of 11 May)**

| Date | Time | Event | Status |
|---|---|---|---|
| 11 May | 10:00 | Jane Doe: finance interview (John Doe) | Completed |
| 12 May | 14:00 | Richard Roe: finance interview (John Doe) | Cancelled (interviewer ill), not rescheduled |
| 13 May | 09:00 | Mary Major: finance interview (John Doe) | Completed |
| All other panel slots | | | Completed |

**Deliver** (markdown, at most ~1,200 words):

1. A consolidated scorecard table: each candidate's average per competency and overall, on the 1–4 scale. State the method behind every computed column, including how you handle any scale or validity problems.
2. An issues log: every data-quality or fairness problem you found and what you did about each.
3. A recommendation of who advances, with your reasoning, including how you would answer pushback from the hiring manager.
4. A final-round plan for the advancing candidates: interviewers, one structured question per competency (with what a "4" answer looks like), and what to probe for each candidate.

## A strong answer

- Rescales John Doe's 1–5 ratings to 1–4 with a stated formula (for example, x′ = 1 + (x − 1) × 3/4, so 5 → 4 and 4 → 3.25) rather than averaging raw scores.
- Excludes John Doe's scorecard for Richard Roe because the calendar shows that interview was cancelled. Without it, Roe's SAFE average is 2.5, below the 3.0 bar. With the invalid card included it would be exactly 3.0, and the answer notices this.
- Removes Stiles' comment about Mary Major's children from the decision and flags it as an improper, non-job-related consideration. Recommends asking every finalist the same question about on-call availability. Also flags "reminds me of me at his age" as affinity bias.
- Advances Mary Major (overall about 3.50; SAFE about 3.17) and Jane Doe (overall about 3.40; SAFE 3.75), with the averages shown and the method reproducible.
- The final-round plan probes each finalist's weakest areas (Mary: OPS ≈ 3.08 after rescaling, and SAFE ≈ 3.17, the one nearest the bar; Jane: COMM) with the same structured questions and behavioural anchors for both.

## Card

brief: Consolidate first-round panel scorecards for three candidates, pick two for the final round, and draft the final-round interview plan.
given:
- Process rules: 4 competencies, a 1–4 scale, a 3.0 SAFE bar, valid interviews only
- Scorecards: 9 forms, 3 per candidate, with interviewer comments
- Form note: the header on John Doe's rating form
- Interview calendar: the status of the week's interviews
asked:
- A consolidated scorecard on the 1–4 scale, with the method for every computed column
- An issues log of data-quality and fairness problems and the action on each
- Who advances and why, including how to answer hiring-manager pushback
- A final-round plan: interviewers, one structured question per competency with a "4" anchor, probes per candidate
limit: Up to about 1,200 words, in Markdown
hard: The scorecards hide data-validity problems and comments that would be discriminatory if acted on, and close averages need a defensible method.

## Scorecard

- Rescales John Doe's 1–5 ratings to 1–4 with a stated formula (e.g. 5 → 4, 4 → 3.25)
- Excludes Doe's card for Roe (interview cancelled): Roe's SAFE 2.5, below 3.0; notes it would be 3.0
- Flags Stiles' remark on Mary's children as improper, ignores it, asks all finalists the same on-call question
- Flags "reminds me of me at his age" as affinity bias
- Advances Mary Major (≈ 3.50, SAFE ≈ 3.17) and Jane Doe (≈ 3.40, SAFE 3.75), method reproducible
- Final round probes each finalist's weakest areas (Mary: OPS, and SAFE near the bar; Jane: COMM), same questions and anchors
