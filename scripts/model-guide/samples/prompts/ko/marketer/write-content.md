---
profession: marketer
task: write-content
language: ko
deliverable: graphics
---

## Prompt

당신은 코벨클라이밋(주)의 콘텐츠 리드입니다. 소상공인 매장(카페, 미용실, 소매점)용 스마트 냉난방 컨트롤러 '써멀린 프로'가 2025년 12월 1일 출시됩니다. 아래 브리프와 데이터로 출시 광고 소재를 작성하세요.

**제품 마케팅팀 브리프**

> 헤드라인 아이디어: "에너지 요금 40% 절감." 가격: "199,000원." 타깃: 매장 1~3곳을 직접 운영하며 전기요금을 직접 내고, 냉난방기 조작을 귀찮아하는 사장님. 핵심 혜택: 영업시간을 학습해 자동 스케줄; 직원은 설정 온도에서 ±1°C 이상 바꿀 수 없음; 냉난방 가동 중 문이 열려 있으면 알림.

**파일럿 결과 (소규모 사업장 48곳, 2025년 6~9월)**

| 지표 | 값 |
|---|---|
| 냉난방 에너지 사용량 감소율(중앙값) | 18% |
| 냉난방 에너지 사용량 감소율(상위 25%) | 27% |
| 최고 단일 매장 | 41% |
| 일반적인 파일럿 매장의 전체 전기요금 중 냉난방 비중 | 40% |
| "기존 컨트롤러보다 쉽다"고 답한 매장 | 48곳 중 44곳 |

고객 인용(사용 승인 완료): *"여름 전기요금이 한 달에 15만원쯤 줄었고, 이제 매장에서 온도 때문에 싸우는 일이 없어요."* (홍길동, 길동제과 대표)

**가격표 (재무팀)**

| 항목 | 가격 |
|---|---|
| 써멀린 프로 기기, 정가 | 239,000원 |
| 출시 기념가 (2026년 1월 31일까지) | 199,000원 |
| 코벨 클라우드 구독 (스케줄·알림 기능에 필수) | 매장당 월 9,900원 |

**브랜드 및 법무 규칙**

- 톤: 담백하고 자신감 있게, 약간 건조하게. 최상급 표현("최고", "가장 똑똑한", "1위") 금지.
- 색상: 딥 스프루스 `#1F4D3A`, 시그널 앰버 `#F2A93B`, 페이퍼 `#F7F5F0`. 서체: Pretendard.
- 표시광고법 제3조 제1항은 거짓·과장, 기만적 표시·광고를 금지하고, 제5조 제1항에 따라 사실에 관한 표시·광고는 실증할 수 있어야 합니다. 절감 효과를 표시할 때는 반드시 "2025년 소규모 사업장 48곳 파일럿 결과 기준. 결과는 다를 수 있습니다." 각주를 달고, 무엇이 줄어드는지(냉난방 에너지인지 전체 전기요금인지) 밝혀야 합니다.
- 가격을 표시할 때, 구독이 필요한 기능을 내세운다면 구독료도 함께 표시해야 합니다.

**필요한 소재**

| 소재 | 제한 |
|---|---|
| 랜딩 페이지 히어로 | H1 공백 포함 20자 이내; 서브헤드 50자 이내; CTA 버튼 1개; 근거 문구 1줄 |
| 메타(인스타그램) 피드 광고 (1080×1080) | 헤드라인 20자 이내; 본문 60자 이내; 이미지 위 문구 12자 이내 |
| 네이버 파워링크 | 제목 3안(각 15자 이내); 설명 2안(각 45자 이내) |

**작성할 것 (마크다운):**

1. 소재별 문구, 각 줄 옆에 글자 수 표기.
2. 히어로와 메타 광고의 레이아웃·비주얼 방향: 위계, 이미지, 색상 사용, 각주 위치.
3. 랜딩 페이지 히어로(1200×630)의 인라인 SVG 목업(코드 블록), 브랜드 색상과 실제 문구 사용.
4. 제품 마케팅팀에 보내는 짧은 메모(약 250자 이내): 브리프에서 바꾼 점과 그 이유.

글로 쓰는 부분은 약 2,500자 이내로 하세요. SVG는 분량에 포함하지 않습니다.

## A strong answer

- Doesn't lead with "에너지 요금 40% 절감". That is the single best site, and it measures HVAC energy, not the bill, so it would be a misleading claim under 표시광고법 §3 that can't be substantiated under §5. Uses a defensible claim instead, such as a median of 18% less 냉난방 energy (about 7% of a typical total bill: 18% × 40% = 7.2%), with the required footnote.
- Shows price honestly: ₩199,000 as a launch price, with list ₩239,000 and the Jan 31, 2026 end date, plus ₩9,900/month per location, since schedules and alerts depend on the subscription.
- Every line respects its limit, and the counts shown are accurate. No superlatives.
- The SVG is valid and self-contained, uses `#1F4D3A`, `#F2A93B` and `#F7F5F0`, and carries the H1, subhead, CTA and footnote, with a clear hierarchy (Pretendard with a sans-serif fallback).
- The note to product marketing explains the claim and price changes in terms of the pilot data and the legal rules, and points to the quote and the 44-of-48 ease result as stronger proof.
