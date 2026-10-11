---
profession: designer
task: design-screens
language: ko
deliverable: web
---

## Prompt

귀하는 가상의 동물병원 체인 예약 앱 "포포길"의 프로덕트 디자이너입니다. 해안로점의 모바일 진료 예약 플로우를 설계해 주십시오. 보호자가 진료 항목을 고르고, 수의사를 고르고, 시간대를 고른 뒤 확정하는 흐름입니다. 375px 뷰포트 너비에서 동작해야 합니다.

**브랜드 토큰(브랜드팀 제공)**

```json
{
  "color.primary": "#7FD1AE",
  "color.primary.text": "#FFFFFF",
  "color.ink": "#1D2B33",
  "color.surface": "#FFFFFF",
  "color.muted": "#5E6B73",
  "radius.card": "12px",
  "font.family": "system-ui, sans-serif",
  "font.size.body": "16px"
}
```

브랜드팀은 주요 버튼을 `color.primary` 배경에 `color.primary.text` 레이블로 만들어 달라고 요청했습니다. 앱은 WCAG 2.2 AA(KWCAG 2.2)를 충족해야 합니다.

**병원 데이터**

진료 시간: 월~토 09:00–17:00, 점심시간 12:00–13:00 휴진.

| 진료 항목 | 소요 시간 | 가격 | 담당 가능 |
|---|---|---|---|
| 건강검진 진료 | 30분 | 65,000원 | 모든 수의사 |
| 예방접종 | 15분 | 40,000원 | 모든 수의사 |
| 스케일링 | 90분 | 280,000원부터 | 이영희 원장만 |
| 특수동물 진료 | 45분 | 85,000원 | 이영희 원장만 |

| 수의사 | 근무일 |
|---|---|
| 이영희 원장 | 화, 목, 토 |
| 박영수 수의사 | 월~토 |

목요일에 대해 API가 반환한 예약 가능 시간:

```json
[
  {"vet": "박영수", "service": "특수동물 진료", "start": "10:00"},
  {"vet": "이영희", "service": "특수동물 진료", "start": "11:00"},
  {"vet": "이영희", "service": "스케일링", "start": "11:30"},
  {"vet": "박영수", "service": "건강검진 진료", "start": "12:30"},
  {"vet": "박영수", "service": "건강검진 진료", "start": "14:00"},
  {"vet": "이영희", "service": "건강검진 진료", "start": "16:45"}
]
```

**제품 요구사항(PM 홍길동)**

- 확정 전에 가격을 보여 줄 것. 접수대에서 놀라는 일이 없어야 합니다.
- 예약의 약 70%가 건강검진 진료와 예방접종입니다. 이 두 가지를 가장 빠르게.
- "아무 수의사나 가능" 선택지를 둘 것.
- 확정 화면에는 날짜, 시간, 수의사, 진료 항목, 가격, 병원 주소(예시시 해안로 12)를 표시할 것.

**산출물** (설명은 약 2,500자 이내, 코드는 더 길어도 됩니다):

1. 단일 HTML/CSS 파일 프로토타입(코드 블록 하나). 단계를 클릭해서 넘길 수 있도록 간단한 바닐라 JS를 포함하십시오. 위 시간대 데이터를 사용하되 실제로 예약 가능한 시간만 표시하고, 예약 요약이 어떻게 갱신되는지 분명히 보여 주십시오.
2. 디자인 근거: 한 화면에 섹션을 점진적으로 펼치는 방식과 단계별 화면 중 무엇을 택했고 왜인지, "부터" 가격을 어떻게 다뤘는지, 브랜드팀 지시에서 벗어난 부분은 어디인지.
3. 발견한 데이터 문제 목록과 각 문제를 UI 또는 API가 어떻게 처리해야 하는지.

## A strong answer

