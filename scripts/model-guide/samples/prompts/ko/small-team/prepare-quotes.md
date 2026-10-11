---
profession: small-team
task: prepare-quotes
language: ko
deliverable: documents
---

## Prompt

당신은 직원 5명의 IT 유지보수(매니지드 서비스) 업체 '푸른심지IT'에서 일합니다. 신규 고객인 향나무치과의원의 견적서를 준비하세요.

**고객 이메일 (이영희 실장)**

> "PC 10대 교체하고, 와이파이 제대로 깔고, 개인정보보호법에 맞는 백업 체계를 갖추고, 매달 관리도 맡기고 싶어요. 이번 프로젝트 예산은 1,700만 원 정도(부가세 별도)예요. 이번 주 안에 견적 보내 주실 수 있나요?"

**현장 실사 메모 (김철수, 푸른심지IT)**

- 직원 사용자 11명. **사용 중인 PC는 12대**: 직원용 10대, X선 센서가 연결된 진료실 영상 PC 2대. 영상 PC는 센서뷰 v6을 쓰는데, 영상 장비 업체가 지정 하드웨어에서만 동작을 보증합니다. 교체하려면 업체 승인이 필요합니다.
- 네트워크: 통신사 공유기, 8포트 비관리형 스위치, 가정용 와이파이, 업무용 방화벽 없음. 커버리지를 위해 AP 3대 필요.
- 백업: 데스크 직원이 USB 외장 드라이브를 교체 보관. **마지막 백업 성공은 4개월 전**. 진료 관리 프로그램 DB에 환자 기록이 있습니다.
- 기존 모니터는 상태가 좋아 그대로 씁니다.

**푸른심지IT 가격표 (원가 → 정가, 부가세 별도)**

| 품목 | 단위 원가 | 정가 |
|---|---|---|
| 업무용 PC (i5, 16GB, 512GB SSD) | 900,000원 | 1,125,000원 |
| 무선 AP | 300,000원 | 375,000원 |
| 방화벽 장비 | 600,000원 | 750,000원 |
| 방화벽 보안 구독 (연간) | 연 360,000원 | 연 500,000원 |
| 24포트 관리형 PoE 스위치 | 720,000원 | 900,000원 |
| 백업 어플라이언스 | 1,200,000원 | 1,500,000원 |
| 암호화 클라우드 백업 (국내 리전 저장, 업체가 개인정보 처리 수탁 계약 체결) | 월 120,000원 | 월 180,000원 |

**인건비 및 서비스**

- 시간당 100,000원. PC 설치 및 데이터 이전: PC당 2.5시간. 네트워크 구축: 10시간. 백업 구성 및 복원 테스트: 6시간. 프로젝트 관리: 인건비의 10%.
- 월 유지보수: 사용자당 월 80,000원.

**푸른심지IT 견적 정책**

- 하드웨어 매출총이익률 **최소 25%**. 이익률 = (판매가 − 원가) ÷ 판매가.
- 견적 유효기간 30일. 수락 시 하드웨어 금액의 50%를 선금으로 받고, 잔금은 완료 시 받습니다.
- 의료기관 고객과는 개인정보 처리 업무 위탁 계약(개인정보보호법 제26조)을 체결합니다. 어떤 솔루션도 "개인정보보호법 인증"이나 "법규 준수 보장"이라고 표현하지 않습니다. 고객의 개인정보보호법·의료법상 보호 의무 이행을 지원한다고 표현합니다.

**제출물** (마크다운, 약 2,500자 이내):

1. 견적서: 요약, 작업 범위, 일회성 비용의 품목 표(수량, 단가, 금액), 반복 비용(월·연) 별도 표, 합계, 가정 및 제외 사항, 계약 조건.
2. 범위가 예산에 맞지 않으면 선택안이나 단계별 안을 제시하고, 하나를 근거와 함께 추천하세요.
3. 이영희 실장께 보내는 안내 이메일 (약 300자 이내).
4. 대표에게 보내는 내부 메모 (약 200자 이내): 발견한 가격 또는 범위 문제.

## A strong answer

