---
profession: designer
task: create-graphics
language: ko
deliverable: graphics
---

## Prompt

귀하는 가상의 지역 신용협동조합인 해솔신협의 인하우스 디자이너입니다. 마케팅팀이 새 입출금통장 "간편통장"을 출시하면서 출시용 그래픽 두 가지를 요청했습니다. 인스타그램 피드 게시물(1080 × 1080)과 링크드인 링크 이미지(1200 × 627)입니다.

**마케팅 리드 이영희 님의 브리프**

> 헤드라인: "수수료 없음. 평생." 크고 굵게. 주방 식탁에 둘러앉은 행복한 젊은 가족 사진. CTA는 "5분이면 개설"과 로고. 연 2.25% 금리를 정중앙에, 이 동네에서 우리보다 높은 곳은 없으니까요. 톤은 재미있게: 타깃은 22~35세 사회초년생, 첫 통장 고객입니다.

**상품설명서(준법감시 승인 완료)**

| 항목 | 내용 |
|---|---|
| 월 계좌유지 수수료 | 0원 |
| 최소 가입금액 | 10,000원 |
| 종이 거래명세서 우편 발송 | 월 2,000원(전자 명세서 무료) |
| 타행 ATM 출금 | 건당 1,000원, 월 4회 면제 |
| 잔액 부족 시 | 수수료 0원, 결제 거절 처리 |
| 금리 | 잔액 500만원 이하분 연 2.25%(세전), 500만원 초과분 연 0.10%(세전) |
| 계좌 개설 | 신분증만 있으면 비대면으로 약 5분 |

**광고 준법 기준(발췌)**

> 금리를 표시하는 모든 광고는 "연 ○.○○%(세전)"으로 표기하고 적용 잔액 구간 또는 "○○원 이하 잔액에 적용" 문구를 넣어야 하며, "금리는 가입 후 시장 상황에 따라 변동될 수 있습니다." 문구를 포함해야 한다. 모든 광고에는 "이 예금은 신용협동조합법에 따라 신협 예금자보호기금이 보호합니다." 문구와 예금자보호 마크를 브랜드 가이드의 최소 크기 이상으로 표시하고, 준법감시인 심의필 번호(예: 심의필 제2025-000호)를 기재한다. "평생", "절대", "수수료 없음" 같은 단정적 표현은 상품에 문자 그대로 사실일 때만 허용한다.

**브랜드 가이드(발췌)**

- 색상: 해솔 네이비 #0B3B5C, 씨글라스 #6FC3B2, 샌드 #F4EBDD, 화이트.
- 서체: 고딕(산세리프) 한 패밀리, 두 가지 굵기. 1080px 아트보드에서 헤드라인 최소 64px.
- 로고: 소셜 최소 너비 160px, 여백은 로고 심볼 "ㅎ" 높이만큼.
- 예금자보호 마크: 소셜 최소 너비 120px.
- 사진: 실제 조합원, 자연광. 돼지 저금통, 돈다발 같은 스톡 사진 클리셰 금지.

**산출물** (설명은 약 2,500자 이내, SVG는 더 길어도 됩니다):

1. 두 포맷의 최종 카피: 헤드라인, 서브 카피, CTA, 모든 필수 고지 문구. 브리프의 헤드라인을 바꾼다면 이유를 설명하고 이영희 님이 고를 수 있는 대안 두 가지를 제시하십시오.
2. 포맷별 레이아웃과 비주얼 방향: 그리드, 위계, 사진·금리·로고·고지 문구의 위치, 정사각형에서 가로형으로 어떻게 바뀌는지.
3. 포맷별 인라인 SVG 목업(코드 블록, 실제 픽셀 크기). 로고와 사진은 레이블을 단 플레이스홀더 사각형으로 표시하고, 모든 카피가 해당 크기에서 읽을 수 있어야 합니다.
4. 사용할 수 없었던 주장과 그 이유를 이영희 님에게 설명하는 짧은 메모.

## A strong answer

- Rejects "수수료 없음. 평생." because paper statements (₩2,000) and out-of-network ATM (₩1,000) fees exist, and proposes accurate alternatives such as "계좌유지 수수료 0원" or "월 수수료 0원, 잔액 부족 수수료 0원".
- Shows "연 2.25%(세전)" with the "잔액 500만원 이하분" tier and the full rate-change disclosure. Drops or softens "nobody else locally beats it" (이 동네 최고), since it is an unsupported comparative claim.
- Includes the 신협 deposit-protection sentence and mark at 120 px or wider, the review number (심의필), the logo at 160 px or wider with clear space, and a headline of at least 64 px on the 1080 px artboard.
- Provides two valid SVGs at 1080 × 1080 and 1200 × 627 with a clear hierarchy (headline, rate, CTA, disclosures) and brand colours only. The landscape version is recomposed, not just scaled down.
- The photo direction follows the guide (real members, natural light) while keeping the brief's family idea, and the copy sounds right for 22–35-year-old first-time account holders.
