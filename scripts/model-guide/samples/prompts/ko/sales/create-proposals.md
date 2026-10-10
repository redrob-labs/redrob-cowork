---
profession: sales
task: create-proposals
language: ko
deliverable: presentations
---

## Prompt

당신은 호텔용 투숙객 메시징 SaaS '게스트톡'(체크인 전 안내, 투숙 중 채팅, 업셀링)의 영업 대표입니다. 서울·부산·제주에 호텔을 운영하는 '해솔호텔앤리조트'에 제출할 제안서 발표 자료를 만드세요. 최종 발표 대상은 이영희 COO와 박영수 CFO입니다. 동료 김철수 님이 지난주 슬라이드 일부를 작성했으며, 그 주장들은 아래에 있습니다.

**RFP 요약 (해솔호텔앤리조트)**

- 제2조 포트폴리오: 호텔 12곳, 객실 2,160실.
- 제4조 요구사항: 카카오톡 및 SMS 메시징, 자사 PMS(스텔라 PMS) 연동, 다국어 자동 번역, **"온프레미스 구축 및 데이터 국내 저장"**, SSO.
- 제6조 상업 조건: 원화 견적, 3년 계약 선호.

**디스커버리 미팅 메모 (이영희 COO 미팅)**

- "저희는 호텔이 14곳이에요." 그중 2곳은 2027년 2분기 개관 예정이며 두 곳 합쳐 약 300실입니다.
- 프런트데스크가 전 호텔 합계 월 약 9,000건의 전화를 받으며, 평균 통화 시간은 4분입니다. 프런트 인건비(4대 보험 등 포함 총비용)는 시간당 25,000원입니다.
- 불편 사항: 단순 문의 전화가 많음, 업셀링 프로세스가 없음.

**게스트톡 사실 정보**

- 클라우드 전용(멀티테넌트). 데이터는 서울 리전에 국내 저장. ISMS-P 인증. 스텔라 PMS 기본 연동. SAML 기반 SSO. 카카오톡, SMS, 40개 언어 자동 번역.
- 기존 고객 벤치마크: 단순 문의 전화의 약 35%가 메시징으로 전환됩니다.
- 해솔 호텔 1곳 파일럿(90일): 업셀 매출이 판매 객실 1박당 평균 1,500원. 그룹 평균 객실 점유율은 72%.

**가격표 및 할인 정책 (부가세 별도)**

| 항목 | 가격 |
|---|---|
| 구독료 | 객실당 월 8,000원 |
| 구축비 | 호텔당 200만 원, 1회 |

- 물량 할인: 2,000실 이상 10%. 다년 할인: 3년 약정 시 5%. 할인은 합산하며 정가 기준으로 적용합니다.
- 영업 대표는 총 **20%**까지 할인을 승인할 수 있습니다. 20% 초과 또는 구축비 면제는 영업 VP 승인이 필요합니다.

**김철수 님 초안의 주장**

> "프런트 인건비 연 3억 원 절감." "한 달이면 투자비 회수." "RFP 요구사항 전부 충족." "이번 분기에 마감하게 30% 할인 제시합시다."

**제출물** (마크다운, 약 2,500자 이내):

1. 8~10장 분량의 발표 자료를 슬라이드별로 작성 (`### Slide n: 제목`, 슬라이드당 글머리표 3~5개, 한 줄 발표자 노트). 고객 문제, 솔루션, RFP 충족 현황 요약, ROI, 가격, 다음 단계를 포함하세요.
2. 정가, 각 할인, 연간 순 구독료, 구축비, 3년 총 계약 금액을 보여 주는 가격 슬라이드 또는 표. 각 줄의 계산 방법을 밝히세요.
3. 계산 과정과 가정을 명시한 ROI 슬라이드.
4. 김철수 님과 영업 VP에게 보내는 내부 메모 (약 300자 이내): 초안의 주장과 할인에 대해.

## A strong answer

- Prices the 12 live properties and 2,160 rooms. It flags the "14 hotels" versus 12 discrepancy and offers the two 2027 openings (about 300 rooms) as an option or a co-terminated add-on.
- The pricing math is right: list price ₩207,360,000/year (2,160 × ₩8,000 × 12). With 10% volume + 5% multi-year (15%), the net is ₩176,256,000/year. Implementation is ₩24,000,000 (12 × ₩2,000,000). The 3-year subscription value is ₩528,768,000, or ₩552,768,000 including implementation (VAT extra).
- Doesn't offer 30%. Stays within the AE's 20% authority, or explicitly says that anything more needs VP approval and gives a rationale.
- Corrects the labour savings to about ₩63,000,000/year (9,000 × 35% × 4 min ÷ 60 × ₩25,000 × 12), not ₩300M. Treats the upsell estimate (about ₩851M/year gross at ₩1,500 × 2,160 rooms × 365 × 72%) as revenue, not profit, extrapolated from one property's pilot. Revises "payback in one month" accordingly (labour savings alone don't even cover the ₩176M net annual subscription).
- Says honestly that the "on-premise" requirement is not met (the product is cloud-only, with Korean data residency in the Seoul region) and doesn't claim full RFP compliance.
