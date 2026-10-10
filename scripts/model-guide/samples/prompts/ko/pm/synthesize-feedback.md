---
profession: pm
task: synthesize-feedback
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 중견기업용 경비·법인카드 관리 SaaS '페이로그'의 PM입니다. 3분기 기획에 앞서 VP가 지난달 고객 피드백을 종합해 달라고 요청했습니다. 주요 주제가 무엇인지, 주제별로 걸린 매출이 얼마인지, 어떤 세 가지에 대응해야 하는지를 알고 싶어 합니다. 아래는 NPS 설문, 고객 문의, 영업 미팅 메모에 기록된 내용 전부입니다.

| # | 출처 | 고객사 | 플랜 | ARR | NPS | 원문 |
|---|---|---|---|---|---|---|
| 1 | 설문 | 솔숲물류 | Enterprise | 9,600만 원 | 4 | "한국어가 아닌 영수증은 전부 잘못 읽어요. 독일 법인 팀은 다 손으로 입력합니다." |
| 2 | 문의 | 금잔화스튜디오 | Starter | 300만 원 | — | "회계 프로그램으로 내보내는 방법이 있나요? 매달 CSV를 직접 만들고 있어요." |
| 3 | 설문 | 다온헬스케어 | Business | 2,800만 원 | 6 | "결재 라인이 너무 경직돼 있어요. 500만 원 초과 건은 2차 결재자가 필요합니다." |
| 4 | 영업 미팅 | 솔숲물류 | Enterprise | 6,900만 원 | — | "2분기까지 다국어 OCR이 안 되면 재계약이 어렵습니다. 독일어·폴란드어 영수증이요." |
| 5 | 설문 | 들꽃디자인 | Business | 2,200만 원 | 7 | "모바일 앱이 매일 로그아웃돼요." |
| 6 | 문의 | 한울로보틱스 | Business | 3,100만 원 | — | "현장 기사들 모바일 앱이 계속 로그아웃돼서 작성 중이던 경비가 날아갑니다." |
| 7 | 설문 | 바른숲치과 | Starter | 240만 원 | 9 | "아주 좋아요. 다크 모드가 있으면 좋겠어요." |
| 8 | 설문 | 다온헬스케어 | Business | 2,800만 원 | 5 | "결재 규칙에 금액 기준이 있어야 해요." |
| 9 | 문의 | 갯벌미디어 | Starter | 360만 원 | — | "회계 프로그램 연결하는 메뉴를 못 찾겠어요." |
| 10 | 설문 | 해오름해운 | Enterprise | 7,400만 원 | 3 | "베트남어·중국어 영수증은 글자가 깨져요. 재무팀이 다시 입력합니다." |
| 11 | 영업 미팅 | 솔빛랩스 | Business | 1,800만 원 | — | "경쟁사 대신 저희를 택했지만 부서별 조건부 결재가 필요합니다." |
| 12 | 설문 | 한울로보틱스 | Business | 3,100만 원 | 4 | "모바일 앱이 수시로 로그아웃됩니다." |
| 13 | 설문 | 제비꽃이벤트 | Starter | 180만 원 | 8 | "회계 프로그램 내보내기가 있으면 몇 시간은 아낄 텐데요." |
| 14 | 설문 | 새벽장터마트 | Business | 2,600만 원 | 2 | "법인카드 대사가 매달 일주일씩 밀려요. 카드사 연동에서 거래가 빠집니다." |
| 15 | 문의 | 새벽장터마트 | Business | 2,600만 원 | — | "카드 내역 연동에서 또 거래가 빠졌어요. 3일부터 9일까지요." |
| 16 | 설문 | 엉겅퀴건축 | Business | 1,500만 원 | 7 | "모바일 세션 만료가 정말 짜증 나요." |

**제품 메모**

- 회계 프로그램 내보내기 기능(장부연동)은 3월에 출시되었습니다. 설정 › 연동 메뉴에 있으며 모든 플랜에서 사용할 수 있습니다.
- 개발팀의 대략적 규모 추정: 다국어 OCR 1분기. 모바일 세션 문제(토큰 갱신 버그로 추정) 2주. 결재 금액 기준 6주. 카드 내역 연동 안정성은 미정(카드사 스크래핑 연동 업체에 좌우됨).

**제출물** (마크다운, 약 2,500자 이내):

