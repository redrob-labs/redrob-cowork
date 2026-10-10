---
profession: lawyer
task: draft
language: ko
deliverable: documents
---

## Prompt

당신은 서울에 본사를 둔 펀힐웰니스(주)의 외부 자문 변호사입니다. 펀힐은 판교의 앱 개발사 오빗메이드스튜디오(주)에 iOS·안드로이드용 소비자 수면 측정 앱 개발을 맡기려 합니다. 아래 자료를 바탕으로 대한민국 법을 준거법으로 하는 「소프트웨어 개발 및 지식재산권 양도 계약서」를 작성하세요. 펀힐을 보호하되 개발사가 서명할 수 있는 수준으로 작성하세요.

**대표이사 텀시트 (홍길동, 펀힐)**

| 조건 | 펀힐 입장 |
|---|---|
| 대금 | 고정 대금 3억원(부가가치세 별도) |
| 마일스톤 | M1 기획 3,000만원; M2 디자인 6,000만원; M3 베타 1억 800만원; M4 스토어 출시 9,600만원 |
| 지식재산권 | "전부 업무상저작물. 모든 권리는 우리 것." |
| 검수 | "우리가 만족할 때까지 테스트." |
| 책임 | 개발사 무한 책임, 상한 없음 |
| 데이터 | 앱이 웨어러블에서 수면·심박 데이터를 수집. 펀힐은 의료기관이 아니며 앱은 의료기기가 아닌 웰니스 제품으로 출시 |
| 일정 | 2026년 6월 30일까지 스토어 출시 |

**개발사 수정 의견 (박영수, 오빗메이드)**

> - 기존에 보유한 "오빗메이드 코어" UI·네트워킹 라이브러리는 당사가 소유하고 펀힐에 사용을 허락한다.
> - 모바일 앱에 GPL-3.0 라이선스의 오픈소스 오디오 라이브러리 "슬립웨이브"를 포함한다. 그 밖의 오픈소스는 MIT/Apache다.
> - 납품 후 5영업일이 지나면 검수 완료로 본다.
> - 책임 상한은 직전 3개월간 지급된 대금, 예외 없음.
> - QA는 검증된 해외 협력사(베트남)에 재위탁한다. 테스트에는 실제 사용자 데이터 일부를 사용한다.
> - 상호 12개월 직원 유인 금지.

**저작권법 발췌**

> 제2조 제31호: "업무상저작물"은 법인·단체 그 밖의 사용자(이하 "법인등"이라 한다)의 기획하에 법인등의 업무에 종사하는 자가 업무상 작성하는 저작물을 말한다.
> 제9조: 법인등의 명의로 공표되는 업무상저작물의 저작자는 계약 또는 근무규칙 등에 다른 정함이 없는 때에는 그 법인등이 된다. 다만, 컴퓨터프로그램저작물의 경우 공표될 것을 요하지 아니한다.
> 제45조 제1항: 저작재산권은 전부 또는 일부를 양도할 수 있다. 제2항: 저작재산권의 전부를 양도하는 경우에 특약이 없는 때에는 2차적저작물을 작성하여 이용할 권리는 포함되지 아니한 것으로 추정한다. 다만, 프로그램의 경우 특약이 없으면 2차적저작물작성권도 함께 양도된 것으로 추정한다.
> 제14조 제1항: 저작인격권은 저작자 일신에 전속한다. 제54조(요약): 저작재산권의 양도는 등록하지 아니하면 제3자에게 대항할 수 없다.

**개인정보 보호법 발췌**

> 제23조(요약): 건강 등에 관한 정보(민감정보)는 정보주체에게 별도로 동의를 받은 경우 등에만 처리할 수 있다. 제26조 제1항(요약): 개인정보 처리업무를 위탁하는 경우 위탁업무 목적 외 처리 금지, 기술적·관리적 보호조치 등이 포함된 문서로 하여야 한다. 제6항: 수탁자는 위탁자의 동의를 받은 경우에만 제3자에게 다시 위탁할 수 있다. 제28조의8(요약): 개인정보를 국외로 이전하려면 별도 동의 등 법정 요건 중 하나를 갖추어야 한다.

**작성할 것 (마크다운):**

1. **계약서.** 다음 조항을 완전한 문장으로 작성하세요: 정의(핵심 용어만); 용역 및 과업지시서; 대금 및 마일스톤; 검수; 지식재산권(양도, 기존 보유 자산, 오픈소스); 개인정보·보안 및 재위탁; 보증; 면책(손해보전); 책임 제한; 계약 기간 및 해지(해지 시 펀힐이 받는 것 포함); 직원 유인 금지; 준거법 및 관할. 나머지 일반 조항은 제목만 나열하세요. 미정인 사업 조건은 대괄호 자리표시자로 남기세요.
2. **홍길동 대표에게 보내는 메일** (약 400자 이내): 텀시트와 다르게 정한 서너 가지 입장과 그 이유, 대표가 아직 결정해야 할 사항.

