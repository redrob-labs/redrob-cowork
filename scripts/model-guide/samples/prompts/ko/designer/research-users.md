---
profession: designer
task: research-users
language: ko
deliverable: presentations
---

## Prompt

귀하는 임직원 50~500명 규모 기업을 위한 가상의 경비 정산 앱 "(주)레저리"의 UX 리서처입니다. 제품 리드 박영수 님이 "다음 분기의 핵심 과제를 영수증 인식 개선으로 잡아야 할까요?"라고 물었습니다. 박영수 님은 이미 이사회에 영수증 인식이 가장 큰 불만이라고 보고했습니다. 아래 근거를 종합해 프로덕트 트리오(PM·디자인·엔지니어링)를 위한 리드아웃 덱을 만들어 주십시오.

**인터뷰(참가자 8명, 각 45분)**

| ID | 직무 | 회사 규모(명) | 주요 발언 / 관찰 |
|---|---|---|---|
| P1 | 현장 영업 담당 | 320 | "영수증 찍는 건 괜찮아요. 그런데 결재가 팀장님한테서 일주일씩 멈춰 있고, 그러다 법인카드가 정지돼요." |
| P2 | 재무팀 매니저(결재자) | 140 | 금요일에 몰아서 한 번에 결재함. 모바일 결재 화면이 "규정 위반 표시를 가린다"고 말함. |
| P3 | 컨설턴트 | 75 | 구겨진 영수증 사진 인식이 두 번 실패해서 직접 입력함. |
| P4 | 개발팀장(결재자) | 410 | 결재 대기 23건. "알림이 안 와요. 사람들이 불평해야 알게 돼요." |
| P5 | 총무 담당 | 60 | 다른 사람들의 경비 계정과목을 다시 분류하는 데 매달 약 2시간 소요. |
| P6 | 영업본부장(결재자) | 320 | "출장 중에 대결(대리 결재) 지정하는 게 불가능해요." |
| P7 | 기술지원 엔지니어 | 210 | 영수증 인식은 괜찮음. 자차 주행거리 정산 기능을 원함. |
| P8 | 영업 대표 | 140 | 여러 장짜리 호텔 영수증은 첫 장만 인식됨. 결재도 느리다고 말함. |

**인앱 설문(n = 212)**

지난달 경비를 20건 이상 제출한 사용자에게 발송. 질문: "가장 큰 불편 한 가지는 무엇인가요?"(하나만 선택)

| 응답 | 비율 |
|---|---|
| 영수증 사진 인식 실패 또는 오인식 | 34% |
| 결재 대기 | 27% |
| 알맞은 계정과목 선택 | 22% |
| 주행거리 정산 | 9% |
| 기타 | 12% |

**제품 분석, 최근 90일**

| 지표 | 값 |
|---|---|
| OCR 결과를 수동으로 수정해야 했던 영수증 사진 | 6.2% |
| 결재 대기 5일 초과 경비 보고서 | 41% |
| 제출부터 결재 완료까지 중앙값 | 4.8일 |
| 모바일 결재 화면을 한 번 이상 연 결재자 | 18% |
| 월간 활성 제출자 | 9,400명 |
| 월간 활성 결재자 | 1,150명 |

**산출물:** 마크다운 리드아웃 덱, 슬라이드 8~10장, 약 2,500자 이내. 슬라이드마다 `### Slide n: 제목`, 그다음 글머리표, 그다음 한 줄짜리 발표자 노트를 쓰십시오. 다음을 포함하십시오.

- 리서치 질문과 방법, 그리고 솔직한 한계.
- 주제 3~5개, 각각 구체적 근거(참가자 ID, 설문 또는 분석 수치)로 뒷받침.
- 박영수 님의 질문에 직접 답하는 다음 분기 핵심 과제에 대한 명확한 권고(예상과 다른 답이더라도)와 한두 가지 작은 후속 과제.
- 남은 불확실성을 줄이기 위해 다음에 조사할 내용.

## A strong answer

- Notices that the survey shares add up to 104% for a single-choice question and treats the figures as unreliable until they are checked.
- Flags the sampling bias: the survey went only to heavy submitters (20 or more expenses), and no approvers were in the sample, so it under-represents the approval side.
- Shows approval delays as the stronger, triangulated theme: 5 of 8 participants raise approval problems (P1, P2, P4, P6, P8), 41% of reports waiting more than 5 days, and only 18% mobile-approval adoption. Receipt capture is a real but narrower problem (6.2% need correction; crumpled receipts and multi-page hotel receipts).
- Recommends approval-flow work (notifications, delegation/대결, policy flags on mobile) as the big bet and tells 박영수 directly that receipt capture is not the top problem. Receipt-capture edge cases are scoped as a smaller follow-up.
- Follows the slide format with a speaker note on every slide, cites evidence by ID, and states its limitations (n = 8, survey wording).
