---
profession: hr
task: run-performance-reviews
language: en
deliverable: spreadsheets
---

## Prompt

You are the HR business partner for the Product Engineering group at Copperleaf Health Software. Calibration is tomorrow. Prepare the calibration workbook from the managers' submissions below. The HRBP summary that came with them says: "Proposals come in at 3.4% of payroll, within the 3.5% budget. No issues."

**Rating guide (company policy)**

| Rating | Anchor (goal attainment) | Merit range |
|---|---|---|
| 5 | ≥110% and peer average ≥4.3 | 5.0–6.0% |
| 4 | 100–109% | 3.5–4.5% |
| 3 | 85–99% | 2.0–3.0% |
| 2 | 70–84% | 0–1.0% |
| 1 | <70% | 0% |

Managers may deviate one level from the anchor with a written justification. Employees who were on protected leave for more than 3 months are rated only on the period they actually worked, against pro-rated goals. The merit budget is 3.5% of the group's total base payroll.

**Manager submissions**

| ID | Team | Manager | Base salary | Mgr rating | Goal attainment | Peer avg (1–5) | Proposed merit | Manager note |
|---|---|---|---|---|---|---|---|---|
| E01 | Platform | Richard Roe | $120,000 | 5 | 118% | 4.6 | 6.0% | — |
| E02 | Platform | Richard Roe | $105,000 | 5 | 96% | 4.1 | 6.0% | — |
| E03 | Platform | Richard Roe | $98,000 | 5 | 62% | 3.2 | 5.5% | "Great attitude" |
| E04 | Platform | Richard Roe | $112,000 | 4 | 101% | 4.3 | 4.5% | — |
| E05 | Data | Mary Major | $130,000 | 4 | 109% | 4.4 | 4.0% | — |
| E06 | Data | Mary Major | $95,000 | 3 | 92% | 3.8 | 2.5% | — |
| E07 | Data | Mary Major | $88,000 | 2 | n/a | 4.0 | 0.5% | "On leave Mar–Jul; missed most goals." Goals met on pro-rated basis: 103% |
| E08 | Data | Mary Major | $101,000 | 3 | 85% | 3.5 | 2.5% | — |
| E09 | Growth | John Stiles | $92,000 | 3 | 104% | 4.2 | 2.5% | — |
| E10 | Growth | John Stiles | $99,000 | 4 | 97% | 3.9 | 4.0% | "Led billing migration, not in original goals" |
| E11 | Growth | John Stiles | $86,000 | 2 | 71% | 2.9 | 1.0% | — |
| E12 | Growth | John Stiles | $110,000 | 3 | 88% | 3.6 | 3.0% | — |

**Deliver, as markdown tables:**

1. **Calibration table**: one row per employee with the submitted rating, the guide's anchor rating, the gap, a flag (OK / Needs justification / Policy issue), your recommended rating and merit %, the merit $, and a one-line rationale.
2. **Budget table**: total payroll, the budget in $, the submitted total merit in $ and as % of payroll, and your recommended total in $ and %.
3. **Manager-pattern table**: average submitted rating and average anchor rating for each manager.
4. **Discussion guide**: at most 8 bullets for the calibration facilitator, giving the cases to discuss and the question to put to each manager.

State the formula behind each computed column (for example, merit $ = base × merit %). Your recommended plan must fit within budget and within the merit ranges. Where you change a manager's rating, say whether it is a firm policy issue or a recommendation for discussion. Keep the answer under about 1,200 words.

## A strong answer

- Computes payroll correctly as $1,236,000, the budget as $43,260 and the submitted total as $44,890 (3.63%). Calls out the HRBP summary's "3.4%, within budget" as wrong: the submissions are $1,630 over.
- Flags E07 as a firm policy issue. She must be rated on pro-rated goals (103%, which anchors at 4), not marked down for protected leave, and her merit should be raised to match.
- Flags E03 (5 at 62% goal attainment, an anchor of 1, with no valid justification) and E02 (5 at 96%, an anchor of 3, two levels above with no note). Identifies Richard Roe's leniency pattern in the manager table.
- Handles the one-level deviations with judgement: E10's 4 has a justification and can stand for discussion, and E09 looks under-rated at 3 against a 104% anchor of 4.
- The recommended plan totals no more than $43,260, keeps every merit % inside its rating's range, and every merit $ equals base × %.
