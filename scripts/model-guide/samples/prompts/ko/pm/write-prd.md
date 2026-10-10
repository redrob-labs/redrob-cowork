---
profession: pm
task: write-prd
language: ko
deliverable: web
---

## Prompt

당신은 장보기 배송 앱 '담아'의 PM입니다. 장보기 대행 기사(쇼퍼)가 제휴 마트에서 주문 상품을 담습니다. 상품이 품절이면 지금은 쇼퍼가 알아서 대체 상품을 고르고, 고객은 문 앞에서야 그 사실을 알게 됩니다. **앱 내 대체 상품 승인** 기능의 PRD를 작성하세요. 쇼퍼가 대체 상품을 제안하면 고객이 앱에서 승인하거나 거절하고, 고객이 응답하지 않으면 기본값이 적용됩니다.

**현재 데이터 (최근 90일)**

| 지표 | 값 |
|---|---|
| 품절 상품이 1개 이상 포함된 주문 | 11.8% |
| 해당 주문의 평균 품절 상품 수 | 1.7개 |
| 문 앞에서 거절된 대체 상품 | 23% |
| 주문당 쇼퍼 소요 시간 중앙값 (담기 시작~결제) | 34분 |

**파일럿: 앱 푸시 알림 "이 대체 상품을 승인하시겠어요?" (요청 1,200건, 1개 매장)**

| 고객 응답 시간 | 누적 비율 |
|---|---|
| 1분 이내 | 38% |
| 3분 이내 | 61% |
| 5분 이내 | 74% |
| 무응답 (결제 시점까지) | 26%는 응답하지 않음 |

**이해관계자 의견**

> "고객 응답 중앙값이 1분도 안 되니까 60초 타임아웃에 자동 승인이면 충분합니다. 쇼퍼가 마냥 기다릴 수는 없어요." (김철수, 운영 리드)

> "대체 상품이 더 비싸면 대체 상품의 판매가를 받읍시다. 지금은 상위 상품으로 바꿀 때마다 마진이 깎여요." (박영수, 재무)

**고객 이용약관 제7조 3항 (현재 게시 중)**

> "주문하신 상품을 대체하는 경우, 고객님은 주문하신 상품의 가격보다 더 많은 금액을 결제하지 않습니다."

**컴플라이언스 메모**

> 당사 판매 인허가 조건상 연령 제한 상품(주류, 담배)과 의약품은 대체할 수 없으며 환불만 가능합니다.

**제출물** (마크다운, 코드를 제외하고 약 2,500자 이내):

1. 다음 섹션으로 구성된 PRD: 문제, 목표 및 성공 지표(위 데이터의 기준값 포함), 비목표, 사용자 스토리(고객과 쇼퍼), 기능 요구사항, 예외 상황, 미결 질문. 응답 대기 시간과 무응답 시 기본값을 정하고 파일럿 데이터로 둘 다 근거를 대세요. 각 이해관계자 요청을 명시적으로 해결하거나 상위 결정으로 올리세요.
2. 고객용 모바일 승인 화면의 단일 파일 HTML/CSS 프로토타입 (인라인 CSS, 외부 리소스나 라이브러리 없음, JS는 최소화하거나 사용하지 않음). 원래 상품, 제안된 대체 상품, 고객에게 표시되는 가격(원), 승인/거절 버튼, '다른 상품 고르기' 옵션, 남은 시간, 응답하지 않으면 어떻게 되는지를 보여 주세요.
3. 프로토타입 디자인 근거 (약 300자 이내).

## A strong answer

- Rejects the "median under a minute" claim: only 38% respond within 1 minute and the median falls between 1 and 3 minutes, so a 60-second auto-approve would apply the default to most requests. Chooses a window (for example 3–5 minutes, worked into the picking flow) and a default, and justifies both with the cumulative data.
- Flags that charging the higher shelf price conflicts with Terms Article 7(3). Requires that customers never pay more than the ordered item's price, or escalates to Legal for a terms change with prior notice to customers, and does not quietly ship the Finance request.
- Excludes age-restricted (alcohol, tobacco) and pharmaceutical items from substitution (refund only) in the requirements and edge cases.
- Success metrics include the 23% door-rejection baseline and a guardrail on shopper time (34-minute median), plus a response-rate metric.
- The prototype is a self-contained HTML file that renders on its own, shows every required element including the timeout default and KRW prices, and uses accessible patterns (buttons, labels, contrast).
