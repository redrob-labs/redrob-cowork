---
profession: accountant
task: client-advisory
language: ko
deliverable: spreadsheets
---

## Prompt

귀하는 직영 베이커리 3개 점포와 도매 식빵 라인을 운영하는 (주)밀담베이커리의 외부 CFO 자문역입니다. 대표 이영희 님이 목요일 경영회의 전에 2025년 3분기 예산 대비 실적 차이 분석 보고서를 요청했습니다. 경리 담당자의 요약은 다음과 같습니다. "EBITDA가 예산보다 5,350만원 미달했고, 주로 보험료 때문입니다."

**2025년 3분기 손익(원)**

| 항목 | 예산 | 실적 |
|---|---|---|
| 매출 – 도매 | 420,000,000 | 451,200,000 |
| 매출 – 소매 | 610,000,000 | 566,300,000 |
| 원재료비 | 288,400,000 | 312,900,000 |
| 포장재비 | 41,200,000 | 40,700,000 |
| 직접인건비 | 247,200,000 | 261,800,000 |
| 임차료 | 96,000,000 | 96,000,000 |
| 수도광열비 | 38,000,000 | 44,600,000 |
| 광고선전비 | 30,900,000 | 12,400,000 |
| 보험료 | 9,000,000 | 36,000,000 |
| 일반관리비 | 52,000,000 | 49,300,000 |

**운영 데이터**

| 동인 | 예산 | 실적 |
|---|---|---|
| 도매 식빵 판매량 | 168,000개 × 2,500원 | 180,480개 × 2,500원 |
| 소매 거래 건수 | 61,000건 | 55,300건 |
| 소매 객단가 | 10,000원 | 10,240원(반올림) |

**팀 메모**

- 화재·영업배상책임 연간 보험료 3,600만원(보험기간 2025년 7월 1일 ~ 2026년 6월 30일)을 7월에 납부하고 전액 비용 처리했습니다.
- 밀가루 공급계약 단가가 7월 1일부터 9% 인상되었습니다. 원재료비 예산은 매출의 28%로 잡았습니다.
- 동부점은 8월부터 제빵사 2명이 결원이며, 공백은 연장근로(근로기준법상 통상임금의 1.5배 지급)로 메웠습니다.
- 9월로 계획했던 가을 캠페인이 10월로 연기되어, 3,090만원 전액이 4분기에 집행될 예정입니다.
- 7월 1일 소매 판매가를 약 2.5% 인상했습니다. 도매 매출총이익률은 소매보다 약 12%p 낮습니다.
- 수도광열비: 7월부터 새 도시가스 요금이 적용되었고, 서부점 오븐 정비가 늦어졌습니다.

**산출물** (마크다운, 약 2,500자 이내):

1. 항목별 예산, 실적, 금액 차이, % 차이, 유리/불리 구분을 담은 차이 분석표(매출총이익과 EBITDA 소계 포함). 부호 규칙과 각 계산 열의 산식을 명시하십시오.
2. 예산 EBITDA에서 실적 EBITDA로 가는 브리지, 그리고 3분기에 귀속되지 않아야 할 항목을 조정한 "정상화(normalized)" EBITDA와 그 조정 내역.
3. 소매 매출 차이의 가격/물량 분해와 그 방법.
4. 이영희 대표를 위한 코멘트: 주요 차이마다 몇 문장씩, 시점 차이와 실질적인 성과 차이를 구분해서.
5. 우선순위를 매긴 권고사항 3가지. 소매 가격을 한 번 더 올릴지, 도매 물량을 더 밀어붙일지에 대한 의견과 근거를 포함하십시오.

경리 담당자 요약에 오류가 있다면 지적하십시오.

## A strong answer

- Gets gross profit to ₩453,200,000 budget vs ₩402,100,000 actual and EBITDA to ₩227,300,000 budget vs ₩163,800,000 actual, a ₩63,500,000 miss, and corrects the bookkeeper's ₩53,500,000.
- Normalizes insurance: ₩27,000,000 of the premium is prepaid (선급비용), so Q3 expense should be ₩9,000,000 and normalized EBITDA is ₩190,800,000, ₩36,500,000 below budget. The answer also says the ₩18,500,000 marketing underspend is timing, not a saving.
- Splits retail roughly into volume (5,700 fewer transactions × ₩10,000 = −₩57,000,000) and price/mix (about +₩13,300,000), totalling −₩43,700,000.
- Explains the ingredient overrun as about ₩28,000,000 above 28% of actual revenue (₩284,900,000), consistent with the flour repricing, and names the labor overtime driver (1.5× premium; may also flag the 주 52시간 limit as a constraint on covering vacancies with overtime).
- Recommendations follow from the data. The answer notices that growing wholesale volume lowers margin while retail traffic is falling, and keeps the sign convention consistent throughout.