- Notices that white text on #7FD1AE fails AA contrast (about 1.8:1). Keeps the brand colour but uses dark ink text on it, or a darker shade, and explains the departure.
- Filters out invalid slots: 박영수 cannot do exotic-pet check-ups; the 12:30 slot falls in the lunch closure; the 11:30 scaling (90 min) runs into lunch; the 16:45 wellness exam (30 min) runs past 17:00. The answer explains each one and suggests fixing them in the API.
- Shows the "280,000원부터" scaling price honestly (for example, "280,000원부터, 최종 금액은 진료 후 안내") and gives a reason, which is in tension with the PM's no-surprises rule.
- The prototype runs as a single file at 375 px, works with a keyboard (visible focus, labelled controls, tap targets of at least 24 px), makes the common services quick to reach, and offers "아무 수의사나 가능".
- The rationale for one screen versus separate steps is tied to the 70% fast-path requirement.

## Card

brief: 동물병원 앱의 375px 모바일 예약 플로우를 WCAG 2.2 AA에 맞춰 설계하고 프로토타입을 만듭니다.
given:
- 브랜드 토큰: 색상·반경·서체 토큰 8개와 주요 버튼 색상 지시
- 진료 시간: 월~토 09:00–17:00, 점심시간 휴진 포함
- 진료 항목: 4개 항목의 소요 시간, 가격, 담당 가능 수의사
- 수의사 근무일: 수의사 2명의 근무 요일
- 목요일 시간대: API가 반환한 예약 가능 시간 6개
- PM 요구사항: 가격 표시, 주요 진료의 빠른 경로, 아무 수의사 선택지, 확정 화면 항목에 관한 규칙 4개
asked:
- 시간대 데이터를 쓰되 실제 예약 가능한 시간만 보여 주는 단일 HTML/CSS/JS 프로토타입
- 디자인 근거: 한 화면 대 단계별 화면, "부터" 가격 처리, 브랜드팀 지시에서 벗어난 부분
- 발견한 데이터 문제 목록과 각 문제를 UI 또는 API가 처리하는 방법
limit: 설명은 약 2,500자 이내, Markdown; 코드는 더 길어도 됨
hard: 브랜드 지시를 접근성 요구와 저울질해야 하고, API 데이터를 병원 규칙에 대조해야 하며, 확정되지 않은 가격이 "놀라는 일이 없게" 목표를 시험합니다.

## Scorecard

- Flags white on #7FD1AE (about 1.8:1) as failing AA; uses dark text or a darker shade, explained
- Drops 박영수's exotic slot, 12:30 (lunch), 11:30 scaling (runs into lunch), 16:45 check-up (past 17:00)
- Explains why each dropped slot is invalid and recommends fixing them in the API
- Shows "280,000원부터" honestly, e.g. with a final-price note, and addresses the no-surprises tension
- Prototype runs at 375 px, keyboard-usable (visible focus, labels, ≥24 px targets), offers "아무 수의사나 가능"
- Ties the one-screen-or-steps choice to a fast path for the 70% check-up and vaccination bookings

## Scorecard, shown

- #7FD1AE 위 흰색 글자(약 1.8:1)가 AA에 미달함을 지적하고, 어두운 글자나 더 진한 색으로 바꾼 이유를 설명한다
- 박영수 수의사의 특수동물 진료, 12:30(점심시간), 11:30 스케일링(점심시간 침범), 16:45 건강검진(17:00 초과)을 뺀다
- 뺀 시간대마다 무효인 이유를 설명하고 API에서 고치도록 권고한다
- "280,000원부터" 가격을 최종 금액 안내 등으로 솔직하게 보여 주고, 놀라는 일이 없게 하라는 요구와의 긴장을 다룬다
- 프로토타입이 375px에서 동작하고 키보드로 쓸 수 있으며(포커스 표시, 레이블, 24px 이상 터치 영역) "아무 수의사나 가능"을 둔다
- 한 화면 대 단계별 선택을 예약의 70%인 건강검진·예방접종의 빠른 경로와 연결한다
