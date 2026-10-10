---
profession: investor
task: review-diligence
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 사모펀드 운용사 알더로우에쿼티의 딜팀 소속입니다. 알더로우는 키스톤플릿소프트웨어(주)를 ARR 배수 기준 가격으로 인수(경영권 지분 인수)하는 방안을 검토하고 있습니다. 회사 데이터룸에는 "2025년 6월 30일 기준 ARR 21억원"이라고 되어 있고, IR 자료에는 "ARR = 서비스 중인 고객과의 계약상 반복 매출을 연 환산한 금액, 원화 기준"이라고 정의되어 있습니다. 회사의 ARR 명세를 아래 계약 요약 및 청구 데이터와 대사하고, 실사 조정 ARR을 산출하세요.

**회사 ARR 명세 (2025년 6월 30일, 원)**

| # | 고객 | ARR |
|---|---|---|
| C1 | 아틀라스물류 | 420,000,000 |
| C2 | 버치웨이푸드 | 310,000,000 |
| C3 | 코발트광업 | 275,000,000 |
| C4 | 델마교통 | 240,000,000 |
| C5 | 에버그린유틸리티 | 198,000,000 |
| C6 | 페어헤이븐로지스 | 180,000,000 |
| C7 | 그래닛건설 | 150,000,000 |
| C8 | 할시온리테일 | 132,000,000 |
| C9 | 아이언우드아그리 재팬(일본) | 120,000,000 |
| C10 | 주니퍼퀵서비스 | 75,000,000 |
| | **합계** | **2,100,000,000** |

**계약 요약 및 청구 데이터 (법률·재무 실사팀 작성)**

- **C1:** 3년 계약, 2024년 1월 1일 ~ 2026년 12월 31일. 연간 구독료: 1년차 3억원, 2년차 3억 6천만원, 3년차 4억 2천만원.
- **C2:** 연 구독료 2억 6천만원. 별도의 1회성 구축비 5천만원을 2025년 2월에 청구.
- **C3:** 계약 기간 2025년 3월 31일 종료. 4월 10일 갱신 제안서를 보냈으나 미서명. 사용 로그상 5월 1일 이후 로그인 없음.
- **C4:** 연 2억 4천만원, 계약 기간 2027년 12월 31일까지. 제14.2조: "고객은 2025년 9월 30일 이후 언제든지 90일 전 서면 통지로 임의 해지할 수 있다."
- **C5:** 연 1억 9,800만원, 계약 기간 2026년 6월 30일까지. 특이사항 없음.
- **C6:** 정가 월 1,500만원. 주문서: "2025년 12월 31일까지 도입 할인 20% 적용." 2025년 6월 청구액 1,200만원.
- **C7:** 연 1억 5천만원, 계약 기간 2027년 3월 31일까지. 특이사항 없음.
- **C8:** 2025년 6월 20일 계약 체결. 연 구독료 1억 3,200만원, 서비스 개시일 2025년 9월 1일. 아직 온보딩 전.
- **C9:** 엔화 계약: 연 12,000,000엔. 회사는 사업계획 환율(100엔 = 1,000원)로 환산함. 2025년 6월 30일 환율 100엔 = 940원을 사용할 것.
- **C10:** 최소 약정 없음, 사용량 기준 월 청구. 청구액: 4월 475만원, 5월 550만원, 6월 625만원.

**작성할 것 (마크다운 표):**

1. **대사표**: 고객, 회사 ARR, 조정 ARR, 조정액(원), 이슈 유형(예: 단계적 인상, 1회성 매출, 이탈, 환율, 미개시, 사용량 기반, 할인, 해지 위험), 조정 근거. 계산 수치마다 산식을 밝히세요.
2. **브리지**: 회사 ARR → 조정 후 서비스 중 ARR, 유형별로. 계약 체결·미개시 ARR은 별도 행으로.
3. **위험 가중 관점**: 현재 ARR로는 유효하지만 향후 12개월 안에 위험이 있는 고객, 사유, 위험에 노출된 ARR.
4. **집중도**: 상위 3개 고객이 조정 ARR에서 차지하는 비중.
5. **투자심의위원회용 요약**: 최대 6개 항목. 회사가 제안한 ARR 6.0배 기준으로 인수가격에 미치는 영향 포함.

판단이 필요한 처리(예: C6, C10)는 대안과 그 영향을 함께 적으세요. 분량은 약 2,500자 이내로 하세요.

## A strong answer

- Makes the core adjustments: C1 to the Year 2 rate of ₩360,000,000 (−₩60,000,000); C2 to ₩260,000,000 (−₩50,000,000 one-time fee); C3 to ₩0, as churned or unrenewed (−₩275,000,000); C9 to JPY 12,000,000 × 9.40 = ₩112,800,000 (−₩7,200,000 FX).
- Treats C8 as contracted-not-live, so ₩0 in live ARR with ₩132,000,000 shown separately, under the deck's own definition. C6 is taken at the current billed ₩144,000,000 (−₩36,000,000) with ₩180,000,000 noted as the alternative after the discount expires. C10 is taken at the 3-month average, ₩5,500,000 × 12 = ₩66,000,000 (−₩9,000,000), noting that management annualized June (₩6,250,000 × 12 = ₩75,000,000) and that usage revenue is uncommitted.
- Arrives at adjusted live ARR of ₩1,530,800,000 (−₩569,200,000, or −27.1%), or ₩1,662,800,000 including C8. The bridge ties exactly to ₩2,100,000,000.
- Flags C4 (₩240,000,000, terminable for convenience after Sep 30, 2025) and C5 (renewal due Jun 2026) as at-risk. Computes the top-3 concentration (C1 + C2 + C4 = ₩860,000,000, about 56.2%), with C1 about 23.5% of adjusted ARR.
- Translates the result into price: at 6.0×, ₩21억 implies ₩126억 against about ₩91.8억 on adjusted ARR, a gap of about ₩34.2억. Recommends how to handle it in Korean SPA terms, such as a re-price, an earn-out tied to C3 or C8, an escrow/holdback, or a 특정 손해배상(special indemnity) for the C3 and C4 exposures.
