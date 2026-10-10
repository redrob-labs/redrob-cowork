---
profession: hr
task: run-performance-reviews
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 코퍼리프헬스소프트웨어(주) 제품개발그룹 담당 HR 비즈니스 파트너입니다. 내일 평가 등급 조정(캘리브레이션) 회의가 있습니다. 아래 팀장 제출안으로 캘리브레이션 워크북을 준비하세요. 제출안과 함께 온 HRBP 요약에는 "인상안 합계는 연봉 총액의 3.4%로 예산 3.5% 이내. 특이사항 없음."이라고 적혀 있습니다.

**평가 등급 가이드 (회사 규정)**

| 등급 | 기준(목표 달성률) | 연봉 인상률 범위 |
|---|---|---|
| 5 | 110% 이상이고 동료평가 평균 4.3 이상 | 5.0~6.0% |
| 4 | 100~109% | 3.5~4.5% |
| 3 | 85~99% | 2.0~3.0% |
| 2 | 70~84% | 0~1.0% |
| 1 | 70% 미만 | 0% |

팀장은 서면 사유를 붙여 기준 등급에서 한 단계까지 조정할 수 있습니다. 출산전후휴가·육아휴직 등 법정 휴가·휴직으로 3개월 넘게 부재한 직원은 실제 근무한 기간만, 그 기간에 비례해 조정한 목표로 평가합니다(남녀고용평등법 제19조 제3항: 육아휴직을 이유로 해고나 그 밖의 불리한 처우를 해서는 안 됨). 인상 예산은 그룹 전체 기본 연봉 총액의 3.5%입니다.

**팀장 제출안**

| ID | 팀 | 팀장 | 기본 연봉(원) | 팀장 등급 | 목표 달성률 | 동료평가 평균(1~5) | 제안 인상률 | 팀장 의견 |
|---|---|---|---|---|---|---|---|---|
| E01 | 플랫폼 | 박영수 | 84,000,000 | 5 | 118% | 4.6 | 6.0% | — |
| E02 | 플랫폼 | 박영수 | 73,500,000 | 5 | 96% | 4.1 | 6.0% | — |
| E03 | 플랫폼 | 박영수 | 68,600,000 | 5 | 62% | 3.2 | 5.5% | "태도가 아주 좋음" |
| E04 | 플랫폼 | 박영수 | 78,400,000 | 4 | 101% | 4.3 | 4.5% | — |
| E05 | 데이터 | 이영희 | 91,000,000 | 4 | 109% | 4.4 | 4.0% | — |
| E06 | 데이터 | 이영희 | 66,500,000 | 3 | 92% | 3.8 | 2.5% | — |
| E07 | 데이터 | 이영희 | 61,600,000 | 2 | 해당 없음 | 4.0 | 0.5% | "3~7월 육아휴직, 목표 대부분 미달." 비례 조정 목표 기준 달성률: 103% |
| E08 | 데이터 | 이영희 | 70,700,000 | 3 | 85% | 3.5 | 2.5% | — |
| E09 | 그로스 | 김철수 | 64,400,000 | 3 | 104% | 4.2 | 2.5% | — |
| E10 | 그로스 | 김철수 | 69,300,000 | 4 | 97% | 3.9 | 4.0% | "당초 목표에 없던 결제 시스템 이전을 주도" |
| E11 | 그로스 | 김철수 | 60,200,000 | 2 | 71% | 2.9 | 1.0% | — |
| E12 | 그로스 | 김철수 | 77,000,000 | 3 | 88% | 3.6 | 3.0% | — |

**작성할 것 (마크다운 표):**

1. **캘리브레이션 표**: 직원별 한 행. 제출 등급, 가이드 기준 등급, 차이, 플래그(정상 / 사유 필요 / 규정 위반), 권고 등급과 인상률, 인상액(원), 한 줄 근거.
2. **예산 표**: 연봉 총액, 예산(원), 제출안 인상액 합계(원 및 연봉 총액 대비 %), 권고안 합계(원 및 %).
3. **팀장별 패턴 표**: 팀장별 제출 등급 평균과 기준 등급 평균.
4. **진행 가이드**: 회의 진행자를 위한 최대 8개 항목. 논의할 사례와 각 팀장에게 던질 질문.

계산 열마다 산식을 밝히세요(예: 인상액 = 기본 연봉 × 인상률). 권고안은 예산과 등급별 인상률 범위를 모두 지켜야 합니다. 팀장 등급을 바꾸는 경우, 확정적인 규정 위반인지 논의용 권고인지 구분해 적으세요. 분량은 약 2,500자 이내로 하세요.

## A strong answer

- Computes payroll correctly as ₩865,200,000, the budget as ₩30,282,000 and the submitted total as ₩31,423,000 (3.63%). Calls out the HRBP summary's "3.4%, within budget" as wrong: the submissions are ₩1,141,000 over.
- Flags E07 as a firm policy issue. She must be rated on pro-rated goals (103%, which anchors at 4), not marked down for 육아휴직, and her merit should be raised to match; rating her down would also be a prohibited 불리한 처우 under 남녀고용평등법 §19③.
- Flags E03 (5 at 62% goal attainment, an anchor of 1, with no valid justification) and E02 (5 at 96%, an anchor of 3, two levels above with no note). Identifies 박영수's leniency pattern in the manager table.
- Handles the one-level deviations with judgement: E10's 4 has a justification and can stand for discussion, and E09 looks under-rated at 3 against a 104% anchor of 4.
- The recommended plan totals no more than ₩30,282,000, keeps every merit % inside its rating's range, and every merit amount equals base × %.
