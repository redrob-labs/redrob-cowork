---
profession: investor
task: research-companies
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 마로앤핀치캐피탈의 수석심사역입니다. 상업용 주방에 음식물 쓰레기 측정 솔루션(배출구에 카메라와 저울을 설치하고 분석 소프트웨어 제공)을 판매하는 시드 단계 스타트업 '웨이스트와이즈'를 검토하고 있습니다. 파트너 회의 전에 근거를 댈 수 있는 국내 시장 규모와 경쟁사 현황이 필요합니다. 조사 결과는 다음과 같습니다.

**[1] 외식업 사업체 현황 2024 (업종 협회 보고서)**
> 전국 음식점 사업장 742,000개: 풀서비스(테이블 서비스) 식당 38%, 한정 서비스(패스트푸드·프랜차이즈 간편식·카페) 52%, 기타(주점, 푸드트럭) 10%.

**[2] 단체급식 산업 리뷰 2024**
> 전국 집단급식소 약 52,000개: 병원, 대학, 기업 구내식당, 학교 급식 조리장.

**[3] 웨이스트와이즈 회사 블로그, "우리가 웨이스트와이즈를 만든 이유" (2025)**
> "음식물 쓰레기 테크는 4조 2천억원 시장입니다." (각주는 수거·퇴비화·혐기성 소화를 포괄하는 글로벌 음식물 폐기물 관리 시장 보고서를 인용)

**[4] 애널리스트 노트, 그린라인리서치, 2025년 5월**
> 음식물 쓰레기 측정 소프트웨어 보급률은 국내 풀서비스 식당의 약 3%, 집단급식소의 약 11%. 한정 서비스 프랜차이즈는 대부분 가맹본부가 지정한 재고관리 도구를 사용하며 "단기적으로 구매 고객이 아님".

**[5] 가격 페이지 및 기사**
> - '빈사이트'(기존 1위 사업자): 매장당 월 190,000원 (가격 페이지, 2025).
> - '키친레저': 주방당 연 3,000,000원 + 하드웨어 키트 1회 2,000,000원 (가격 페이지, 2025).
> - '스크랩리스': "월 129,000원" (테크와이어 기사, 2021). 스크랩리스 가격 페이지, 2025: "매장당 월 230,000원부터".
> - 웨이스트와이즈: 매장당 연평균 계약금액 2,700,000원 (회사 데이터룸).

**[6] 투자 유치 뉴스**
> - 스타트업와이어(뉴스 큐레이션, 2025): "키친레저, 400억원 시리즈 B 유치."
> - 키친레저 보도자료(2025년 3월 12일): "키친레저, 오처드레인파트너스 주도로 140억원 시리즈 B 클로징."
> - 빈사이트: "220억원 시리즈 C" (보도자료, 2023). 스크랩리스: "20억원 시드" (보도자료, 2022).

**[7] 웨이스트와이즈 데이터룸**
> 운영 중인 매장 410개, 그중 70%가 집단급식소. 최근 12개월 고객사(로고) 이탈률 14%, 대부분 개인 운영 풀서비스 식당.

**작성할 것 (마크다운 표):**

1. **시장 규모**: 상향식(bottom-up) 국내 TAM과 SAM, 그리고 현재 시장(현재 보급률 × 가격). 각 행에 입력값과 산식을 적으세요. TAM과 SAM에 어떤 세그먼트를 넣을지 정하고 근거를 대세요. 단일 혼합 가격을 사용하고 산출 방법을 보여 주세요.
2. **하향식(top-down) 교차 검증**: 출처 [3]을 쓸 수 없는 이유와, 이를 맞추려면 무엇이 필요한지 1~2줄.
3. **경쟁사 표**: 회사, 가격(매장당 연 환산, 출처 연도 포함), 하드웨어 모델, 최근 투자 유치(수치에 대한 신뢰도 포함), 웨이스트와이즈에 주는 시사점.
4. **출처 신뢰도**: 출처별 상·중·하 평가와 한 줄 근거.
5. **창업자에게 물을 질문**: 최대 5개.

시장 수치는 1억원 단위로 반올림하세요. 분량은 약 2,500자 이내로 하세요.

## A strong answer

- Builds the market bottom-up from 742,000 × 38% = 281,960 full-service locations plus 52,000 institutional kitchens = 333,960 locations. With a blended price of about ₩2.6–2.75M a year (e.g. the average of ₩2.28M, ₩2.76M, ₩3.0M and ₩2.7M ≈ ₩2.685M), the domestic TAM is about ₩8,683–9,184억 (≈ ₩8,967억, or about ₩0.9조, at ₩2.685M). Excludes limited-service from SAM, citing [4].
- Computes the current market from penetration: 281,960 × 3% ≈ 8,459 plus 52,000 × 11% = 5,720, about 14,200 locations, which is roughly ₩369–390억 a year at the blended price.
- Rejects the ₩4.2조 figure because it is global, covers hauling, composting and digestion rather than software, and is quoted by the company itself.
- Annualizes prices correctly (빈사이트 ₩190,000 × 12 = ₩2,280,000; 스크랩리스 ₩230,000 × 12 = ₩2,760,000, with the 2021 ₩129,000 discarded as stale; 키친레저 ₩3,000,000 plus a one-off ₩2,000,000 hardware kit). Treats 키친레저's Series B as ₩140억 from the primary press release, not the aggregator's ₩400억.
- Draws a judgement from the data, for example that 웨이스트와이즈's institutional skew suits the higher-penetration, lower-churn segment, and that its 14% churn among independent restaurants questions whether full-service belongs in SAM. Turns that into a founder question.
