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

## Card

brief: 베이커리 대표를 위해 3분기 예산 대비 실적 차이 분석과 정상화 EBITDA를 만들고 경리 요약을 검증합니다.
given:
- 경리 담당자 요약: EBITDA 미달 금액과 그 원인
- 2025년 3분기 손익: 10개 항목의 예산과 실적
- 운영 데이터: 도매 식빵 판매량, 소매 거래 건수와 객단가의 예산과 실적
- 팀 메모: 보험료, 밀가루 단가, 인력 결원, 광고 캠페인, 판매가, 수도광열비에 관한 메모 6개
asked:
- 매출총이익·EBITDA 소계를 포함한 차이 분석표와 부호 규칙, 산식
- 예산→실적 EBITDA 브리지와, 조정 내역을 보인 정상화 EBITDA
- 소매 매출 차이의 가격/물량 분해와 그 방법
- 이영희 대표를 위한 코멘트: 시점 차이와 실질 성과 차이 구분
- 우선순위를 매긴 권고 3가지(소매 가격 추가 인상 대 도매 물량 확대 의견 포함)
limit: 약 2,500자 이내, Markdown
hard: 요약 수치를 검증해야 하고, 이번 분기에 속하지 않는 비용이 섞여 있을 수 있으며, 시점 차이와 성과를 구분하고 가격 대 물량 판단을 내려야 합니다.

## Scorecard

- Gross profit ₩453,200,000 vs ₩402,100,000; EBITDA ₩227,300,000 vs ₩163,800,000, a ₩63,500,000 miss, not ₩53,500,000
- Treats ₩27,000,000 of insurance as prepaid (선급비용): normalized EBITDA ₩190,800,000, ₩36,500,000 below budget
- Calls the ₩18,500,000 marketing underspend timing, not a saving
- Splits retail −₩43,700,000 into volume −₩57,000,000 (5,700 × ₩10,000) and price/mix about +₩13,300,000
- Ties ingredients ~₩28,000,000 over 28% of actual revenue (₩284,900,000) to flour repricing; names overtime (1.5×) behind labor
- Recommendations follow the data: wholesale growth lowers margin as retail traffic falls; one sign convention throughout

## Scorecard, shown

- 매출총이익 예산 4억 5,320만원 대 실적 4억 210만원, EBITDA 2억 2,730만원 대 1억 6,380만원으로 미달액은 5,350만원이 아니라 6,350만원
- 보험료 중 2,700만원을 선급비용으로 보아 정상화 EBITDA 1억 9,080만원, 예산 대비 3,650만원 미달
- 광고선전비 1,850만원 과소 집행은 절감이 아니라 시점 차이로 본다
- 소매 −4,370만원을 물량 −5,700만원(5,700건 × 10,000원)과 가격/믹스 약 +1,330만원으로 분해한다
- 원재료비가 실적 매출의 28%(2억 8,490만원)보다 약 2,800만원 많은 것을 밀가루 단가 인상과 연결하고, 인건비 원인으로 연장근로(1.5배)를 든다
- 권고가 데이터에서 나온다: 소매 방문이 줄어드는데 도매 성장은 마진을 낮추며, 부호 규칙을 끝까지 일관되게 지킨다
