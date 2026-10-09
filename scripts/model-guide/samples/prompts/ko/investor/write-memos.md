---
profession: investor
task: write-memos
language: ko
deliverable: documents
---

## Prompt

당신은 스톤브릿지그로스파트너스의 이사(VP)입니다. 국내 치과의원에 클라우드 진료·경영관리 소프트웨어(예약, 전자차트, 건강보험 청구)를 판매하는 몰래리티헬스(주)에 대한 시리즈 B 150억원 투자 건의 투자심의위원회 메모를 작성하세요. 딜 리드 박영수가 아래 자료와 함께 한 줄 요청을 보냈습니다. "투자 추천합시다. 지분 25% 확보합니다."

**재무 요약 (억원, 회사 제시 수치)**

| | 2023 회계연도 | 2024 회계연도 | 최근 12개월(2025년 9월) |
|---|---|---|---|
| ARR(기말) | 70 | 112 | 140 |
| 매출 | 60 | 105 | 132 |
| 매출원가(보고 기준) | 14 | 20 | 25 |
| 매출총이익률(보고 기준) | 76.7% | 81.0% | 81.1% |
| 순소진액 | 61 | 90 | 96 |

주석 4: "2024 회계연도부터 AWS 클라우드 비용(2024년 9억원, 최근 12개월 11억원)은 제품 개발 환경을 지원하므로 연구개발비로 분류한다." 실사 통화에서 엔지니어링팀은 해당 AWS 비용의 약 85%가 운영(프로덕션) 호스팅이라고 확인했습니다.

**코호트별 순매출유지율(NRR, 최근 12개월)**

| 고객 코호트 | 2022 | 2023 | 2024 |
|---|---|---|---|
| NRR | 124% | 112% | 103% |

연간 고객 이탈률은 9%입니다. 최대 고객인 브라이트스마일 네트워크(지점 140개의 네트워크 치과 브랜드, 지점별 개설자는 각각 다르며 IT·구매는 본부가 일괄 계약)가 ARR의 18%를 차지합니다.

**레퍼런스 콜 (요약)**

- 개인 치과 원장: "예약과 건강보험 자격 조회·청구 덕분에 데스크 직원 업무가 하루 두 시간 줄었어요."
- 지역 네트워크 치과(지점 12개): "회사가 커지면서 고객지원이 느려졌어요. 계속 쓰긴 하지만 지켜보고 있습니다."
- 브라이트스마일 네트워크 COO: "잘 쓰고 있어요. CTO를 영입했고, 2026년에 자체 플랫폼 구축을 검토 중입니다."

**텀시트 발췌**

> 투자금: 시리즈 B 상환전환우선주(RCPS) 15,000,000,000원, 투자 전 기업가치(pre-money) 60,000,000,000원. 투자 전 기업가치에는 투자 후 완전희석 기준 주식 수의 10%에 해당하는 미부여 주식매수선택권 풀이 포함된다. 1배 비참가적 잔여재산분배 우선권. 이사 지명권 1석.

현재 미부여 주식매수선택권 풀은 투자 전 완전희석 기준 주식 수의 3%입니다. 2025년 9월 30일 현금: 80억원. 현재 월 순소진액: 약 8억원.

**작성할 것 (마크다운 투심 메모, 다음 제목의 섹션 포함):**

1. 투자 의견(투자 / 조건부 투자 / 투자 보류), 맨 앞에 한 단락
2. 회사 개요와 투자 논리(최대 3개 항목)
3. 핵심 지표 표: 회사 수치에 동의하지 않는 부분은 재작성, 산식 표시
4. 기업가치와 조건: 지분율과 실질 투자 전 기업가치
5. 주요 위험과 완화 방안
6. 계약 체결 전 마무리할 실사 항목
7. 투자하려면 믿어야 할 것

5분 안에 읽을 파트너들을 위해 쓰세요. 분량은 약 2,500자 이내로 하세요.

## A strong answer

- Corrects the ownership: ₩150억 ÷ ₩750억 post-money = 20%, not 25%. Explains the option-pool shuffle: the pool must grow from about ₩18억 (3% of ₩600억) to ₩75억 (10% of ₩750억), so the effective pre-money for existing holders is about ₩543억.
- Restates FY2024 gross margin with production hosting moved back into cost of revenue: (105 − 20 − about 7.65) ÷ 105 ≈ 73.7% (or 72.4% if all ₩9억 is moved). Restates LTM similarly: (132 − 25 − 9.35) ÷ 132 ≈ 74.0%. Flags the reclassification as a quality-of-reporting issue.
- Computes FY2024 ARR growth of 60% and a burn multiple of 90 ÷ 42 ≈ 2.14, and runway of about 10 months (₩80억 ÷ ₩8억). Notes the falling cohort NRR (124% → 112% → 103%).
- Treats 브라이트스마일 (18% of ARR, considering an in-house build) as a top risk, with a specific mitigant or condition, for example a multi-year renewal signed at the network headquarters level before closing, or a valuation adjustment.
- Gives a clear recommendation consistent with the analysis, for example invest with conditions, or pass at these terms. Diligence items tie back to the issues found, such as hosting costs, the 브라이트스마일 contract and support quality.
