---
profession: marketer
task: optimize-search
language: ko
deliverable: none
---

## Prompt

당신은 냉난방기(에어컨·히트펌프) 설치·AS 업체용 현장관리 앱 '필드노트'의 SEO·콘텐츠 리드입니다. `fieldnote.example.com/aircon-scheduling` 제품 페이지를 다시 써서, 구글·네이버 검색 순위를 높이고 AI 답변 엔진(구글 AI 개요, 네이버 AI 브리핑)이 정확하게 인용하도록 하세요. 데이터는 다음과 같습니다.

**구글 서치 콘솔, 최근 90일, 이 페이지**

| 검색어 | 노출 | 클릭 | CTR | 평균 순위 |
|---|---|---|---|---|
| 에어컨 설치 일정관리 프로그램 | 18,400 | 312 | 1.7% | 8.4 |
| 냉난방 기사 배차 앱 | 9,700 | 105 | 1.1% | 11.2 |
| 소규모 설비업체 현장관리 프로그램 추천 | 6,200 | 41 | 0.7% | 14.8 |
| 에어컨 일정관리 앱 무료 | 4,900 | 22 | 0.4% | 9.1 |
| 필드노트 가격 | 2,300 | 1,150 | 50.0% | 1.2 |
| 현장관리 프로그램 장부온 연동 | 1,800 | 9 | 0.5% | 17.5 |
| 필드노트 오프라인 | 640 | 48 | 7.5% | 3.1 |

블로그 글 `/blog/aircon-scheduling-guide`도 "에어컨 설치 일정관리 프로그램"으로 노출됩니다(평균 순위 9.6). 두 URL이 검색 결과에서 번갈아 나타납니다.

**현재 페이지 (발췌)**

> **title 태그:** 필드노트 | 소프트웨어
> **H1:** 사업을 운영하는 가장 똑똑한 방법
> 필드노트는 업계 1위 현장관리 툴입니다. 월 29,000원부터. 장부온 연동. 지금 무료로 시작하세요!

**제품 정보 (제품팀, 2025년 11월 기준)**

- 가격: 사용자당 월 39,000원(연간 결제) 또는 월 49,000원(월간 결제), 부가가치세 별도. 무료 요금제 없음. 14일 무료 체험, 카드 등록 불필요.
- 일정관리: 드래그 앤 드롭 배차 보드, 정기 점검 계약 관리, 기술·거리 기반 기사 자동 배정.
- 연동: 회계 프로그램 '장부온 클라우드'(고객·청구서·입금 양방향 동기화). 설치형 '장부온 PC'는 지원하지 않음.
- 오프라인: 기사용 모바일 앱은 오프라인에서도 작동하고 연결되면 동기화됨. 사무실용 웹 앱은 인터넷 연결이 필요함.
- 고객: 냉난방 업체 1,200곳. 고객사 기사 수 중앙값 6명.
- 고객 데이터: 배차 담당자의 일정 관리 시간이 주 9시간에서 4시간으로 감소(고객 설문, n = 210, 2025년 3월).
- 업계 순위나 시장점유율에 대한 객관적 근거 자료는 없음.

**AI 답변 엔진 현재 상태 (스냅샷)**

> "에어컨 설치 일정관리 프로그램"에 대한 구글 AI 개요: 경쟁사 3곳을 사용자당 가격, 회계 프로그램 연동, 오프라인 모드 기준으로 비교한 표를 보여 줌. 필드노트는 언급되지 않음.
> "필드노트 오프라인"에 대한 네이버 AI 브리핑: "필드노트는 인터넷 연결이 필요합니다." (출처: 2022년 네이버 카페 게시글)

**법무 메모:** 표시광고법 제3조 제1항은 거짓·과장, 기만적 표시·광고를 금지하며, 제5조 제1항에 따라 사업자는 표시·광고 중 사실과 관련한 사항을 실증할 수 있어야 합니다.

**작성할 것 (마크다운):**

1. 공백 포함 30자 이내의 title 태그와 80자 이내의 메타 설명. 각각 글자 수 표기.
2. 다시 쓴 페이지: H1, 도입부, H2 섹션, 짧은 "필드노트 한눈에 보기" 사실 표, 5~7개 질문의 FAQ. 각 답변은 단독으로 인용되어도 뜻이 통하도록 작성.
3. 페이지 문구와 일치하는 FAQPage 및 SoftwareApplication JSON-LD(코드 블록).
4. 블로그 글과 내부 링크 계획(최대 5개 항목).
5. 근거(약 300자 이내): 어떤 검색어를 노렸고, 어떤 검색어는 일부러 노리지 않았는지, 그 이유.

