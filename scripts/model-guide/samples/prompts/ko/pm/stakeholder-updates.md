---
profession: pm
task: stakeholder-updates
language: ko
deliverable: presentations
---

## Prompt

당신은 모바일 금융 앱 '모아페이'의 신규 저축 기능 '목표 저축'을 맡은 PM입니다. 이 기능은 예금을 보관하는 제휴 은행인 한결은행과 함께 만들고 있습니다. 목요일 운영위원회에서 15분을 배정받았고, 참석자는 김철수(COO), 이영희(CFO), 박영수(준법감시인)입니다. 아래 현황 자료로 발표 자료를 만드세요. 팀 리드 홍길동 님은 프로젝트 전체 상태를 **녹색(정상)**으로 보고했습니다.

**프로젝트 개요**

- 정식 출시 예정일: **2026년 12월 1일**. 프로젝트 기간은 10개월(2~11월)이며 7개월이 지났습니다.
- 제휴 은행 규정(제휴 협약서): 한결은행은 정식 출시 전에 최종 컴플라이언스 패키지를 **4주** 동안 검토해야 합니다.

**마일스톤 (홍길동 님의 현황 보고서)**

| 마일스톤 | 계획 | 현재 전망 | 상태 |
|---|---|---|---|
| 클로즈드 베타 | 8월 15일 | 8월 15일 (완료) | 녹색 |
| 한결은행 원장 연동 | 9월 30일 | 10월 10일 | 녹색 |
| 한결은행에 최종 컴플라이언스 패키지 제출 | 10월 31일 | 11월 14일 | 녹색 |
| 마케팅 출시 소재 | 11월 15일 | 11월 15일 | 녹색 |
| 정식 출시 | 12월 1일 | 12월 1일 | 녹색 |

**예산**

| 항목 | 금액 |
|---|---|
| 승인 예산 | 8억 원 |
| 현재까지 집행액 (7개월) | 6억 1,000만 원 |
| 현재 월 집행 속도 | 8,500만 원 |
| 완료 시점 예상 총액 (현황 보고서 기준) | 7억 9,000만 원 |

**베타 결과 (사용자 2,400명, 6주)**

| 지표 | 목표 | 실적 |
|---|---|---|
| 저축 목표를 만든 사용자 비율 | 40% | 31% |
| 평균 첫 입금액 | 10만 원 | 11만 5,000원 |
| 목표 생성자의 4주 차 리텐션 | 60% | 64% |
| 사용자 1,000명당 고객 문의 건수 | 15건 이하 | 22건 |

베타 문의 상위 유형: "잔돈 모으기 설정을 이해하지 못함"(전체 문의의 41%), "입금이 반영되기까지 2일 걸림"(27%).

**제출물** (마크다운, 약 2,500자 이내):

1. 6~8장 분량의 발표 자료를 슬라이드별로 작성 (`### Slide n: 제목`, 슬라이드당 글머리표 3~5개, 한 줄 발표자 노트). 결론을 먼저 제시하고, 정직한 RAG(적색·황색·녹색) 상태를 보여 주고, 선택지와 당신의 권고안을 포함해 위원회에 요청하는 구체적인 의사결정으로 마무리하세요.
2. 자료와 함께 보낼 이메일 (약 250자 이내).
3. 홍길동 님께 보내는 메모 (약 200자 이내): 바꾼 상태가 있다면 무엇을 왜 바꿨는지 설명하세요. 건설적인 어조로 작성하세요.

## A strong answer

- Recomputes the forecast at completion as about ₩865M (₩610M + 3 remaining months × ₩85M). Flags that this conflicts with the reported ₩790M and is roughly ₩65M (about 8%) over the ₩800M budget.
- Catches the launch conflict: the compliance pack is submitted 14 Nov, and with Hangyeol Bank's 4-week review the earliest launch is about 12 Dec, after the 1 Dec date. The compliance and launch milestones should not be green.
- Reports the beta honestly: goal creation at 31% is below the 40% target and tickets at 22 per 1,000 exceed the limit of 15. Positives (deposit size ₩115,000 vs ₩100,000, retention) are presented without spin, and the ticket themes are linked to fixes.
- Ends with a clear decision request with options (for example, move the launch to mid-December or January, or a soft launch to a limited audience if Hangyeol Bank allows it, plus budget approval or descoping) and a justified recommendation.
- Keeps to 6–8 slides with a speaker note on each. The deck reads at executive level with the bottom line first, and the note to Hong Gil-dong is factual and non-blaming.

## Card

brief: 팀 리드가 녹색으로 보고한 저축 기능의 운영위원회 자료와 이메일, 팀 리드 메모를 작성한다.
given:
- 프로젝트 개요: 2026년 12월 1일 출시, 10개월 중 7개월 경과, 제휴 은행의 4주 검토 규정
- 마일스톤: 계획일과 현재 전망이 있는 5개, 모두 녹색
- 예산: 승인 예산, 현재까지 집행액, 월 집행 속도, 보고된 완료 시점 예상액
- 베타 결과: 사용자 2,400명의 지표 4개와 목표, 상위 문의 유형
asked:
- 6~8장 발표 자료: 결론 먼저, 정직한 RAG 상태, 선택지와 권고안을 담은 의사결정 요청
- 자료와 함께 보낼 이메일(약 250자 이내)
- 홍길동 님께 보내는 메모(약 200자 이내): 바꾼 상태와 그 이유
limit: 약 2,500자 이내, Markdown, 슬라이드별 발표자 노트 포함
hard: 현황 보고를 명시된 규정과 수치로 검증하고, 나쁜 소식을 경영진에게는 분명히, 작성자에게는 배려 있게 전해야 한다.

## Scorecard

- Recomputes forecast at completion ≈ ₩865M (₩610M + 3 × ₩85M), not ₩790M: ≈ ₩65M (8%) over
- Compliance pack 14 Nov plus 4-week review puts earliest launch ≈ 12 Dec; those milestones not green
- Reports beta misses honestly: goal creation 31% vs 40% target, tickets 22 vs ≤15 per 1,000
- Presents deposit size (₩115,000 vs ₩100,000) and retention without spin; links ticket themes to fixes
- Ends with a decision: options (mid-December or January, soft launch, budget or descoping) and a recommendation
- 6–8 slides with speaker notes, bottom line first; the note to Hong Gil-dong is factual and non-blaming

## Scorecard, shown

- 완료 시점 예상액을 약 8억 6,500만 원(6억 1,000만 + 3 × 8,500만)으로 재계산, 7억 9,000만 원 아님: 약 6,500만 원(8%) 초과
- 11월 14일 제출 후 4주 검토로 최단 출시는 약 12월 12일, 해당 마일스톤은 녹색이 아님
- 베타 미달을 정직하게 보고: 목표 생성 31%(목표 40%), 1,000명당 문의 22건(기준 15건 이하)
- 첫 입금액(11만 5,000원 대 10만 원)과 리텐션을 과장 없이 제시하고 문의 유형을 개선책과 연결
- 의사결정 요청으로 마무리: 선택지(12월 중순 또는 1월, 제한 출시, 예산 승인 또는 범위 축소)와 권고안
- 발표자 노트가 있는 6~8장, 결론 먼저, 홍길동 님께 보내는 메모는 사실 중심이며 비난하지 않음
