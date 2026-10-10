---
profession: marketer
task: run-messaging-campaigns
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 국내 밀키트 정기구독 서비스 라더앤바인의 라이프사이클 마케팅 매니저입니다. 60~180일 전에 구독을 해지한 고객 대상 재구독(윈백) 캠페인을 CRM팀이 바로 등록할 수 있게 설계하세요. 발송 시작일은 2026년 1월 6일 화요일입니다.

**CRM 추출: 해지 사유별 이탈 구독자**

| 세그먼트 | 해지 사유 | 고객 수 | 이메일 수신 동의 | 문자(SMS) 수신 동의 |
|---|---|---|---|---|
| A | 가격 부담 | 8,400 | 7,980 | 2,100 |
| B | 바쁨 / 출장·여행 | 5,200 | 4,940 | 1,560 |
| C | 음식 품질 불만 | 1,900 | 1,710 | 380 |
| D | 배송 불가 지역으로 이사 | 1,100 | 1,045 | 220 |
| E | 사유 미기재 | 3,400 | 3,060 | 680 |
| | **합계** | **20,000** | **18,735** | **4,940** |

**CRM팀 메모**

- 이메일 수신 동의 열은 전사 발송 제외 목록(하드 바운스, 전체 수신 거부)을 적용하기 전에 추출되었습니다. 수신 동의 주소 중 615건이 제외 대상입니다: A 260, B 150, C 90, D 40, E 75. D의 40건은 모두 대전·세종 밖입니다.
- 2025년 10월 1일부터 새벽배송 권역이 대전·세종으로 확대되었습니다. D 중 260명이 대전·세종 우편번호이며, 이 중 248명이 이메일, 52명이 문자 수신 동의자입니다. 나머지 D는 여전히 배송 불가 지역입니다.
- 문자 수신 동의자는 모두 이메일 수신 동의자이기도 하며 제외 목록에 없습니다.
- 야간(오후 9시~다음 날 오전 8시) 광고 수신에 별도 동의한 고객은 없습니다.

**업무 규칙**

- 매니저 요청: "첫 박스 50% 할인에 디저트 평생 무료. 크게 갑시다."
- 재무: 재구독 고객 1인당 총 혜택 비용은 18,000원을 넘을 수 없음. 첫 박스 평균 금액 64,000원. 디저트 추가 원가는 박스당 3,000원.
- 고객당 혜택은 하나만, 중복 적용 불가.
- 정보통신망법 제50조 및 시행령(요약): 오후 9시부터 다음 날 오전 8시까지 광고성 정보를 보내려면 별도의 사전 동의가 필요하다. 광고성 정보에는 시작 부분에 "(광고)"와 전송자 명칭을 표시하고, 수신 거부 방법(문자는 무료 수신 거부 전화번호 등)을 밝혀야 한다. 이메일은 제목 시작에 "(광고)"를 표시한다.
- 문자는 단문(SMS) 90바이트 이내(한글 2바이트, 영문·숫자·공백·기호 1바이트). 무료 수신 거부 번호는 080-000-0000을 자리표시자로 사용.
- 9월부터 신메뉴가 도입되었고 품질 불만이 35% 감소했습니다(QA 보고서).
- 과거 윈백 재구독률: 이메일만 발송한 시퀀스는 대상자의 2.1%, 이메일+문자 시퀀스는 대상자의 3.4%.

**작성할 것 (마크다운 표):**

1. **대상자 표**: 세그먼트별로 제외 목록과 배송 권역 규칙을 적용한 이메일 발송 대상 수와 문자 발송 대상 수, 각 열의 산식.
2. **시퀀스 계획**: 발송 회차별 한 행. 단계, 발송일(1월 6일 기준 상대 일자), 채널, 세그먼트, 발송 시간대, 제목 또는 문자 문구(문자는 90바이트 이내, 바이트 수 표기), 프리헤더, 혜택, CTA, 종료 조건.
3. **혜택 표**: 세그먼트별 혜택, 재구독 고객 1인당 비용, 재무 기준 통과 여부. 매니저 제안도 한 행으로 포함.
4. **예측**: 세그먼트별 및 전체 예상 재구독 수와 총 혜택 비용, 산식 포함.
5. **QA 체크리스트**: CRM팀용 최대 6개 항목.

분량은 약 2,500자 이내로 하세요.

## A strong answer

- Applies the suppression list and coverage rules: eligible email A 7,720, B 4,790, C 1,620, D 248 (대전·세종 only), E 2,985, total 17,363. Eligible SMS is 4,772, with D reduced to 52. Excludes the rest of segment D.
- Rejects the manager's offer with the arithmetic: 50% of ₩64,000 is ₩32,000 before dessert, well over the ₩18,000 ceiling. Recommends an offer within the ceiling, for example 25% off the first box (₩16,000), and doesn't stack the dessert.
- Tailors by segment: price-led for A, convenience and skip-a-week for B, and a quality-led message for C built on the new menus and the 35% fall in complaints. D-대전·세종 gets a "이제 새벽배송 됩니다" message.
- Forecasts with the correct base: 4,772 × 3.4% ≈ 162 plus (17,363 − 4,772) × 2.1% ≈ 264, about 427 reactivations, at an incentive cost of about ₩6,830,000 at ₩16,000 each.
- SMS texts are 90 bytes or fewer with accurate byte counts, start with "(광고)" and the brand name, include the free opt-out number, and emails start the subject with "(광고)". All sends are scheduled between 08:00 and 21:00 KST, and every sequence has an exit-on-reactivation condition.