1. 코딩 표: 행 번호별로 주제, 기능 부재·버그·안정성 문제·발견성 문제 중 어디에 해당하는지, 다른 행과 중복되는지.
2. 주제 요약 표: 언급 수, 고유 고객사 수, 고유 고객사 ARR, 최저 NPS, 해당 플랜. 계산된 각 열의 방법을 밝히세요(예: 고객사 중복을 어떻게 제거했는지, 어떤 ARR 수치를 신뢰했는지).
3. 우선순위대로 정리한 상위 세 가지 권고안과 각각의 근거 및 증거. 매출 집중도, 영향 범위, 공수를 어떻게 저울질했는지 설명하세요.
4. VP가 이 자료로 행동하기 전에 알아야 할 데이터상의 주의 사항.

## A strong answer

- Deduplicates by account: mobile logout is 3 unique accounts / ₩68M (Hanul Robotics counted once), OCR 2 accounts, approvals 2 accounts / ₩46M, and the card feed 1 account / ₩26M. The method is stated.
- Flags that Solsup Logistics' ARR conflicts between the rows (₩96M vs ₩69M, likely a transposition), says which figure it uses (for example, OCR at ₩170M on ₩96M), and recommends checking the CRM.
- Classifies the accounting-export requests (rows 2, 9 and 13) as discoverability or onboarding problems, because the export (Jangbu-yeondong) already shipped, not as a build request.
- The recommendations weigh the OCR renewal risk (two Enterprise accounts) against the cheap, broad mobile bug fix, and treat the card feed as a data-integrity risk even with a single account. Each call is justified.
- The caveats cover the small, mixed-source sample: 16 rows, about 12 accounts, NPS from only 10 survey responses, and sales notes that aren't comparable with survey data.

## Card

brief: 설문·문의·영업 메모 한 달 치를 주제별 매출과 함께 종합하고 대응할 세 가지를 권고한다.
given:
- 피드백 기록: 출처, 고객사, 플랜, ARR, NPS, 원문이 담긴 16행
- 제품 메모: 이미 출시된 회계 프로그램 내보내기 기능의 위치와 제공 플랜
- 개발팀 추정: 대응 후보 4가지의 대략적 공수
asked:
- 코딩 표: 행별 주제, 문제 유형, 중복 여부
- 주제 요약 표: 언급 수, 고유 고객사 수와 ARR, 최저 NPS, 플랜, 계산 방법
- 매출 집중도·영향 범위·공수를 저울질한 우선순위별 상위 세 가지 권고안
- VP가 알아야 할 데이터상 주의 사항
limit: 약 2,500자 이내, Markdown
hard: 기록은 신중한 중복 제거가 필요하고, 서로 어긋나는 수치와 겉보기와 다른 요청이 있으며, 우선순위는 판단의 문제다.

## Scorecard

- Dedupes by account, method stated: mobile logout 3 (₩68M), OCR 2, approvals 2 (₩46M), card feed 1 (₩26M)
- Flags Solsup Logistics' ARR conflict (₩96M vs ₩69M), picks one (e.g. OCR ₩170M), suggests checking the CRM
- Codes accounting-export rows 2, 9 and 13 as discoverability, since Jangbu-yeondong already shipped
- Weighs OCR renewal risk (two Enterprise accounts) against the cheap, broad mobile fix, each call justified
- Treats the card feed as a data-integrity risk despite only one account
- Caveats: 16 rows, about 12 accounts, NPS from 10 survey responses, sales notes not comparable

## Scorecard, shown

- 고객사 기준 중복 제거, 방법 명시: 모바일 로그아웃 3곳(6,800만 원), OCR 2곳, 결재 2곳(4,600만 원), 카드 연동 1곳(2,600만 원)
- 솔숲물류 ARR 불일치(9,600만 대 6,900만 원)를 지적하고 하나를 택하며(예: OCR 1억 7,000만 원) CRM 확인 권고
- 회계 내보내기 요청(2, 9, 13행)을 발견성 문제로 분류: 장부연동은 이미 출시됨
- OCR 재계약 리스크(Enterprise 2곳)와 저렴하고 영향이 넓은 모바일 수정을 저울질하고 각 판단을 정당화
- 카드 내역 연동은 고객사 1곳뿐이어도 데이터 무결성 리스크로 다룸
- 주의 사항: 16행, 약 12개 고객사, 설문 응답 10건뿐인 NPS, 설문과 비교하기 어려운 영업 메모
