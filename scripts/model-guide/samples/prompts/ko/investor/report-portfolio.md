---
profession: investor
task: report-portfolio
language: ko
deliverable: documents
---

## Prompt

당신은 시더레인벤처스의 CFO입니다. 「시더레인 제2호 벤처투자조합」(2021년 결성, 약정총액 1,200억원)의 2025년 3분기(9월 30일 기준) 조합원(LP) 대상 분기 운용보고서 서한을 작성하세요. 대표 펀드매니저 홍길동이 성과 문구 초안과 평가액 제안을 보냈습니다. 내보내기 전에 조합 장부와 가치평가 정책에 비추어 검토하세요.

**홍길동의 문구 초안**

> "2호 조합은 순항 중입니다. 납입 출자금 810억원 기준 TVPI 1.43배로, 전 분기 대비 상승했습니다."

**조합 장부**

- 납입 출자금(조합원별 출자 원장): 6월 30일 780억원, 9월 30일 780억원. 9월 26일에 30억원 규모의 출자 요청(캐피탈콜) 통지를 발송했으며 납입 기한은 2025년 10월 15일임.
- 누적 분배금: 96억원, 전액 아이온시스템즈 회수분(2024년 M&A로 회수, 투자원가 30억원).
- 누적 관리보수 및 조합 비용: 60억원.
- 분기 말 조합 현금: 없음(전액 투자 완료).

**포트폴리오 및 평가액 제안 (억원)**

| 회사 | 투자원가 | 6/30 공정가치 | 9/30 제안 공정가치 | 3분기 이벤트 |
|---|---|---|---|---|
| 아버페이 | 120 | 300 | 300 | 변동 없음 |
| 브라인로보틱스 | 90 | 90 | 45 | 사업계획 미달. 기존 투자자 대상 브릿지 전환사채(CB), 직전 라운드 주당가격 대비 50% 할인 |
| 클리어패스바이오 | 80 | 80 | 80 | 8월 14일 이사회에서 청산(사업 정리) 결의. 당 조합 몫 예상 회수액 4억원 |
| 도브테일AI | 60 | 60 | 180 | 신규 투자자들이 기업가치 상한(밸류캡) 1,500억원 조건의 조건부지분인수계약(SAFE)으로 투자. 가격이 정해진 라운드 없음 |
| 엠버그리드 | 100 | 140 | 140 | 변동 없음 |
| 패덤랩스 | 70 | 105 | 105 | 변동 없음 |
| 길드인슈어런스 | 80 | 80 | 120 | 외부 신규 투자자가 주도한 시리즈 B(상환전환우선주) 라운드, 당사 투자 단가의 1.5배 |
| 해로우 | 90 | 90 | 90 | 변동 없음 |

**가치평가 정책 (발췌)**

> 투자자산은 공정가치로 평가한다. 독립적인 신규 투자자가 의미 있게 참여한, 가격이 정해진 지분 투자 라운드가 가치의 1차 증거이다. 조건부지분인수계약(SAFE), 전환사채 등 가격이 정해지지 않은 증권만으로는 평가 상향의 근거가 되지 않는다. 청산 결정, 다운라운드, 할인된 브릿지 투자 등 손상 증거가 있으면 평가를 하향한다.

**작성할 것 (마크다운 서한, 다음 제목의 섹션 포함):**

1. 요약
2. 조합 성과: 6월 30일과 9월 30일의 납입 출자금, 분배금, 순자산가치(NAV), TVPI, DPI, RVPI 표(산식 명시)
3. 포트폴리오 현황: 회사별 1~2문장, 정책에 따른 9월 30일 평가액
4. 평가 하향 및 주요 변동 사항을 숨김없이 설명
5. 예정된 출자 요청
6. 전망

서한 뒤에 홍길동에게 보내는 내부 메모(약 300자 이내)를 붙여, 초안 문구와 평가액에서 바꾼 점을 하나씩 설명하세요. 전체 분량은 약 2,500자 이내로 하세요. 배수는 소수점 둘째 자리까지 반올림하세요.

## A strong answer

- Uses ₩78.0B (780억원) of paid-in capital for both quarter-ends. The ₩3.0B call isn't due until Oct 15, so it isn't paid in at Sep 30; the draft's ₩81.0B is wrong. Discloses the call in its own section.
- Applies the policy: holds 도브테일AI at its ₩6.0B cost (the SAFE doesn't justify ₩18.0B), writes 클리어패스바이오 down to about ₩0.4B (not ₩8.0B), and accepts 길드인슈어런스 at ₩12.0B and 브라인로보틱스 at ₩4.5B.
- Computes NAV of ₩94.5B at Jun 30 and ₩86.4B at Sep 30. TVPI is (945 + 96) ÷ 780 = 1.33x at Jun 30 and (864 + 96) ÷ 780 = 1.23x at Sep 30; DPI 0.12x; RVPI 1.21x at Jun 30 and 1.11x at Sep 30 (all in 억원).
- States plainly that TVPI fell this quarter, contradicting the draft's "1.43배 … 전 분기 대비 상승". Explains the 클리어패스 wind-down and the 브라인 markdown candidly and without spin.
- The internal note lists each correction (paid-in capital, the 도브테일 mark, the 클리어패스 mark, the performance line) with the policy reason for each.
