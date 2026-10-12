---
profession: designer
task: handoff-specs
language: ko
deliverable: web
---

## Prompt

귀하는 가상의 온라인 설문·폼 빌더 "(주)폼마루"의 프로덕트 디자이너입니다. 요금제 페이지 리디자인이 승인되어 다음 스프린트에 프론트엔드팀(리드: 김철수)으로 넘어갑니다. 요금제 섹션의 개발 핸드오프를 준비해 주십시오. 월간/연간 결제 토글과 요금제 카드 3개입니다.

**디자인 파일에서 내보낸 인스펙트 노트**

```text
Toggle: segmented control, 2 options [월간 | 연간], height 40, radius 20,
  selected bg #2F6FEB, selected text #FFFFFF, unselected text #4B5563
  연간 option has badge "20% 할인" (bg #E8F7EE, text #1F7A45, 12px)
Card: width 320, padding 24, gap between cards 14, radius 12, border 1px #E5E7EB
  Recommended card (Pro): border 2px primary-600, label "가장 인기"
Price: 40px/48px semibold; suffix "/월" 16px #6B7280
CTA button: height 44, full width, radius 8, bg primary-600, text white
Feature list: 14px/20px, check icon 16px, row gap 10
Breakpoints: 3 columns ≥ 1040px; stacked below, Pro card first
```

**디자인 토큰(코드베이스)**

```css
--primary-600: #2F6FED;
--primary-700: #2459C4;
--gray-500: #6B7280;
--gray-600: #4B5563;
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 20px; --space-6: 24px; --space-8: 32px;
--radius-md: 8px; --radius-lg: 12px; --radius-full: 9999px;
```

**요금제 문구와 가격(가격 정책 문서, 모두 VAT 별도)**

| 요금제 | 월간 | 연간(표시가) | 연간 결제액 | 기능 |
|---|---|---|---|---|
| Starter | 0원 | 0원 | 0원 | 폼 3개, 월 응답 100건 |
| Pro | 19,000원/월 | 15,000원/월 | 190,000원/년 | 폼 무제한, 월 응답 5,000건, 조건 분기, 파일 업로드 |
| Business | 49,000원/월 | 39,000원/월 | 468,000원/년 | Pro의 모든 기능, SSO, 감사 로그, 월 응답 50,000건 |

PM 요구사항: 연간 토글이 기본 선택. 전환 시 레이아웃 이동(layout shift)이 없어야 함. 연간 가격 아래에 "연 X원 결제" 표시. 가격 옆에 "VAT 별도" 표기. Starter CTA는 "무료로 시작", 나머지는 "14일 무료 체험 시작".

**산출물** (설명은 약 2,500자 이내, 코드는 더 길어도 됩니다):

1. 단일 HTML/CSS/바닐라 JS 레퍼런스 구현(코드 블록 하나). 코드베이스 토큰만 사용하고, 토글, 카드 3개, 상태(hover, focus-visible, selected, 로딩 중 CTA 비활성)와 반응형 동작을 포함하십시오.
2. 개발자용 스펙 표: 요소, 속성, 값(토큰 이름), 비고. 인스펙트 노트의 모든 원시 값을 토큰에 매핑하고, 바꾼 값은 따로 표시하십시오.
3. 접근성 노트: 토글의 시맨틱과 키보드 동작, 가격이 바뀔 때 스크린리더가 읽어 주는 내용, 명도 대비.
4. PM과 디자이너에게 확인할 미결 질문이나 불일치 목록과, 각각에 대한 권장 해결안.

## A strong answer

