---
profession: sales
task: answer-customers
language: ko
deliverable: none
---

## Prompt

당신은 병·의원용 근무표·출퇴근 기록 SaaS '근태온'의 고객 담당 매니저 김철수입니다. 오늘은 **2026년 2월 20일**입니다. 고객사에서 방금 이 이메일이 왔습니다.

> **보낸 사람:** 이영희, 솔내의원 네트워크 운영이사 (younghee.lee@example.com)
> **제목:** 서비스 교체를 진지하게 검토 중입니다
>
> 김철수 매니저님, 네 가지 말씀드립니다.
> 1. 같은 120석인데 2월 청구서가 480만 원에서 552만 원으로 올랐고, 아무 안내도 없었습니다.
> 2. 2월 3일 장애로 전 지점이 9시간 동안 멈췄습니다. 직원들이 출근 기록을 못 했어요. 한 달 치 전액 환불을 원합니다.
> 3. 근태온이 HL7을 지원하나요? 저희 EMR(메디스크라이브)과 연동되나요? 새로 오신 진료부원장님이 물어보십니다.
> 4. 3월부터 15석을 추가해야 하는데, 원래 단가로 해 주세요.
>
> 이번 주 안에 답을 주세요.

**계약서 발췌 (계약 개시일 2025년 3월 1일, 계약 기간 36개월, 모든 금액 부가세 별도)**

> 제3.1조 이용료: 120석, 석당 월 40,000원, 매월 청구.
> 제3.2조 가격 보장: 석당 단가는 계약 기간 최초 24개월 동안 고정한다.
> 제3.3조 가격 보장 기간 중 추가하는 석은 제3.1조의 석당 단가로 청구한다.

**가격 변경 안내 (전체 고객 발송, 2026년 1월 5일)**

> 2026년 2월 1일부터 신규 계약 및 갱신 계약의 정가는 석당 월 46,000원입니다.

**SLA 발췌**

> 월간 가동률(%) = (해당 월 총 분 − 다운타임 분) ÷ 해당 월 총 분. 다운타임은 핵심 서비스를 사용할 수 없는 상태를 말하며, 성능 저하는 제외한다.
> 서비스 크레딧(해당 월 이용료 대비 비율): 99.9% 미만 → 10%, 99.0% 미만 → 25%, 95.0% 미만 → 50%.
> 크레딧은 장애 발생일로부터 30일 이내에 요청해야 한다. 다운타임에 대한 구제 수단은 크레딧이 유일하다.

**상태 페이지, 2026년 2월 3일 장애 (솔내의원은 서울 리전 사용, 시각은 KST)**

> 13:05~16:45: 서울 리전 핵심 서비스 사용 불가.
> 16:45~18:30: 성능 저하. 누적된 요청을 처리하는 동안 모바일 출퇴근 기록 동기화가 지연됨. 모든 출퇴근 기록은 보존됨.

**제품 문서**

> 근태온은 직원, 근무, 지점 데이터용 FHIR R4 API를 제공합니다. HL7 v2 인터페이스는 없습니다. EMR 기본 연동 기능은 없습니다. 파트너사가 API를 활용해 연동을 개발할 수 있습니다.

**제출물** (마크다운, 약 2,500자 이내):

1. 이영희 님께 보내는 회신 이메일 (약 800자 이내): 네 가지 사항 모두에 구체적인 수치로 답하고, 근태온이 할 수 있는 것과 없는 것을 정직하게 밝히세요.
2. 빌링팀과 고객지원팀에 보내는 내부 메모(글머리표): 처리할 정정 또는 크레딧과 금액, 각각의 계산 근거.
3. 계약 문구를 넘어서 내린 판단이 있다면 그 내용과 이유를 짧게 설명 (약 300자 이내).

## A strong answer

- Recognises that §3.2 price protection runs until 28 Feb 2027. The ₩5,520,000 February invoice (120 × ₩46,000) is therefore a billing error, and the answer commits to correcting it by ₩720,000 back to ₩4,800,000 (VAT extra).
- Calculates the SLA credit from the status page: 220 minutes of downtime in February's 40,320 minutes gives about 99.45% uptime, which earns a 10% credit (about ₩480,000 on the correct ₩4,800,000 fee). The request is within 30 days. The answer explains the gap with the "9 hours" claim (the degraded period isn't downtime under the SLA), invites Lee Young-hee to share her records, and doesn't promise a full-month refund. Any goodwill gesture is labelled and justified.
- Answers the integration question honestly: there is a FHIR R4 API, but no HL7 v2 interface and no native Mediscribe EMR integration. A sensible next step is offered, such as a technical call.
- Confirms the 15 extra seats at ₩40,000 under §3.3: 135 seats and ₩5,400,000 a month (VAT extra) from March.
- The tone is accountable and empathetic without grovelling or blame, and the internal note lists each action with an amount.

## Card

brief: 화난 의원 고객의 가격 인상·장애 환불·연동·추가 석 문의에 정직하게 답하고 내부 조치를 정리한다.
given:
- 고객 이메일: 청구서, 2월 3일 장애, HL7·EMR 연동, 15석 추가에 관한 4가지
- 계약서 발췌: 2025년 3월 1일 개시, 이용료, 가격 보장, 추가 석 단가
- 가격 변경 안내: 2026년 2월 1일부터 적용되는 새 정가
- SLA 발췌: 가동률 공식, 크레딧 구간, 요청 규칙
- 상태 페이지: 서울 리전 2월 3일 장애 경과
- 제품 문서: 제공 API와 연동 범위
asked:
- 이영희 님께 보내는 회신 이메일(약 800자 이내): 네 가지 모두 수치로 답변
- 빌링팀·고객지원팀 내부 메모: 정정과 크레딧, 각각의 계산 근거
- 계약 문구를 넘어선 판단과 그 이유(약 300자 이내)
limit: 약 2,500자 이내, Markdown
hard: 계약서·SLA·상태 페이지를 고객 주장에 정확히 적용해야 하고, 선의의 보상 여부를 판단해 정당화해야 한다.

## Scorecard

- §3.2 fixes price until 28 Feb 2027; ₩5,520,000 invoice is an error, corrected by ₩720,000 to ₩4,800,000
- 220 downtime minutes of 40,320 ≈ 99.45% uptime: 10% credit ≈ ₩480,000; claim within 30 days
- Explains degraded time isn't downtime vs "9 hours", invites her records; no full refund; goodwill labelled, justified
- FHIR R4 API yes; no HL7 v2, no native Mediscribe integration; offers a next step
- 15 extra seats at ₩40,000 under §3.3: 135 seats, ₩5,400,000 a month from March
- Accountable, empathetic tone without grovelling; internal note lists each action with an amount

## Scorecard, shown

- 제3.2조로 2027년 2월 28일까지 단가 고정: 552만 원 청구는 오류, 72만 원 정정해 480만 원
- 다운타임 220분 ÷ 40,320분으로 가동률 약 99.45%: 10% 크레딧 약 48만 원, 30일 이내 요청
- 성능 저하는 다운타임이 아님을 "9시간"과 비교해 설명, 기록 공유 요청, 전액 환불 없음, 선의 보상은 명시·정당화
- FHIR R4 API는 있음, HL7 v2와 메디스크라이브 기본 연동은 없음, 다음 단계 제안
- 제3.3조에 따라 추가 15석은 석당 40,000원: 3월부터 135석, 월 540만 원
- 책임감 있고 공감하되 저자세가 아닌 어조, 내부 메모는 조치별 금액 명시