글로 쓰는 부분은 약 2,500자 이내로 하세요. JSON-LD는 분량에 포함하지 않습니다.

## A strong answer

- Corrects the outdated or false claims on the current page: the price is ₩39,000 per user per month annually or ₩49,000 month-to-month (VAT excluded), not "월 29,000원부터"; there is no free plan, only a 14-day trial; accounting integration is 장부온 클라우드 only, not the installed PC edition; the unsubstantiated "업계 1위" and "가장 똑똑한" claims are removed, with 표시광고법 §§3, 5 as the reason.
- Answers "에어컨 일정관리 앱 무료" honestly with the trial instead of implying a free plan, and explains that choice in the rationale.
- Corrects the AI answers with an FAQ entry stating plainly that the technician app works offline and the office web app does not. The page includes a quotable fact table (price per user, 장부온 클라우드 연동, offline mode) that mirrors the comparison format in the AI overview.
- Targets "에어컨 설치 일정관리 프로그램" and "냉난방 기사 배차 앱" in the title, H1 and H2s. Resolves the cannibalisation with a specific plan, such as repositioning the blog post for informational intent and linking it to the product page with exact-match anchor text.
- The title is 30 characters or fewer and the meta description 80 or fewer, with accurate counts. The JSON-LD is valid and matches the page (price in KRW, offer, FAQ text), and the survey claim is attributed (n = 210, March 2025).

## Card

brief: 냉난방 업체용 현장관리 앱의 제품 페이지를 검색 순위와 AI 답변 인용에 맞게 다시 씁니다.
given:
- 구글 서치 콘솔: 검색어 7개의 노출, 클릭, CTR, 평균 순위
- 블로그 글 메모: 핵심 검색어로 함께 노출되는 두 번째 URL
- 현재 페이지 발췌: title 태그, H1, 도입 문구
- 제품 정보(2025년 11월 기준): 가격, 일정관리, 연동, 오프라인, 고객, 설문
- AI 답변 엔진 스냅샷: 구글 AI 개요와 네이버 AI 브리핑의 현재 답변
- 법무 메모: 표시광고법 제3조·제5조
asked:
- title 태그(30자 이내)와 메타 설명(80자 이내), 글자 수 표기
- 다시 쓴 페이지: H1, 도입부, H2 섹션, 사실 표, 5~7개 질문의 FAQ
- FAQPage 및 SoftwareApplication JSON-LD
- 블로그 글과 내부 링크 계획 최대 5개 항목
- 노린 검색어와 노리지 않은 검색어에 대한 근거(약 300자 이내)
limit: 글로 쓰는 부분 약 2,500자 이내, Markdown, JSON-LD는 분량 제외
hard: 기존 문구와 외부 답변을 최신 사실로 검증해야 하고 두 페이지가 경쟁하며, 노릴 검색어 선택은 판단이 필요합니다.

## Scorecard

- Fixes price (₩39,000 annual / ₩49,000 monthly, not "월 29,000원부터"), trial not free plan, 장부온 클라우드 only
- Cuts unsubstantiated "업계 1위" and "가장 똑똑한" under 표시광고법 §§3, 5
- Answers "에어컨 일정관리 앱 무료" honestly with the 14-day trial, explained in the rationale
- FAQ: technician app works offline, office web app doesn't; fact table has price, 장부온 클라우드, offline
- Targets 설치 일정관리 and 기사 배차 queries in title, H1, H2s; blog made informational, exact-match link
- Title ≤30, meta ≤80, counts accurate; JSON-LD valid and matches page; survey attributed (n = 210, March 2025)

## Scorecard, shown

- 가격 정정(연간 결제 월 39,000원 / 월간 결제 49,000원, "월 29,000원부터" 아님), 무료 요금제가 아닌 체험, 장부온 클라우드만 연동
- 근거 없는 "업계 1위", "가장 똑똑한"을 표시광고법 제3조·제5조에 따라 삭제
- "에어컨 일정관리 앱 무료"에는 14일 무료 체험으로 정직하게 답하고 근거에서 설명
- FAQ: 기사용 앱은 오프라인 작동, 사무실 웹 앱은 불가, 사실 표에 가격·장부온 클라우드 연동·오프라인 포함
- title·H1·H2에서 설치 일정관리와 기사 배차 검색어 공략, 블로그는 정보성으로 바꾸고 정확한 앵커로 링크
- title 30자·메타 80자 이내, 글자 수 정확, JSON-LD 유효하고 페이지와 일치, 설문 출처 표기(n = 210, 2025년 3월)