전체 분량은 약 2,500자 이내로 하세요. 전문(前文) 없이 간결한 실무 조항으로 작성하세요.

## A strong answer

- Notices that the milestones add up to ₩2억 9,400만, not the ₩3억 fixed fee (a ₩600만 gap). Resolves it with a placeholder or a stated assumption and raises it in the cover email instead of silently picking one figure.
- Doesn't rely on "업무상저작물": the agency's developers are not persons "engaged in Fernhill's business", so 저작권법 §9 doesn't vest authorship in Fernhill. Includes an express present assignment of all 저작재산권, expressly including 2차적저작물작성권 (rather than relying on the §45② presumption for programs), a covenant not to exercise 저작인격권 (which cannot be assigned under §14), cooperation with registration under §54, and further-assurances language.
- Carves out 오빗메이드 코어 with a perpetual, irrevocable, royalty-free license that is transferable with the app. Restricts open source to pre-approved permissive licenses and prohibits GPL-3.0 components in the distributed app (or requires Fernhill's written approval), explaining the copyleft risk to the source code.
- Balances acceptance (for example 10 business days, a written rejection with reasons, two cure rounds, and deemed acceptance only after a reminder notice) and the liability cap (for example 12 months of fees or the full contract value, with exclusions for IP indemnity, confidentiality/personal-data breach and 고의·중과실). Explains both in the cover email.
- Treats the overseas QA subcontracting as a personal-data issue: a written 위탁 clause meeting 개인정보 보호법 §26①, Fernhill's prior written consent for any 재위탁 (§26⑥), no real user health data in QA without meeting §23 and the §28조의8 cross-border requirements (synthetic or pseudonymised data instead), flow-down of security and confidentiality, and 오빗메이드's responsibility for its subcontractors. On termination, Fernhill receives the source code and work in progress on payment of amounts due. Governing law is Korean, with 서울중앙지방법원 as the agreed court.

## Card

brief: 텀시트와 개발사 의견을 조율해, 한국 법이 준거법인 앱 개발·지식재산권 양도 계약서를 작성합니다.
given:
- 대표이사 텀시트: 대금, 마일스톤, 지식재산권, 검수, 책임, 데이터, 일정 등 7개 조건
- 개발사 수정 의견: 기존 라이브러리, 오픈소스, 검수, 책임 상한, 해외 재위탁, 유인 금지 등 6개 입장
- 저작권법 발췌: 제2조 제31호, 제9조, 제45조, 제14조, 제54조
- 개인정보 보호법 발췌: 제23조, 제26조, 제28조의8
asked:
- 계약서: 지정된 12개 조항은 완전한 문장으로, 나머지 일반 조항은 제목만
- 홍길동 대표에게 보내는 메일: 텀시트와 다르게 정한 입장, 이유, 남은 결정 사항
limit: 전체 약 2,500자 이내, 대표 메일은 약 400자 이내, Markdown
hard: 입력 자료에 불일치가 숨어 있고 법령이 권리·개인정보 구조를 좌우하며, 양측 입장을 서명 가능한 조건으로 조율해야 합니다.

## Scorecard

- Milestones total ₩2억 9,400만, not ₩3억; ₩600만 gap left as placeholder or assumption, raised in the email
- Not 업무상저작물 (§9): present assignment incl. 2차적저작물작성권, 저작인격권 non-exercise, §54 registration help
- 오빗메이드 코어 licensed perpetual, irrevocable, royalty-free, transferable; GPL-3.0 barred or needs 펀힐's approval
- Balanced acceptance (e.g. 10 business days, written reasons, cure rounds) and cap with IP, data, 고의·중과실 exclusions
- Overseas QA: §26① 위탁 terms, consent for 재위탁 (§26⑥), no real health data without §23/§28조의8
- Subcontractor flow-down and 오빗메이드 liability; source code on termination; Korean law, 서울중앙지방법원

## Scorecard, shown

- 마일스톤 합계 2억 9,400만원(3억원 아님), 600만원 차이는 자리표시자나 전제로 처리하고 메일에서 제기
- 업무상저작물에 의존하지 않음(제9조): 2차적저작물작성권을 포함한 양도, 저작인격권 불행사, 제54조 등록 협조
- 오빗메이드 코어는 영구·취소 불가·무상·양도 가능 라이선스, GPL-3.0은 금지하거나 펀힐 서면 승인 필요
- 균형 잡힌 검수(예: 10영업일, 서면 사유, 보완 기회)와 지식재산권·개인정보·고의·중과실 예외가 있는 책임 상한
- 해외 QA: 제26조 제1항 위탁 문서, 재위탁 사전 동의(제26조 제6항), 제23조·제28조의8 충족 없이 실제 건강 데이터 사용 금지
- 재위탁사에 의무 전가와 오빗메이드 책임, 해지 시 소스 코드 인도, 대한민국 법·서울중앙지방법원
