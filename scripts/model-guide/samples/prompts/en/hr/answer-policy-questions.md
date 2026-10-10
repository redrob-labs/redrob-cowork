---
profession: hr
task: answer-policy-questions
language: en
deliverable: none
---

## Prompt

You are an HR generalist at Northwind Freight Systems, Inc. (about 900 employees). An employee has emailed the HR inbox. Using only the policy material below, write a reply she can act on. Then write a separate short internal note to the HR policy owner about anything in the source material that needs fixing.

Today is Monday, November 3, 2025.

**Employee record**

| Field | Value |
|---|---|
| Name | Jane Doe, Senior Pricing Analyst |
| Work location | Albany, New York office |
| Hire date | March 3, 2025 |
| Schedule | Full-time, 40 hours/week, salaried exempt |
| PTO used in 2025 | 4.0 days |
| Benefits elected | Medical (employee only), Dependent Care FSA at $1,000/year |

**Her email**

> Hi HR, I'm pregnant, due February 16, 2026, and I'd like to plan my leave. I found the handbook on the intranet and it says paid parental leave needs 12 months of service, so I assume I don't qualify and will have to use PTO and unpaid FMLA. Questions:
> 1. Can I carry 10 days of PTO into 2026 so I can add them to my leave?
> 2. Can I raise my Dependent Care FSA to the maximum now, so it's in place before the baby comes?
> 3. Do I have to tell my manager yet? I'd rather wait until January.
> 4. Is my job protected while I'm out?
> Thanks, Jane

**Source A: Employee Handbook v2023, section 7.2 (still posted on the intranet)**

> Eligible employees with at least 12 months of continuous service may take up to 12 weeks of paid parental leave at 100% of base pay following the birth or adoption of a child.

**Source B: Policy Bulletin PB-2025-04, effective July 1, 2025 ("supersedes Handbook section 7.2")**

> Employees with at least 6 months of continuous service on the first day of leave may take up to 16 weeks of paid parental leave at 100% of base pay, within 12 months of the birth or placement. Leave may be taken in up to two blocks of at least 2 weeks each. For New York employees, paid parental leave runs concurrently with New York Paid Family Leave (NY PFL); the company pays the difference between the NY PFL benefit and 100% of base pay. Employees should give 30 days' notice where the leave is foreseeable.

**Source C: PTO policy, section 6.1**

> Full-time employees accrue 1.25 days of PTO per completed calendar month of service, credited at month-end. Up to 5 unused days carry over into the next calendar year; any balance above 5 days is forfeited on December 31.

**Source D: Benefits guide, Dependent Care FSA**

> Elections can be changed mid-year only within 30 days after a qualifying life event, including the birth of a child. The 2026 household limit is $7,500.

**Source E: Leave law summary prepared by Legal (2025)**

> FMLA: job-protected unpaid leave of up to 12 weeks for employees with 12 months of service and 1,250 hours worked in the prior 12 months. NY PFL: up to 12 weeks of job-protected, partially paid leave; full-time employees become eligible after 26 consecutive weeks of employment.

Deliver two artifacts in markdown: (1) the email reply to Jane, warm and plain-spoken, answering each question with dates and numbers she can plan around; (2) an internal note of at most 150 words. Show the PTO arithmetic. Where the policy material leaves a question open, say so and say who will confirm it rather than guessing. Keep the total under about 1,200 words.

## A strong answer

- Catches that Handbook v2023 is superseded: Jane is eligible for 16 weeks of paid parental leave at 100% because she will have more than 6 months of service by the time leave starts. Does not tell her to rely on PTO or FMLA.
- Gets the PTO numbers right: 10 completed months (March through December) × 1.25 = 12.5 days accrued, minus 4 used = 8.5 days. Only 5 carry over, so she cannot carry 10 days, and 3.5 days are forfeited unless she uses them by December 31.
- Explains that she cannot change the Dependent Care FSA now. The birth is the qualifying event, so she has 30 days after it (about March 18, 2026, if the baby arrives on the due date). The 2026 limit is a household limit.
- On job protection: she won't meet FMLA's 12-month test when leave starts (about 11 months of service), but she is eligible for NY PFL (well past 26 weeks), which is job-protected. NY PFL runs concurrently with the company leave and is topped up to 100%.
- Treats manager notice as a judgement call: 30 days' notice means telling her manager by mid-January for a mid-February start. Her January timing works, and HR keeps the matter confidential until then.
- The internal note flags that the superseded handbook is still on the intranet. It also flags that PB-2025-04 doesn't say whether weeks 13–16 (after NY PFL's 12 weeks run out) are job-protected, and routes that question to Legal instead of promising protection.
