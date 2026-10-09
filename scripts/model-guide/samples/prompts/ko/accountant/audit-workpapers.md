---
profession: accountant
task: audit-workpapers
language: ko
deliverable: documents
---

## Prompt

귀하는 중견 정밀가공 부품 제조사인 (주)청람정밀의 2024 회계연도 외부감사(K-IFRS 적용, 회계감사기준 준거)를 맡은 현장책임 시니어입니다. 감사계획은 "지출은 적정한 전결권자의 승인과 3-way 매칭(발주서·입고증·세금계산서)을 거친 후에 지급된다"는 통제에 의존하여 비용 항목의 실증절차를 축소하도록 설계되어 있습니다. 1년차 스태프 박영수 회계사가 이 통제를 테스트하고 결과를 남겼습니다. 조서를 완성해 주십시오.

**회사 전결규정(발췌)**

> 건당 500만원 이하: 운영팀장. 500만원 초과 2,500만원 이하: 본부장. 2,500만원 초과: CFO. 승인은 지급 전에 완료되어야 한다. 세금계산서는 발주서(PO) 및 입고증과 일치해야 하며, PO 대비 단가 차이가 5%를 초과하면 해당 금액 구간의 전결권자로부터 재승인을 받아야 한다. 공과금(전기·가스·수도) 및 서면 위임계약이 체결된 전문용역은 PO 요건에서 제외한다.

**모집단 및 계획:** 2024년 상반기 지출 1,240건, 총 89억 6,000만원. 법인 표본추출표(지급 건별로 수행되는 통제): 허용이탈률 10%, 예상이탈 0건, 표본 크기 25건. 박영수 회계사는 무작위 시작점에서 124번째 건마다 추출하는 방식을 사용했고, 10건을 테스트했습니다.

**박영수 회계사의 테스트 결과**

| # | 지급일 | 거래처 | 세금계산서(원) | PO(원) | 승인자 | 승인일 | 3-way 매칭 |
|---|---|---|---|---|---|---|---|
| 1 | 02-06 | (주)솔빛포장 | 4,180,000 | 4,180,000 | 운영팀장 | 02-01 | 일치 |
| 2 | 02-19 | 가람로지스(주) | 12,640,000 | 12,000,000 | 본부장 | 02-12 | 일치 |
| 3 | 03-04 | 청수케미칼(주) | 24,800,000 | 24,800,000 | 본부장 | 02-27 | 일치 |
| 4 | 03-22 | 법무법인 새온누리(법률자문) | 31,500,000 | 해당없음 | CFO | 03-18 | 위임계약서 |
| 5 | 04-10 | (주)솔빛포장 | 3,950,000 | 3,950,000 | 운영팀장 | 04-15 | 일치 |
| 6 | 04-28 | (주)누리아이티서비스 | 18,200,000 | 18,200,000 | 본부장 | 04-20 | 일치 |
| 7 | 05-09 | 은하화물(주) | 7,410,000 | 7,410,000 | 운영팀장 | 05-02 | 일치 |
| 8 | 05-30 | 한별에너지(주)(도시가스) | 2,215,330 | 해당없음 | 운영팀장 | 05-28 | 제외 대상 |
| 9 | 06-14 | 가람로지스(주) | 11,980,000 | 12,000,000 | 본부장 | 06-07 | 일치 |
| 10 | 06-27 | (주)송림툴링 | 9,875,000 | 9,875,000 | 본부장 | 06-21 | 일치 |

박영수 회계사의 결론: "예외사항 없음. 통제는 효과적으로 운영되고 있음."

**거래처 원장 발췌: 청수케미칼(주), 2024년 3월 4일 지급분**

| 세금계산서 | PO | 금액(원) | 승인자 | 승인일 |
|---|---|---|---|---|
| CS-7731 | PO-4410 | 24,800,000 | 본부장 | 02-27 |
| CS-7732 | PO-4411 | 24,600,000 | 본부장 | 02-27 |

두 세금계산서는 모두 동일한 절삭유 원액에 대한 것이며, 같은 날 입고되었습니다.

**산출물:** 마크다운 형식의 감사조서(약 2,500자 이내). 다음 섹션을 포함하십시오: 목적; 모집단과 표본(표본이 충분한지 여부 포함); 테스트한 속성과 결과표(틱마크 범례 포함); 예외사항과 근본 원인; 통제에 대한 결론과 감사계획에 미치는 영향; 경영진 서한(Management Letter) 제안 사항. 박영수 회계사의 결론에 의존하지 말고 직접 재수행하십시오. 판단이 필요한 부분(예: 표본 확대 여부, 미비점의 분류)은 판단 내용과 근거를 명시하십시오.

## A strong answer

- Finds three deviations the staff missed: item 2 (5.33% price variance, more than 5%, with no re-approval), item 5 (approved 04-15, after payment on 04-10) and item 7 (₩7,410,000 approved by the Operations Manager instead of a Division Head). Items 4 and 8 are correctly exempt.
- Notes the sample is undersized (10 tested against the 25 required) and that 3 deviations in 10 already exceed the 10% tolerable rate, so extending the sample cannot rescue reliance.
- Identifies the 청수케미칼 invoices CS-7731 and CS-7732 (₩49,400,000 combined, same goods, same day, same approval) as a likely split to avoid CFO approval, and recommends follow-up, such as a duplicate or split-invoice scan of the population.
- Concludes the control cannot be relied on, says substantive testing of expenses and disbursements must increase, and gives a reasoned classification of the deficiency (at least a significant deficiency, considered for material weakness) to communicate to those charged with governance (감사/감사위원회).
- The workpaper has a tickmark legend, a clear review trail and specific management-letter recommendations.
