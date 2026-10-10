---
profession: recruiter
task: schedule-interviews
language: ko
deliverable: none
---

## Prompt

당신은 서울에 본사를 둔 에듀테크 기업 '깃펜러닝'의 채용 코디네이터이며, 글로벌 개발 조직의 **시니어 백엔드 엔지니어**를 채용하고 있습니다. **2026년 10월 26일(월)** 주간에 후보자 2명의 최종 화상 면접 일정을 잡고, 관련 안내문을 작성하세요.

**면접 형식**

- 45분 세션 3개를 후보자별로 같은 날 진행하며 순서는 자유입니다: 시스템 설계(이영희), 코딩(Mary Major), 채용 책임자 면접(홍길동).
- 세션 사이 휴식은 최소 15분, 최대 30분입니다. 단, 편의 제공 요청이 있으면 그에 따릅니다.
- 모든 일정은 참여자 각자의 현지 근무 시간(09:00~17:00) 안에 있어야 합니다.
- 면접관 한 명은 하루에 최종 면접 세션을 최대 1개만 진행합니다.
- 서울 본사 채용 기록은 KST로 관리합니다. 코디네이터인 당신의 근무 시간은 제약 조건이 아닙니다.

**면접관**

| 면접관 | 근무지 | 일정 있음 (현지 시간) |
|---|---|---|
| 이영희 | 독일 베를린 | 10월 27일(화) 13:00~15:00, 10월 29일(목) 종일 휴가 |
| Mary Major | 미국 뉴욕 | 10월 27일(화) 11:00~12:00 |
| 홍길동 | 미국 뉴욕 | 매일 09:00~09:30 (스탠드업) |

**후보자**

| 후보자 | 거주지 | 가능 일정 | 비고 |
|---|---|---|---|
| 김철수 | 포르투갈 리스본 | 10월 27일(화) 또는 28일(수) | 없음 |
| 박영수 | 미국 시카고 | 10월 27일(화) 또는 29일(목)만 가능 | 아래 이메일 참조 |

**박영수 님의 이메일**

> "최종 면접에 올려 주셔서 감사합니다! 제가 난청이 있어서, 통화에 실시간 자막을 켜 주실 수 있을까요? 코딩 문제도 말로만이 아니라 글로도 함께 공유해 주시면 좋겠습니다. 세션 사이 휴식도 더 길게(30분) 주시면 도움이 됩니다. 면접관분들께는 이유는 빼고, 무엇을 준비하면 되는지만 알려 주셨으면 합니다."

**CRM (현재)**

| 후보자 | 단계 | 최종 업데이트 |
|---|---|---|
| 김철수 | 최종 면접 – 일정 조율 중 | 10월 14일 |
| 박영수 | 최종 면접 – 일정 조율 중 | 10월 16일 |

화상 회의 링크는 `https://meet.example.com/<id>` 형식의 자리표시자를 사용하세요.

**제출물** (마크다운, 약 2,500자 이내):

1. 후보자별 일정 표: 세션, 면접관, UTC 기준 시작·종료 시각, 후보자와 각 면접관의 현지 시각, 본사 기록용 KST 시각(날짜 포함). 그 주에 각 도시에 적용되는 UTC 오프셋과 그 이유를 간단히 밝히세요.
2. 해당 날짜와 시간대를 고른 이유를 짧게 설명하고, 배제한 선택지도 포함하세요.
3. 후보자별 확정 안내 이메일 (각 약 380자 이내). 시간은 후보자 현지 시간으로 표시하세요.
4. 패널 안내 메모 (약 250자 이내): 진행 방식과 편의 제공 준비 사항.
5. CRM 업데이트(단계, 날짜, 메모) 표.

## A strong answer

- Uses the correct offsets for that week: the EU clock change on 25 Oct puts Berlin on UTC+1 and Lisbon on UTC+0, while the US change on 1 Nov leaves New York on UTC−4 and Chicago on UTC−5. Seoul is UTC+9 all week (no DST). All local and KST times are consistent with these offsets.
- Puts Park Young-su on Tue 27 Oct, since Lee Young-hee is out Thursday. His day can't start before 14:00 UTC (09:00 Chicago), and Lee's session has to fit in her 14:00–16:00 UTC window after her busy block. The schedule uses 30-minute breaks and avoids Mary Major's 15:00–16:00 UTC block, for example Lee 14:00–14:45, Hong 15:15–16:00, Mary 16:30–17:15 UTC (23:00 Tue – 02:15 Wed KST).
- Puts Kim Cheol-su on Wed 28 Oct, because the one-session-per-day rule means Tuesday's interviewers are taken by Park, who has no other day. Every Kim session falls within all participants' hours (common window 13:00–16:00 UTC), and Hong avoids his 13:00–13:30 UTC standup, for example Mary 13:00–13:45, Hong 14:00–14:45, Lee 15:00–15:45 UTC (22:00 Wed – 00:45 Thu KST).
- Shows the KST record times with the correct calendar date, noticing that the evening-UTC sessions roll over to the next day in Seoul.
- Arranges the accommodation (live captions, the coding prompt shared in writing, 30-minute breaks) and tells the panel only what to set up, without disclosing that Park is hard of hearing, as he asked.
- The candidate emails are clear, warm and correct in local time, with links and what to expect. The CRM updates reflect the scheduled stage and the dates.
