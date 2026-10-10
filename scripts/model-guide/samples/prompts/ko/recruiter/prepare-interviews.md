---
profession: recruiter
task: prepare-interviews
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 콜드체인 물류 기업 '한빙로지스'(글로벌 물류 그룹의 한국 법인)의 채용 담당자이며, **권역 운영 매니저**를 채용하고 있습니다. 후보자 3명이 1차 패널 면접을 마쳤습니다. 내일 채용 회의를 준비하세요. 피드백을 취합하고, 최종 면접에 올라갈 후보자(**2명**)를 정하고, 최종 면접 계획을 작성해야 합니다.

**프로세스 규칙**

- 역량 4가지: 운영 리더십(OPS), 데이터·KPI 활용(DATA), 안전 및 식품 안전(HACCP) 준수(SAFE), 이해관계자 커뮤니케이션(COMM).
- 표준 평가표는 1~4점 척도입니다. 최종 면접에 오르려면 **SAFE 평균이 3.0 이상**이어야 합니다.
- 실제로 진행된 면접의 평가표만 반영합니다.

**평가표**

| 후보자 | 면접관 | OPS | DATA | SAFE | COMM | 코멘트 |
|---|---|---|---|---|---|---|
| 박영수 | John Stiles (채용 책임자, 법인장) | 3 | 3 | 4 | 3 | "탄탄함. 다소 내성적." |
| 박영수 | 홍길동 (안전관리 책임자) | 4 | 3 | 4 | 3 | "HACCP 기준 이탈 대응이 탁월함." |
| 박영수 | John Doe (아태 본부 재무 파트너) | 4 | 5 | 4 | 4 | "팔레트당 원가 지표에 매우 강함." |
| 김철수 | John Stiles | 4 | 4 | 3 | 4 | "조직 문화에 딱 맞음. 내 젊었을 때를 보는 것 같다. 강력 추천." |
| 김철수 | 홍길동 | 3 | 2 | 2 | 3 | "온도 이탈 발생 시 대응 절차를 설명하지 못함." |
| 김철수 | John Doe | 5 | 4 | 5 | 4 | "인상적임." |
| 이영희 | John Stiles | 3 | 4 | 3 | 4 | "우수하지만 어린아이가 둘 있는 엄마라 당직 순번을 감당할 수 있을지 모르겠음." |
| 이영희 | 홍길동 | 3 | 4 | 4 | 4 | "현장 안전 감각이 좋음." |
| 이영희 | John Doe | 4 | 4 | 3 | 5 | "세 명 중 커뮤니케이션 최고." |

John Doe 님의 평가표 머리글에는 "Rating (1 = poor, 5 = exceptional)"이라고 적혀 있습니다(아태 본부 양식 사용).

**면접 일정 내보내기 (5월 11일 주간)**

| 날짜 | 시간 | 일정 | 상태 |
|---|---|---|---|
| 5월 11일 | 10:00 | 박영수: 재무 면접 (John Doe) | 완료 |
| 5월 12일 | 14:00 | 김철수: 재무 면접 (John Doe) | 취소(면접관 병가), 재일정 없음 |
| 5월 13일 | 09:00 | 이영희: 재무 면접 (John Doe) | 완료 |
| 그 외 모든 패널 면접 | | | 완료 |

**제출물** (마크다운, 약 2,500자 이내):

1. 통합 평가표: 후보자별 역량 평균과 전체 평균(1~4점 척도). 척도 문제나 유효성 문제를 어떻게 처리했는지를 포함해 계산된 모든 열의 방법을 밝히세요.
2. 이슈 로그: 발견한 모든 데이터 품질 문제 또는 공정성 문제와 각각의 조치.
3. 최종 면접 진출자 추천과 근거. 채용 책임자가 반발할 경우 어떻게 답할지도 포함하세요.
4. 진출자 대상 최종 면접 계획: 면접관, 역량별 구조화 질문 1개(4점 답변의 기준 포함), 후보자별로 더 확인할 부분.

## A strong answer

- Rescales John Doe's 1–5 ratings to 1–4 with a stated formula (for example, x′ = 1 + (x − 1) × 3/4, so 5 → 4 and 4 → 3.25) rather than averaging raw scores.
- Excludes John Doe's scorecard for Kim Cheol-su because the calendar shows that interview was cancelled. Without it, Kim's SAFE average is 2.5, below the 3.0 bar. With the invalid card included it would be exactly 3.0, and the answer notices this.
- Removes Stiles' comment about Lee Young-hee's children from the decision and flags it as an improper, non-job-related consideration (sex and family-status discrimination under 남녀고용평등법 Art. 7; 채용절차법 Art. 4-3 bars even collecting marital status and similar non-job information). Recommends asking every finalist the same question about on-call availability. Also flags "reminds me of me when I was young" as affinity bias.
- Advances Lee Young-hee (overall about 3.50; SAFE about 3.17) and Park Young-su (overall about 3.40; SAFE 3.75), with the averages shown and the method reproducible.
- The final-round plan probes each finalist's weakest area (Lee's SAFE, Park's COMM) with the same structured questions and behavioural anchors for both.