- Catches that the list prices are a 25% *markup*, not a 25% *margin*. The PC margin is (1,125,000 − 900,000) ÷ 1,125,000 = 20.0%, and every hardware line is at 20%, below 25%. The answer re-prices to policy (cost ÷ 0.75: PC ₩1,200,000, AP ₩400,000, firewall ₩800,000, switch ₩960,000, backup appliance ₩1,600,000) or flags the issue with numbers for the owner.
- Scopes 10 staff PCs and handles the 2 imaging PCs as excluded or optional pending the vendor's sign-off, explaining the 10 versus 12 count.
- The totals are correct for the prices used. Labour is 41 h × ₩100,000 = ₩4,100,000 plus 10% PM = ₩4,510,000. With policy pricing, hardware is ₩16,560,000 and the one-off total is ₩21,070,000 (VAT extra). Recurring costs are shown separately: support at 11 × ₩80,000 = ₩880,000/month, cloud backup at ₩180,000/month and the firewall subscription at ₩500,000/year.
- Addresses the ₩17M budget with options or phases, and prioritises the backup appliance, cloud backup and firewall in phase 1, given the 4-month-old last backup and the patient data.
- Uses compliant language (a personal-information processing entrustment contract is offered, and the solution supports the clinic's PIPA / Medical Service Act obligations rather than being "PIPA compliant/certified") and includes the 30-day validity and the 50% hardware deposit terms.

## Card

brief: 치과의원의 PC·네트워크·백업·유지보수 견적을 가격 정책과 고객 예산에 맞춰 작성한다.
given:
- 고객 이메일: 요청 범위와 약 1,700만 원(부가세 별도) 예산
- 현장 실사 메모: 사용자 수, 사용 중인 PC, 네트워크, 백업 상태, 모니터
- 가격표: 품목 7개의 원가와 정가
- 인건비 및 서비스: 시간당 단가, 작업별 시간, 프로젝트 관리, 월 유지보수
- 견적 정책: 최소 이익률, 계약 조건, 개인정보보호법 관련 표현 규칙
asked:
- 견적서: 요약, 작업 범위, 일회성·반복 비용 표, 합계, 가정·제외 사항, 계약 조건
- 범위가 예산을 넘으면 선택안이나 단계별 안과 추천안
- 이영희 실장께 보내는 안내 이메일(약 300자 이내)
- 대표에게 보내는 가격·범위 문제 내부 메모(약 200자 이내)
limit: 약 2,500자 이내, Markdown
hard: 요청, 실사, 가격표가 서로 또는 정책과 맞지 않고, 예산 때문에 우선순위를 정해야 한다.

## Scorecard

- Spots 25% markup, not margin: PC (1,125,000 − 900,000) ÷ 1,125,000 = 20.0%; every hardware line at 20%
- Re-prices at cost ÷ 0.75 (PC ₩1.2M, AP ₩400k, firewall ₩800k, switch ₩960k, backup ₩1.6M) or flags it
- Quotes 10 staff PCs; imaging PCs excluded or optional pending vendor sign-off; 10 vs 12 explained
- Labour ₩4,510,000 (41 h + 10% PM); one-off ₩21,070,000; recurring ₩880,000 + ₩180,000/month, ₩500,000/year
- Phases to the ₩17M budget, with backup appliance, cloud backup and firewall first
- Offers an entrustment contract, "supports PIPA obligations", never "compliant/certified"; 30-day validity, 50% hardware deposit

## Scorecard, shown

- 정가가 이익률이 아닌 25% 마크업임을 지적: PC (1,125,000 − 900,000) ÷ 1,125,000 = 20.0%, 하드웨어 전 품목 20%
- 원가 ÷ 0.75로 재산정(PC 120만 원, AP 40만 원, 방화벽 80만 원, 스위치 96만 원, 백업 160만 원) 또는 보고
- 직원용 PC 10대 견적, 영상 PC는 업체 승인 전까지 제외 또는 선택 항목, 10대 대 12대 설명
- 인건비 4,510,000원(41시간 + PM 10%), 일회성 21,070,000원, 반복 월 880,000원 + 180,000원, 연 500,000원
- 1,700만 원 예산에 맞춰 단계화, 백업 어플라이언스·클라우드 백업·방화벽을 1단계로
- 처리 위탁 계약 제시, "보호 의무 이행 지원"으로 표현하고 "인증·준수 보장" 없음, 유효기간 30일, 하드웨어 선금 50%
