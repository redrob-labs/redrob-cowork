---
profession: pm
task: plan-roadmap
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 활성 고객사 640곳을 보유한 B2B 현장 출동·AS 일정 관리 SaaS '필드온'의 시니어 PM입니다. 제품 스쿼드 하나의 2026년 하반기 로드맵(3분기: 7~9월, 4분기: 10~12월)을 짜야 합니다. 온콜과 유지보수를 제외하면 스쿼드의 가용 용량은 **분기당 24 엔지니어-주, 하반기 합계 48 엔지니어-주**입니다. 한 항목을 두 분기에 걸쳐 나눌 수는 없으며, 나눈다면 그 이유를 명시해야 합니다.

팀은 RICE로 백로그를 평가합니다. Reach = 분기당 영향을 받는 고객사 수, Impact = 0.25~3 척도, Confidence = 백분율, Effort = 엔지니어-주.

**백로그 (기획 시트에서 내보낸 자료)**

| ID | 항목 | Reach | Impact | Confidence | Effort | 비고 |
|---|---|---|---|---|---|---|
| F1 | 현장 기사용 모바일 앱 오프라인 모드 | 420 | 2 | 80% | 16 | 이탈 고객 인터뷰 최다 요청 |
| F2 | 경로 최적화 v2 | 300 | 3 | 50% | 20 | 신규 지도 API 공급사(F5) 필요 |
| F3 | SAML 기반 SSO | 35 | 1 | 100% | 6 | 한빛에너지서비스(ARR 2억 5,000만 원)와 계약: 2026년 10월 31일까지 적용 |
| F4 | 고객 셀프 예약 포털 | 510 | 1 | 70% | 12 | |
| F5 | 지도 API 공급사 전환 | — | — | — | 8 | 현 지도 API 계약 2026년 12월 31일 만료, 갱신 시 비용 40% 인상 |
| F6 | 청구서 PDF 개편 | 600 | 0.5 | 90% | 3 | |
| F7 | 기사 보유 기술 매칭 | 250 | 2 | 60% | 45 | 스쿼드 리드 추정치, 엔지니어-일 단위로 제출 |

**이해관계자 의견**

> "경로 최적화 v2가 하반기 대표 기능이어야 합니다. 엔터프라이즈 잠재 고객마다 이걸로 제안하고 있어요." (김철수, 영업 담당 VP)

> "SSO가 또 밀리면 안 됩니다. 한빛에너지서비스 계약에 10월 31일을 넘기면 해지할 수 있는 조항이 있어요." (이영희, 고객성공 총괄)

> "엔지니어-주는 주 5일 기준입니다. F5는 인프라 작업이라 고객은 모르겠지만, 연말까지 못 끝내면 인상된 요금을 내거나 지도를 못 쓰게 됩니다." (박영수, 엔지니어링 매니저)

**제출물** (마크다운, 약 2,500자 이내):

1. RICE 입력값별 열, 정규화한 Effort 열, RICE 점수를 포함한 백로그 평가 표. 계산된 각 열의 공식을 밝히세요. RICE 점수를 매길 수 없는 항목은 별도 범주로 다루고 어떻게 처리했는지 설명하세요.
2. 분기별 하반기 계획 표: 포함 항목, Effort, 분기별 및 하반기 전체 용량 점검(사용량 대비 가용량).
3. 하반기에 들어가지 못한 항목 목록과 항목별 한 줄 사유.
4. 김철수 님과 이영희 님께 계획을 설명하는 짧은 메모 (약 500자 이내). 남은 마지막 용량을 두고 경쟁하는 항목 사이에서 내린 핵심 트레이드오프와, 판단을 바꿀 수 있는 조건을 밝히세요.

## A strong answer

- Converts F7 from 45 engineer-days to 9 engineer-weeks, giving a RICE of about 33.3 (not about 6.7), and states RICE = Reach × Impact × Confidence ÷ Effort. The other scores are F6 90.0, F1 42.0, F4 29.75, F2 22.5 and F3 about 5.8.
- Schedules F3 SSO in Q3 (or with clear margin before 31 October) and F5 before 31 December regardless of their RICE scores, because they are a contractual deadline (Hanbit Energy Service, ₩250M ARR) and a cost deadline.
- Doesn't schedule F2 before F5. Recognises that F2 (20 weeks) can't fit alongside F3 + F5 + F1 within 48, and tells the VP Sales so plainly, with the conditions under which F2 could lead instead.
- Every quarter stays at or under 24 engineer-weeks, and H2 at or under 48, with the totals shown. A typical valid plan is F3 + F5 + F6 + F1 plus either F4 (45 weeks) or F7 (42 weeks).
- Makes and justifies the F4 versus F7 call explicitly, for example total R×I×C (357 vs 300) against effort and confidence, rather than ranking mechanically.
