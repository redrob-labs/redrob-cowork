---
profession: accountant
task: financial-statements
language: ko
deliverable: documents
---

## Prompt

벤처캐피탈 투자를 받은 SaaS 기업 (주)루멘와이즈(비상장, 12월 결산, K-IFRS 자발적 적용, 재무제표 발행승인 예정일 2025년 3월 31일)의 2024년 12월 31일 기준 재무제표를 작성해 주십시오. 아래 수정후시산표와 사실관계를 사용하십시오.

**수정후시산표, 2024년 12월 31일(단위: 백만원)**

| 계정 | 차변 | 대변 |
|---|---|---|
| 현금및현금성자산 | 1,467 | |
| 매출채권 | 386 | |
| 손실충당금 | | 24 |
| 선급비용 | 58 | |
| 대여금, 홍길동(대표이사) | 75 | |
| 유형자산(순액) | 142 | |
| 사용권자산(사무실 리스) | 310 | |
| 무형자산 – 자체개발 소프트웨어(순액) | 220 | |
| 매입채무 | | 118 |
| 미지급비용 | | 164 |
| 계약부채(선수수익) | | 1,020 |
| 리스부채 | | 336 |
| 전환사채 | | 1,500 |
| 전환사채 미지급이자 | | 90 |
| 자본금 및 주식발행초과금 | | 4,200 |
| 결손금, 2024년 1월 1일 | 3,180 | |
| 매출 | | 3,460 |
| 매출원가 | 1,040 | |
| 연구개발비 | 1,620 | |
| 판매비(영업·마케팅) | 1,380 | |
| 일반관리비 | 910 | |
| 이자비용 | 120 | |
| 법인세비용 | 4 | |
| **합계** | **10,912** | **10,912** |

**재무팀장 이영희 님이 전달한 사실관계**

- 계약부채에는 2025년 12월 31일 이후 용역 기간에 해당하는 280백만원(다년 선납 계약)이 포함되어 있습니다.
- 리스부채 중 96백만원은 12개월 이내에 지급 기일이 도래합니다. 사무실 리스는 2028년 6월 30일까지입니다.
- 전환사채: 2024년 4월 1일 1,500백만원 발행, 표면이자율 8% 단리, 현금 이자 지급 없음, 적격 투자유치 시 전환되지 않으면 원리금을 2026년 6월 30일에 일시 상환. 2024년 중 다른 차입금은 없었습니다.
- 대표이사 대여금은 2024년 9월에 지급되었으며 무담보·무이자이고 상환기일이 없습니다. 이사회 승인(상법 제398조)은 받지 않았습니다.
- 영업 현금 소진액은 월평균 140백만원이며 앞으로도 비슷할 것으로 예상됩니다. 시리즈 A 텀시트를 협의 중이나 서명되지 않았습니다.
- 2025년 2월 12일, 루멘와이즈의 최대 고객(2024년 매출의 18%)이 2025년 5월 계약 만료 시 갱신하지 않겠다고 통보했습니다.

**산출물** (마크다운, 약 2,500자 이내):

1. 유동/비유동 구분 재무상태표와 포괄손익계산서(백만원 단위, 합계 일치).
2. 간결한 주석: (a) 계속기업, (b) 수익 및 계약부채, (c) 리스, (d) 전환사채, (e) 특수관계자, (f) 보고기간후사건.
3. 재무제표 발행 전에 이영희 님에게 확인할 미결 사항 목록. 시산표가 사실관계와 맞지 않는 부분과 그에 대한 처리 제안을 포함하십시오.

대표이사 대여금과 미지급이자의 분류 등 표시에 관한 판단을 내렸다면 그 내용과 이유를 명시하십시오.

## A strong answer

- Net loss is ₩1,614m (3,460 − 5,074). Total assets of ₩2,634m equal liabilities of ₩3,228m plus a capital deficit (자본잠식) of ₩594m (4,200 − 3,180 − 1,614).
- Splits the contract liability into ₩740m current and ₩280m noncurrent and the lease liability into ₩96m current and ₩240m noncurrent. The convertible notes and accrued interest are noncurrent under K-IFRS 1001, since they are due 30 June 2026, more than 12 months after the reporting date, and the answer says so (it may also flag the K-IFRS 1032 liability/equity or embedded-derivative assessment of the conversion feature as an open item).
- Notices that note interest should be ₩90m (1,500 × 8% × 9/12), not the ₩120m booked, and raises the ₩30m difference as an open item with a proposed reclassification or correction.
- Concludes there is a material uncertainty about going concern (K-IFRS 1001.25): about 10.5 months of runway (₩1,467m ÷ ₩140m) inside the 12-month assessment window, the customer loss and no signed term sheet. Discloses management's plans without saying the uncertainty is resolved.
- Treats the CEO loan as a related-party disclosure (K-IFRS 1024). Questions its classification (noncurrent, or a possible deduction from equity) and flags the missing board approval under 상법 제398조 (and the 가지급금 인정이자 tax exposure). The customer loss is a non-adjusting event after the reporting period (K-IFRS 1010).
