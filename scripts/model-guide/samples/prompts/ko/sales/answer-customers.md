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
