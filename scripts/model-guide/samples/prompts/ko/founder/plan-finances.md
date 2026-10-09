---
profession: founder
task: plan-finances
language: ko
deliverable: spreadsheets
---

## Prompt

귀하는 지역 농협과 영농조합에 토양 수분 분석 서비스를 월 구독으로 판매하는 가상의 스타트업 "(주)들판노트애널리틱스"의 창업자 겸 대표입니다. 공동창업자 홍길동 님이 간단한 런웨이 추정치를 만들었습니다. 이사회 전에 2026년 1월~2027년 6월의 18개월 현금 예산을 제대로 만들고, 채용과 투자 유치 시점을 결정하려고 합니다.

**홍길동 님의 추정**

> 인건비 월 7,875만원(= 9억 4,500만원 ÷ 12), 데이터 라이선스 월 900만원, 기타 운영비 월 2,850만원, 매출 월 3,900만원. 번레이트 ≈ 월 7,725만원. 현금 18억원 → 런웨이 약 23개월. 네 명 모두 채용해도 되고, 투자 유치는 2027년 중반에 하면 됩니다.

**사실관계와 가정**

| 항목 | 값 |
|---|---|
| 현금, 2026년 1월 1일 | 1,800,000,000원 |
| 기초 MRR, 2026년 1월 | 39,000,000원 |
| 월별 신규 MRR | 2026년 6월까지 4,500,000원, 2026년 7월부터 6,750,000원(신규 영업 담당 안착 이후) |
| 이탈 | 매월 기초 MRR의 2% |
| 매출과 회수 | 각 월 매출 = 기초 MRR, 같은 달에 회수 |
| 매출총이익률 | 78%(호스팅·데이터 처리 비용 반영) |
| 현재 인원 | 9명, 연간 기본급 총액 945,000,000원 |
| 인건비 부대비용 | 모든 현금 보상의 22%(4대보험 사업주 부담분, 퇴직급여 적립, 복리후생) |
| 채용 계획 | 엔지니어 2명 각 연 123,750,000원, 2026년 3월 1일 입사; 영업 담당(AE) 1명 OTE 연 120,000,000원(변동급은 목표 달성 기준으로 매월 지급 가정), 2026년 4월 1일 입사; 고객성공 매니저 1명 연 67,500,000원, 2026년 7월 1일 입사 |
| 기타 운영비 | 월 28,500,000원 + 신규 입사자 1인당 월 1,125,000원(입사월부터) |
| 위성 데이터 라이선스 | 연 108,000,000원, 매년 1월에 일시 지급 |

이사회 정책: 투자 유치는 그 시점 번레이트 기준으로 최소 6개월치 현금이 남아 있을 때 클로징해야 합니다. 첫 미팅부터 입금까지 약 5개월이 걸립니다.

**산출물** (마크다운, 약 2,500자 이내):

1. 2026년 1월~2027년 6월 월별 표. 열: 기초 MRR, 매출, 매출총이익, 인건비(부대비용 포함), 기타 운영비, 데이터 라이선스, 순현금유출(net burn), 기말 현금. 각 열의 산식을 명시하십시오.
2. 홍길동 님의 추정이 어디서 틀렸는지에 대한 짧은 조정 내역과, 각 오류가 월 번레이트에 미치는 영향.
3. 이 계획대로라면 현금이 바닥나는 달과, 이사회 정책상 투자 유치를 시작해야 하는 가장 늦은 달.
4. 권고: 채용 계획을 그대로 유지할지, 채용을 미루거나 줄일지, 투자 유치를 앞당길지. 대안 시나리오를 최소 하나 간단히 모델링하고(예: CS 채용 연기, 또는 AE를 뽑지 않고 신규 MRR을 4,500,000원으로 유지) 런웨이에 미치는 영향을 밝히십시오.

원 단위로 반올림하고, 추가한 가정은 명시하십시오.

## A strong answer

- Finds the co-founder's three errors: payroll without the 22% burden (and without the new hires), the data license spread over the year when the cash leaves in January, and revenue subtracted in place of gross profit (78%).
- January 2026 net burn is about ₩202,155,000 (payroll ₩96,075,000 + opex ₩28,500,000 + license ₩108,000,000 − gross profit ₩30,420,000). Burn settles at about ₩116,000,000–₩127,000,000 a month mid-2026 and falls slowly as MRR grows.
- Under the full plan, cash runs out around March 2027 (about ₩17.7M left at the end of February), about 14–15 months, not 23. The second license payment in January 2027 is a cliff.
- Works back from the board policy: the raise must close by about August 2026 (about ₩772,000,000 left, roughly 6 months of burn), so fundraising has to start around March or April 2026, almost immediately and far earlier than mid-2027. The answer says this plainly.
- MRR is computed correctly (opening × 0.98 + new MRR). Formulas are stated for every column, and the alternative scenario is modelled with a quantified runway effect (for example, no AE runs out around April 2027; delaying the CS hire to October still runs out around March 2027) and a clear, justified recommendation.
