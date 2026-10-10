---
profession: sales
task: update-crm
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 산업용 IoT 진동·온도 센서를 판매하는 '한결센서'의 영업 담당자입니다. 오늘은 **2026년 3월 13일(금)**이고, 분기는 **3월 31일**에 끝납니다. 팀장 김철수 님이 월요일 회의 전에 CRM 정리와 1분기 전망을 요청했습니다. 김철수 님의 질문: "솔봉식품 건, 1분기 수주로 올려도 되나요?"

**단계별 확률 (회사 표준):** 발굴(Discovery) 10%, 솔루션(Solution) 25%, 제안(Proposal) 50%, 협상(Negotiation) 75%, 수주(Closed Won) 100%, 실주(Closed Lost) 0%. CRM 금액 필드는 **원화, 천 원 단위**입니다. 재무팀 전망용 환율은 1유로 = 1,500원입니다.

**CRM 내보내기 (업데이트 전)**

| 기회 | 고객사 | 단계 | 금액(천 원) | 마감 예정일 | 다음 단계 |
|---|---|---|---|---|---|
| O-101 | 바다샘수처리 | 협상 | 112,000 | 2026-03-27 | 법무 수정안 검토 |
| O-102 | 황조제분 | 제안 | 63,000 | 2026-02-27 | 수정 견적 발송 |
| O-103 | 한강화학 | 솔루션 | 160,000 | 2026-06-30 | 현장 실사 |
| O-104 | 솔봉식품 | 협상 | 50,000 | 2026-03-31 | 발주서(PO) 대기 |
| O-105 | 솔봉식품 | 제안 | 50,000 | 2026-04-15 | — |
| O-106 | Eastbrook Packaging GmbH | 제안 | 52,000 | 2026-03-31 | 가격 협의 통화 |
| O-107 | 타이드마크포트코리아 | 발굴 | 280,000 | 2026-03-31 | 첫 미팅 |

**이번 주 활동 (메모, 이메일, 캘린더)**

- **월, 이영희 님(바다샘수처리 구매팀) 통화:** 법무 수정안 합의 완료. 3월 24일 서명 예정. 금액 변동 없음. *캘린더:* "바다샘 서명 통화, 3월 24일(화)."
- **월, 황조제분 박영수 님 이메일:** "범위를 2개 라인으로 줄였습니다. 제안서의 센서 45개 대신 30개로 다시 견적 주세요. 4월 10일까지 결정하겠습니다." 원래 견적은 센서당 단가가 동일한 방식이었습니다.
- **화, 한강화학 현장 실사 완료:** "회계연도가 7월 1일에 시작해서 그 전에는 예산 승인이 안 납니다. 8월에 다시 논의하시죠."
- **수, 내 메모:** "솔봉식품 수주!!" *같은 날 솔봉식품 홍길동 님 이메일:* "좋은 소식입니다. 한결센서로 결정했습니다. 발주서는 사내 결재 중이며 4월 3일까지 발행될 예정입니다. 발행되면 귀사 주문서에 서명하겠습니다."
- **수:** O-105는 솔봉식품이 제품 데이터시트를 내려받으면서 마케팅 자동화로 생성되었습니다.
- **목, Eastbrook 가격 협의 통화:** 보낸 견적은 **52,000유로**였습니다. 3년 가격 옵션을 요청했고 3월 26일 이사회에서 결정할 예정입니다.
- **목, 타이드마크포트코리아(외국계 항만 운영사) Richard Roe 님 첫 미팅:** "2027년 설비 투자 계획을 위해 여러 방안을 살펴보는 중입니다. 아직 예산은 없습니다." 내 메모: "금액은 내 추정치."

**제출물** (마크다운, 약 2,500자 이내):

1. 업데이트한 CRM 표: 같은 열에 가중 금액(천 원)과 "변경 사항 / 사유" 열 추가. 계산된 모든 열의 공식을 밝히고, 금액이나 통화를 다시 계산한 경우 과정을 보여 주세요.
2. 1분기 전망 표: 업데이트 전후 비교, 확정(Commit) / 최선(Best case) / 파이프라인(Pipeline) 범주별. 각 범주를 정의하세요.
3. 발견해서 바로잡은 CRM 관리 문제 목록.
4. 김철수 님께 보내는 회신 (약 250자 이내).

## A strong answer

- Keeps Solbong Foods in Negotiation, not Closed Won, because the PO and the signature are still pending. Moves its close date to about 3 April, which takes it out of Q1, and merges or deletes the duplicate O-105. The reply to Kim Cheol-su says "not in Q1 as won" plainly.
- Re-prices Hwangjo Milling to ₩42,000k (63,000 ÷ 45 = ₩1,400k per sensor × 30) and replaces the past close date with 10 April. Converts Eastbrook's €52,000 to ₩78,000k (the CRM's 52,000 was euros entered in a KRW-thousands field) and keeps it in Q1 given the 26 March decision.
- Moves Hangang Chemical (to Q3) and Tidemark (to a 2027-realistic date) out of Q1, and flags Tidemark's ₩280,000k as an unqualified placeholder.
- The weighted values use Amount × stage probability. The Q1 weighted forecast drops from ₩207,000k (as exported: 84,000 + 31,500 + 37,500 + 26,000 + 28,000) to ₩123,000k (Basaem ₩84,000k + Eastbrook ₩39,000k), with Basaem as Commit.
- The hygiene list covers the past-dated close, the duplicate, the currency mismatch, the guessed amount and the premature Closed Won.
