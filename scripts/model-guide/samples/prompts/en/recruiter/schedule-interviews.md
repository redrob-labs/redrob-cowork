---
profession: recruiter
task: schedule-interviews
language: en
deliverable: none
---

## Prompt

You are the recruiting coordinator at Quillhaven Learning, an ed-tech company hiring a **Senior Backend Engineer**. Schedule the final-round video loop for two candidates during the week of **Monday 26 October 2026**, then write the communications.

**Loop format**

- Three 45-minute sessions, all on the same day for each candidate, in any order: System design (Jane Doe), Coding (Mary Major), Hiring manager (John Stiles).
- Breaks between sessions are at least 15 minutes and at most 30 minutes, unless an accommodation says otherwise.
- Everything must fall within each person's 09:00–17:00 local working hours.
- Each interviewer does at most one final-round session per day.

**Interviewers**

| Interviewer | Location | Busy (local time) |
|---|---|---|
| Jane Doe | Berlin | Tue 27 Oct 13:00–15:00; out of office all day Thu 29 Oct |
| Mary Major | New York | Tue 27 Oct 11:00–12:00 |
| John Stiles | New York | Every day 09:00–09:30 (standup) |

**Candidates**

| Candidate | Location | Availability | Notes |
|---|---|---|---|
| Richard Roe | Lisbon | Tue 27 or Wed 28 Oct | None |
| Richard Miles | Chicago | Tue 27 or Thu 29 Oct only | See his email below |

**Email from Richard Miles**

> "Thanks for moving me forward! I'm hard of hearing, so could the calls have live captions turned on, and could the coding problem be shared in writing as well as verbally? Longer breaks (30 minutes) between sessions would help me too. I'd rather the panel just knew what to set up, not the reason."

**CRM (current)**

| Candidate | Stage | Last update |
|---|---|---|
| Richard Roe | Onsite – to schedule | 14 Oct |
| Richard Miles | Onsite – to schedule | 16 Oct |

Video links: use the placeholders `https://meet.example.com/<id>`.

**Deliver** (markdown, at most ~1,200 words):

1. A schedule table for each candidate: session, interviewer, start and end time in UTC, and the local time for the candidate and each interviewer. Briefly state which UTC offsets apply to each city that week and why.
2. A short explanation of why you chose these days and slots, including any options you ruled out.
3. A confirmation email to each candidate (at most 180 words each), with times shown in their own time zone.
4. A note to the panel (at most 120 words) covering logistics and the accommodation setup.
5. The CRM updates (stage, date, notes) in a table.

## A strong answer

- Uses the correct offsets for that week: the EU clock change on 25 Oct puts Berlin on UTC+1 and Lisbon on UTC+0, while the US change on 1 Nov leaves New York on UTC−4 and Chicago on UTC−5. All local times are consistent with these offsets.
- Puts Richard Miles on Tue 27 Oct, since Jane Doe is out Thursday. His day can't start before 14:00 UTC (09:00 Chicago), and Jane's session has to fit in her 14:00–16:00 UTC window after her busy block. The schedule uses 30-minute breaks and avoids Mary Major's 15:00–16:00 UTC block, for example Jane 14:00–14:45, Stiles 15:15–16:00, Mary 16:30–17:15 UTC.
- Puts Richard Roe on Wed 28 Oct, because the one-session-per-day rule means Tuesday's interviewers are taken by Miles, who has no other day. Every Roe session falls within all participants' hours, and Stiles avoids his 13:00–13:30 UTC standup.
- Arranges the accommodation (live captions, the coding prompt shared in writing, 30-minute breaks) and tells the panel only what to set up, without disclosing that Miles is hard of hearing, as he asked.
- The candidate emails are clear, warm and correct in local time, with links and what to expect. The CRM updates reflect the scheduled stage and the dates.
