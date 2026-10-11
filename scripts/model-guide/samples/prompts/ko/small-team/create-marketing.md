---
profession: small-team
task: create-marketing
language: ko
deliverable: graphics
---

## Prompt

당신은 직원 5명이 일하는 동네 빵집 '구리솥베이커리'의 마케팅을 맡고 있습니다. 사장 이영희 님이 **주말 사워도우 정기구독**을 시작하면서 인스타그램 게시물 1개와 매장 카운터 및 동네 카페에 둘 A5 전단을 원합니다. 아래는 사장님의 요청 원문입니다.

> "5월 2일 시작해요! 구독하시면 매주 토요일 한 덩이씩, 한 달에 4개를 월 36,000원에 드려요. 25% 할인이에요! 토요일 오전 8~11시 매장 픽업. 저희 빵은 전부 100% 유기농이고 글루텐프리 빵도 있어요. 신청은 gurisot.example.com/subscribe 에서. 대기업 느낌 말고 따뜻하고 동네 느낌 나게 해 주세요. 선착순 50명에게 에코백 증정."

**빵집 관련 사실**

- 사워도우 한 덩이의 매장 판매가는 10,000원입니다.
- 밀가루 공급업체 확인서: "당사 밀가루는 유기농 인증 제품입니다." 빵 두 종류에 들어가는 씨앗 믹스는 유기농 인증을 받지 *않았습니다*.
- '글루텐프리' 빵은 메밀·쌀 빵으로, 밀 빵과 같은 주방, 같은 오븐에서 굽습니다. 별도의 글루텐프리 시설이 없고 검사도 하지 않습니다.
- 매장 내 취급 알레르기 유발 원료: 밀, 참깨, 우유, 달걀, 호두·잣 등 견과류.
- 브랜드 색상: 구리색 `#B87333`, 크림색 `#F5EBDD`, 차콜 `#2B2B2B`. 서체: 제목은 명조(세리프) 계열, 본문은 깔끔한 고딕(산세리프) 계열.

**최근 인스타그램 성과 (최근 60일, 팔로워 약 3,100명)**

| 게시물 유형 | 예시 | 도달 | 좋아요 | 저장 | 프로필 링크 클릭 |
|---|---|---|---|---|---|
| 단일 사진 | 카운터 위 빵 | 1,900 | 140 | 22 | 12 |
| 릴스(15초) | 새벽 5시 반죽 성형 비하인드 | 6,400 | 410 | 60 | 38 |
| 캐러셀(5장) | 가격이 적힌 주간 메뉴 | 2,700 | 180 | 95 | 41 |

목표는 정기구독 신청입니다. 사장님은 가능한 한 많은 동네 주민이 이 소식을 알기를 바랍니다.

**제출물** (마크다운, SVG 제외 약 2,500자 이내):

1. 인스타그램 계획: 선택한 형식과 이유(데이터 활용), 슬라이드 또는 장면 목록, 캡션(약 250자 이내), 해시태그 최대 8개.
2. A5 전단:
   - 전체 문구
   - 영역별 레이아웃
   - 비주얼 방향(사진, 색상, 타이포그래피, 접근성)
   - 코드 블록 안의 인라인 SVG 목업 (`viewBox="0 0 420 595"`, A5 비율, 외부 리소스 없음)
3. 사장님 요청에서 바꾼 표현과 그 이유를 담은 짧은 메모 (약 250자 이내).

## A strong answer

- Fixes the savings claim: ₩36,000 versus 4 × ₩10,000 = ₩40,000 is a 10% saving (₩4,000 a month), not 25%. The copy uses the accurate figure or simply says "한 덩이 9,000원".
- Doesn't claim "100% 유기농" (the seed mix isn't certified; organic claims require certification under Korean organic-labelling rules) or "글루텐프리" (it's baked in a shared kitchen with no testing). Uses accurate wording such as "유기농 인증 밀가루 사용" and "밀을 넣지 않았지만 밀을 다루는 주방에서 구워 셀리악병이 있는 분께는 적합하지 않음", and includes the allergen note. The note to the owner explains these as false-advertising (식품표시광고법) and allergy-safety issues.
- Chooses the format from the data and the two goals. The carousel has the best click-through (about 1.5% vs about 0.6% for the reel and the single photo) for sign-ups, and the reel has the best reach. The answer makes the trade-off explicit, for example a carousel as the main post with a reel to support it.
- Both pieces carry the essentials: the 2 May launch, Saturday 8–11am pickup, ₩36,000/month for 4 loaves, the sign-up URL and the first-50 tote offer.
- The SVG is valid and self-contained at A5 proportions, uses the brand colours, and has a clear hierarchy with legible Korean text sizes and sufficient contrast.

## Card

brief: 빵집 사워도우 정기구독 출시용 인스타그램 게시물 계획과 A5 카운터 전단을 만든다.
given:
- 사장님 요청 원문: 이영희 님의 출시 내용과 주장
- 빵집 관련 사실: 판매가, 원료 인증, 글루텐프리 빵 제조 환경, 알레르기 유발 원료
- 브랜드: 색상 3가지와 서체
- 인스타그램 성과: 게시물 유형 3가지의 도달, 좋아요, 저장, 링크 클릭
asked:
- 인스타그램 계획: 형식과 이유, 슬라이드·장면 목록, 캡션(약 250자 이내), 해시태그 최대 8개
- A5 전단: 문구, 영역별 레이아웃, 비주얼 방향, 인라인 SVG 목업
- 바꾼 표현과 이유를 담은 사장님께 드리는 메모(약 250자 이내)
limit: SVG 제외 약 2,500자 이내, Markdown
hard: 요청 속 주장을 빵집의 사실과 대조해야 하고, 데이터가 서로 다른 쪽을 가리키는 두 목표 사이에서 형식을 골라야 한다.

## Scorecard

- Savings fixed: ₩36,000 vs ₩40,000 (4 × ₩10,000) is 10%, ₩4,000 a month, not 25% (or "₩9,000 a loaf")
- No "100% 유기농" (seed mix uncertified); uses wording like "유기농 인증 밀가루 사용"
- No "글루텐프리" (shared kitchen, no testing); allergen note included; note to the owner explains both risks
- Format from data: carousel best click-through (≈ 1.5% vs ≈ 0.6%), reel best reach; trade-off explicit
- Both pieces carry 2 May, Saturday 8–11am pickup, ₩36,000/month for 4 loaves, URL, first-50 tote
- SVG valid at A5 proportions, brand colours, clear hierarchy, legible Korean text sizes, sufficient contrast

## Scorecard, shown

- 할인 표현 수정: 36,000원 대 40,000원(4 × 10,000원)은 10%, 월 4,000원, 25% 아님(또는 "한 덩이 9,000원")
- "100% 유기농" 표현 없음(씨앗 믹스 미인증), "유기농 인증 밀가루 사용" 같은 표현 사용
- "글루텐프리" 표현 없음(공용 주방, 검사 없음), 알레르기 안내 포함, 사장님 메모에 두 위험 설명
- 데이터로 형식 선택: 캐러셀 클릭률 최고(약 1.5% 대 약 0.6%), 릴스 도달 최고, 트레이드오프 명시
- 두 결과물 모두 5월 2일, 토요일 오전 8~11시 픽업, 4덩이 월 36,000원, URL, 선착순 50명 에코백
- A5 비율의 유효한 SVG, 브랜드 색상, 명확한 위계, 읽기 쉬운 한글 크기, 충분한 대비