- Catches the Pro pricing inconsistency: ₩15,000 × 12 = ₩180,000, not ₩190,000, and "20% 할인" does not hold for Pro (₩15,000 vs ₩19,000 is 21%; ₩190,000 vs ₩228,000 is about 17%). Business is consistent (₩39,000 × 12 = ₩468,000; about 20%). The answer proposes a resolution, such as fixing the billed amount or changing the badge to "최대 20% 할인".
- Normalizes off-system values: #2F6FEB becomes --primary-600 (#2F6FED), the 14px card gap becomes --space-4 (or --space-3) and the 10px row gap goes to the nearest token, with the reason stated.
- Implements the toggle as an accessible control (radio group, or buttons with aria-pressed), with arrow or Tab keyboard support, a visible focus style and a polite live region or other sensible announcement of price changes. Annual is the default.
- Avoids layout shift when toggling (reserved space or fixed-width price area, "연 X원 결제" line and "VAT 별도" always present), and in the stacked layout the Pro card comes first.
- The code runs as a single file, uses CSS custom properties from the token list, and the spec table is complete enough to build from without the design file.

## Card

brief: 요금제 섹션의 결제 토글과 카드 3개를 코드베이스 토큰에 맞춰 개발 핸드오프로 정리합니다.
given:
- 디자인 인스펙트 노트: 토글, 카드, 가격, CTA, 기능 목록, 브레이크포인트 값
- 디자인 토큰: 색상·간격·반경에 대한 코드베이스 CSS 커스텀 속성 14개
- 요금제 표: 3개 요금제의 월간·연간 표시가, 연간 결제액, 기능(VAT 별도)
- PM 요구사항: 기본 토글, 레이아웃 이동 금지, 연간 결제액과 VAT 표기, CTA 문구
asked:
- 코드베이스 토큰만 쓴 단일 HTML/CSS/JS 레퍼런스 구현(상태와 반응형 동작 포함)
- 인스펙트 노트의 모든 값을 토큰에 매핑하고 바꾼 값을 표시한 개발자용 스펙 표
- 접근성 노트: 토글의 시맨틱과 키보드 동작, 가격 변경 시 스크린리더 안내, 명도 대비
- PM과 디자이너에게 확인할 미결 질문과 불일치, 각각의 권장 해결안
limit: 설명은 약 2,500자 이내, Markdown; 코드는 더 길어도 됨
hard: 가격 문구를 산술로 검증해야 하고, 디자인 값이 토큰 체계에서 벗어나 있으며, 토글은 레이아웃 이동 없이 접근 가능하게 동작해야 합니다.

## Scorecard

- Flags Pro: ₩15,000 × 12 = ₩180,000, not ₩190,000, and "20% 할인" fails (about 21% or 17%)
- Confirms Business is consistent (₩39,000 × 12 = ₩468,000, about 20%); proposes a fix for Pro
- Maps #2F6FEB to --primary-600 (#2F6FED) and the 14px and 10px gaps to tokens, with reasons
- Accessible toggle (radio group or aria-pressed), keyboard support, visible focus, price changes announced; 연간 default
- No layout shift on toggle ("연 X원 결제" and "VAT 별도" always present); Pro first when stacked
- Single-file code runs on token custom properties; spec table is complete enough to build from

## Scorecard, shown

- Pro는 15,000원 × 12 = 180,000원이지 190,000원이 아니며, "20% 할인"도 맞지 않음(약 21% 또는 17%)을 지적한다
- Business는 일관됨(39,000원 × 12 = 468,000원, 약 20%)을 확인하고 Pro 수정안을 제시한다
- #2F6FEB를 --primary-600(#2F6FED)으로, 14px·10px 간격을 토큰으로 바꾸고 이유를 밝힌다
- 접근 가능한 토글(라디오 그룹 또는 aria-pressed), 키보드 지원, 포커스 표시, 가격 변경 안내, 연간 기본 선택
- 토글 전환 시 레이아웃 이동이 없고("연 X원 결제"와 "VAT 별도" 상시 표시), 세로 배치에서 Pro 카드가 먼저 온다
- 단일 파일 코드가 토큰 커스텀 속성으로 동작하고, 스펙 표만으로 구현할 수 있다
