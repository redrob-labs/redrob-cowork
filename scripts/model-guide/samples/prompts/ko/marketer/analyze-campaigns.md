---
profession: marketer
task: analyze-campaigns
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 아웃도어 용품 자사몰(D2C) 브랜드 리지백아웃피터스의 마케팅 분석가입니다. '가을 신상 런칭' 캠페인은 2025년 7월 1일부터 9월 30일까지 진행되었습니다. CMO의 이사회 보고 슬라이드 초안에는 이렇게 적혀 있습니다. **"가을 신상 런칭: 전환 2,480건, 매출 3억 2,150만원, ROAS 2.37배 달성."** 결과를 분석하고 4분기 예산 배분을 제안하세요.

**광고 플랫폼 리포트 (각 플랫폼 자체 집계, 금액은 부가가치세 제외)**

| 채널 | 광고비 | 플랫폼 전환 | 플랫폼 매출 | 리포트 기간 |
|---|---|---|---|---|
| 메타(인스타그램·페이스북) | 42,000,000원 | 610 | 79,300,000원 | 7/1 – 9/30 |
| 네이버 검색광고 | 36,000,000원 | 540 | 75,600,000원 | 7/1 – 9/30 |
| 구글 실적 최대화(PMax) | 28,000,000원 | 470 | 61,100,000원 | 7/1 – 9/30 |
| 카카오모먼트 | 18,000,000원 | 220 | 24,200,000원 | 7/15 – 10/14 |
| 제휴 마케팅(어필리에이트) | 9,000,000원 | 260 | 33,800,000원 | 7/1 – 9/30 |
| CRM(이메일·카카오톡 채널 메시지) | 2,500,000원 | 380 | 47,500,000원 | 7/1 – 9/30 |

**카페24 주문 중 캠페인 태그 주문, GA4 마지막 클릭 채널 기준, 7/1 – 9/30**

| GA4 채널 | 주문 | 매출 |
|---|---|---|
| 메타 | 330 | 41,250,000원 |
| 네이버 검색광고 | 420 | 56,700,000원 |
| 구글 PMax | 260 | 33,280,000원 |
| 카카오모먼트 | 90 | 9,900,000원 |
| 제휴 | 210 | 27,720,000원 |
| CRM | 250 | 35,000,000원 |
| 직접 유입 / 자연 검색 | 80 | 9,350,000원 |
| **합계** | **1,640** | **213,200,000원** |

**기타 사실**

- 캠페인 주문의 공헌이익률은 매출원가, 배송비, 결제 수수료를 차감한 후 55%입니다.
- 제휴 '광고비'는 판매 수수료만 포함합니다. 제휴 네트워크는 분기 플랫폼 이용료 4,000,000원을 별도로 청구했습니다.
- 구글 리포트에 따르면 PMax 전환의 35%는 브랜드명 검색어에서 발생했습니다.
- 8월 메타 지역 홀드아웃 테스트(매칭된 10개 시·군에서 3주간 광고 중단) 결과, 광고를 집행한 지역의 전체 주문이 14% 더 많았습니다.
- 카카오모먼트 담당자는 "10월 수치는 아주 작아서 기간 차이는 상관없다"고 말합니다.

**작성할 것 (마크다운 표):**

1. **대사표**: 플랫폼 주장 전환·매출과 카페24 실적 비교, 과대 집계 규모(건수와 %).
2. **채널 성과표**: 채널별 실제 비용(광고비 + 수수료·이용료), GA4 주문, GA4 매출, ROAS, CAC, 공헌이익(매출 × 이익률 − 비용), 판정. 모든 산식을 밝히세요.
3. **이사회 슬라이드용 정정 수치**: 주문, 매출, 통합 ROAS, 총 공헌이익, 정정된 한 문장 헤드라인.
4. **4분기 예산 제안**: 3분기 광고비와 이용료 합계와 같은 총액을 채널별로 재배분, 근거, 그리고 마지막 클릭 기준이 어느 채널을 과소 또는 과대 평가하는지에 대한 메모.
5. **유의 사항과 다음 테스트**: 최대 5개 항목.

ROAS는 소수점 둘째 자리, 금액은 원 단위로 반올림하세요. 분량은 약 2,500자 이내로 하세요.

## A strong answer

- Explains that the CMO's figures add up the platforms' self-reported numbers: 2,480 conversions and ₩321,500,000 against 1,640 actual orders and ₩213,200,000. That is over-attribution of 840 orders (about 51%), and ₩321,500,000 ÷ ₩135,500,000 = 2.37× is not a real ROAS. Also flags that 카카오모먼트's report window doesn't match the campaign period.
- Includes the ₩4,000,000 affiliate fee: true cost is ₩139,500,000. Corrected blended ROAS is ₩213,200,000 ÷ ₩139,500,000 ≈ 1.53×. Contribution is ₩213,200,000 × 55% − ₩139,500,000 = −₩22,240,000, so the campaign lost money on a first-order basis.
- Computes channel ROAS correctly: 메타 0.98, 네이버 검색 1.58, PMax 1.19 (and lower once brand cannibalisation is considered), 카카오모먼트 0.55, 제휴 2.13, CRM 14.00.
- Shows judgement on attribution: uses the Meta holdout to argue that last-click under-credits Meta, discounts PMax for brand queries, and treats 카카오모먼트 as the weakest case. Doesn't cut purely on last-click ROAS.
- The Q4 allocation sums to ₩139,500,000, follows from the scorecard, and proposes specific tests, such as a 카카오모먼트 holdout, PMax with brand exclusions, and a repeat-purchase or LTV view to complement first-order contribution.
