---
profession: investor
task: screen-deals
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 할든피크벤처스의 심사역입니다. 월요일 파트너 회의에서는 첫 미팅 세 건만 다룰 수 있습니다. 이번 주 유입된 시리즈 A 파이프라인을 펀드 투자 기준으로 스크리닝하고, 어떤 세 곳을 올릴지 추천하세요.

**펀드 투자 기준 (파트너가 면제하지 않는 한 모두 충족해야 함)**

| 기준 | 조건 |
|---|---|
| 섹터 | B2B 소프트웨어, 하드웨어 의존 매출 없음 |
| 소재지 | 국내 본사(한국 법인). 조합 규약상 주목적 투자(국내 중소·벤처기업) 비율을 지켜야 함 |
| ARR(반복 매출만) | 15억 ~ 40억원 |
| 전년 대비 ARR 성장률 | 80% 이상 |
| 순매출유지율(NRR) | 110% 이상 |
| 매출총이익률 | 70% 이상 |
| 번 멀티플(순소진액 ÷ 순증 ARR, 최근 12개월) | 2.0 이하 |
| 라운드 | 당사가 80억~120억원으로 리드하므로 라운드 규모 80억원 이상 |

**파이프라인 (창업자 제공 수치, CRM 기준, 억원)**

| 회사 | 사업 내용 | 본사 | 현재 ARR | 12개월 전 ARR | 순소진액(최근 12개월) | NRR | 매출총이익률 | 유치 희망 금액 |
|---|---|---|---|---|---|---|---|---|
| 레저리 | 중견기업 매입채무 자동화 | 서울 강남 | 32 | 16 | 24 | 118% | 78% | 100 |
| 플릿와이즈 | 차량 관제: SaaS + 차량 단말기 | 판교 | 28 | 14 | 35 | 121% | 52% | 120 |
| 쿼럼HR | 인사·노무 컴플라이언스 워크플로 | 서울 마포 | 46 | 29 | 20 | 113% | 82% | 150 |
| 파슬레인 | 3PL용 배송 오케스트레이션 | 대전 | 39 | 15 | 26 | 112% | 74% | 110 |
| 센티넬독스 | 사내 법무팀용 AI 계약 검토 | 서울 서초 | 24 | 6 | 18 | 125% | 80% | 90 |
| 노스빔애널리틱스 | 마케팅 성과 기여도 분석 | 서울 성수 | 21 | 10 | 14 | 104% | 81% | 60 |
| 탤로우 | 외식 그룹용 백오피스 SaaS | 부산 | 19 | 9 | 16 | 115% | 72% | 90 |
| 코비드시큐리티 | 중소기업용 엔드포인트 보안 | 싱가포르 | 35 | 17 | 27 | 116% | 79% | 100 |

**데이터룸 및 첫 통화 메모**

- 파슬레인: "현재 ARR"에 최근 12개월 동안 청구한 1회성 구축비 11억원이 포함됨. 12개월 전 ARR은 작년 IR 자료 기준이며 반복 매출만 포함.
- 센티넬독스: ARR은 "12월 매출 × 12". 12월 매출 2억원에는 1회성 파일럿 비용 9천만원이 포함됨.
- 탤로우: 최대 고객이 ARR의 40%를 차지하며, 해당 계약은 5개월 후 갱신.
- 코비드시큐리티: "내년에 한국 법인을 세우고(역플립) 서울 사무소 개설 예정". 현재 고객은 모두 싱가포르와 동남아시아에 있음.
- 노스빔: 파트너 이영희가 창업자들과 잘 아는 사이이며 "나머지가 뛰어나다면" 기준 하나는 면제를 고려하겠다고 함.

**작성할 것 (마크다운 표):**

1. **스크리닝 표**: 회사별 한 행. 보정한 반복 ARR, 전년 대비 성장률(%), 번 멀티플, 기준별 통과/탈락, 탈락 기준 수. 계산 열마다 산식을 밝히세요. 창업자 제공 수치를 보정한 경우 제공값과 보정값을 모두 표시하세요.
2. **순위**: 월요일에 올릴 상위 세 곳. 각각 2문장 근거와 첫 미팅에서 물을 질문 3개.
3. **아쉬운 탈락**: 기준 면제를 논의할 만한 회사 최대 세 곳. 면제가 필요한 기준과 면제 여부에 대한 의견.

성장률은 소수점 첫째 자리, 번 멀티플은 소수점 둘째 자리까지 반올림하세요. 분량은 약 2,500자 이내로 하세요.

## A strong answer

- Corrects 파슬레인 to ₩28억 recurring ARR, giving growth of 86.7% (not the 160% the reported figures imply) and a burn multiple of exactly 26 ÷ 13 = 2.00, which is a borderline pass. Corrects 센티넬독스 to ₩1.1억 × 12 = ₩13.2억 ARR, which fails the ARR floor, with a burn multiple of 18 ÷ 7.2 = 2.50.
- Computes the rest correctly: 레저리 100% growth and 1.50 burn multiple; 플릿와이즈 2.50 (also failing on gross margin and hardware); 쿼럼HR 58.6% growth and 1.18, with ARR above the range; 노스빔 1.27, failing on NRR and round size; 탤로우 111.1% and 1.60; 코비드 105.9% and 1.50, failing on geography.
- 레저리 is in the top three. The other picks are reasoned, for example 탤로우 (passes every criterion, with its 40% concentration and renewal date listed as the first diligence question) and 파슬레인 on recurring figures.
- Takes a clear position on waivers. For example, 코비드's geography is the most waivable gap only if the Korean entity/reverse flip is real and the investment can still count toward the fund's 주목적 투자 requirement (otherwise it eats into the overseas-investment allowance), while 노스빔 fails two criteria, so one waiver can't rescue it despite the relationship.
