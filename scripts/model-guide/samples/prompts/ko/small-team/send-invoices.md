---
profession: small-team
task: send-invoices
language: ko
deliverable: documents
---

## Prompt

당신은 3인 영상 제작 스튜디오 '돛줄필름'(hello@dotjulfilm.example.com)의 청구·수금을 맡고 있습니다. 오늘은 **2026년 3월 10일**입니다. 오늘 납품한 바람개비자전거 브랜드 필름의 최종 청구서를 발행하고, 연체 미수금을 처리해야 합니다.

**바람개비자전거 작업 계약서 (2026년 1월 28일 체결, 담당자 이영희, ap@baramgaebi.example.com)**

> 고정 대금: 90초 브랜드 필름 1편, 20,000,000원(공급가액). 계약 시 50% 선금, 잔금은 납품 시.
> 변경 요청(추가 작업): 1일 1,500,000원 기준으로 청구. 변경 요청은 **지정 담당자(이영희)의 서면 승인**이 있어야 한다.
> 경비: 이동, 장비 대여, 촬영 허가 비용은 실비에 10% 처리 수수료를 더해 청구한다. 식대는 청구하지 않는다.
> 결제 조건: 청구일로부터 15일 이내. 연체 시 연체 금액에 월 1.5%의 지연이자.
> 모든 금액은 부가세 별도이며, 청구서 금액대로 전자세금계산서를 발행한다.

**바람개비자전거 작업 파일**

| 항목 | 내용 |
|---|---|
| INV-0141 | 선금 10,000,000원 + 부가세 1,000,000원 = 11,000,000원, 2월 2일 입금 |
| CO-1 | 추가 촬영 1일. 2월 20일 이영희 님 이메일 승인 |
| CO-2 | 30초 축약본 추가 제작(0.5일). 3월 3일 김철수 님(바람개비자전거 마케팅 인턴)이 카카오톡 단톡방에서 요청. 이영희 님 승인 기록 없음 |
| 경비 | 드론 대여 700,000원, 차량 유류·통행료 200,000원, 스태프 식대 230,000원, 촬영 허가 수수료 380,000원 (모두 공급가액 기준) |

돛줄필름의 다음 청구서 번호는 INV-0152입니다.

**미수금 현황 (오늘 이전)**

| 청구서 | 거래처 | 금액(부가세 포함) | 결제 기한 | 계약서 지연이자 조항 | 비고 |
|---|---|---|---|---|---|
| INV-0133 | 한잔커피 | 4,600,000원 | 1월 5일 | 있음, 월 1.5% | 독촉 2회 발송(1월 15일, 2월 5일). 회신 없음 |
| INV-0137 | 솔섬군청 | 7,400,000원 | 2월 15일 | 없음 | 6년째 거래처. 작년 메모: "군청 재무과는 계약번호 없는 청구서를 반려함." 계약번호 77-3310이 프로젝트 이메일에 있으나 청구서에는 기재되지 않음 |
| INV-0139 | 제비스튜디오 | 2,500,000원 | 2월 28일 | 있음 | — |

**3월 1일 이후 입금 내역**

| 날짜 | 적요 | 금액 |
|---|---|---|
| 3월 3일 | 제비스튜디오 0193 | 2,500,000원 |
| 3월 6일 | 카드 정산 입금 | 1,240,000원 (스톡 영상 판매) |

**제출물** (마크다운, 약 2,500자 이내):

1. 바람개비자전거 앞 청구서 INV-0152 완성본: 발행처 정보, 청구 대상, 발행일과 결제 기한, 품목(수량, 단가, 금액), 공급가액 합계, 부가세, 합계, 이미 받은 선금, 입금 안내(자리표시자 가능), 조건. 각 줄의 계산 방법을 보여 주세요.
2. 이영희 님께 청구서를 보내면서 CO-2를 처리하는 짧은 이메일.
3. 실제로 독촉해야 하는 연체 청구서별 수금 이메일 (각 약 300자 이내). 거래처와 계약 조건에 맞게 어조를 조절하세요.
4. 오늘 조치 이후의 미수금 표: 청구서별 상태와 다음 후속 조치 날짜.

## A strong answer

- INV-0152 totals **₩14,198,800**: the ₩10,000,000 balance, CO-1 at ₩1,500,000, and billable expenses of ₩1,280,000 (₩700,000 + ₩200,000 + ₩380,000) plus 10% handling (₩1,408,000), for a supply value of ₩12,908,000 plus 10% VAT of ₩1,290,800. Meals (₩230,000) are excluded. It is due 25 March (15 days) and shows the ₩11,000,000 deposit (₩10,000,000 + VAT) as already received.
- Doesn't bill CO-2, because there is no written approval from Lee Young-hee (a KakaoTalk request from an intern doesn't count). The email asks her to approve it (₩750,000 for 0.5 day, plus VAT) so it can be billed separately.
- Doesn't chase Jebi Studio. Matches the 3 Mar ₩2,500,000 deposit to INV-0139 (the reference typo "0193" is likely "0139"), marks it paid or confirms it, and flags the reference mismatch.
- The Hanjan Coffee email is firm and cites the contractual late fee, about ₩138,000 (1.5% × 2 full months on ₩4,600,000, 64 days overdue), with a clear deadline and next step. The Solseom County email is polite, adds no late fee (there's no clause), and re-issues the invoice with contract number 77-3310.
- The invoice is complete and professional: unique number, dates, terms, VAT line, payment details, and figures that add up.
