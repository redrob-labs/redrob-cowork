---
profession: pm
task: analyze-metrics
language: ko
deliverable: spreadsheets
---

## Prompt

당신은 14일 무료 체험을 제공하는 협업·프로젝트 관리 SaaS '태스크온'의 프로덕트 애널리스트입니다. 그로스팀이 신규 체험 가입자에게 새 온보딩 체크리스트를 보여 주는 A/B 테스트를 진행했습니다. 배정은 가입 시점에 **50:50**으로 이루어지도록 설계되었습니다. 테스트는 14일로 계획되었지만 **9일 차**에 중단되었습니다. 그로스 PM 김철수 님은 바로 배포하고 싶어 합니다.

> "활성화율이 23.0%에서 26.0%로 올랐어요. 상대적으로 13% 상승입니다. 월요일에 100% 배포합시다."

**활성화** = 가입 후 48시간 이내에 태스크를 3개 이상 생성. **유료 전환** = 가입 후 48시간 이내에 유료 플랜으로 업그레이드. 아래 표는 1~7일 차 가입자만 포함하므로 모든 사용자에게 48시간 관찰 기간이 온전히 확보되어 있습니다.

**전체 결과**

| 그룹 | 배정 사용자 | 활성화 | 유료 전환 |
|---|---|---|---|
| 대조군 | 10,000 | 2,300 | 410 |
| 체크리스트 | 9,200 | 2,392 | 386 |

**플랫폼별 결과**

| 그룹 | 플랫폼 | 사용자 | 활성화 | 유료 전환 |
|---|---|---|---|---|
| 대조군 | 웹 | 6,000 | 1,500 | 270 |
| 대조군 | iOS | 2,500 | 500 | 90 |
| 대조군 | Android | 1,500 | 300 | 50 |
| 체크리스트 | 웹 | 6,000 | 1,620 | 276 |
| 체크리스트 | iOS | 1,700 | 442 | 62 |
| 체크리스트 | Android | 1,500 | 330 | 48 |

**개발팀 공지 (7일 차 사내 메신저 게시)**

> "iOS 5.2.0 빌드가 일부 구형 기기에서 체크리스트를 렌더링할 때 크래시가 났습니다. 크래시는 배정 이벤트가 기록되기 전에 발생했습니다. 5.2.1에서 수정했고 6일 차에 배포했습니다." (이영희)

**제출물** (마크다운, 약 2,500자 이내):

1. 데이터 품질 점검: 전체 및 플랫폼별로 배정 비율이 의도한 50:50과 일치하는지 검정하세요. 사용한 검정 방법과 결과를 제시하세요.
2. 플랫폼별 및 전체 결과 표: 활성화와 유료 전환 각각에 대해 비율, 절대 차이와 상대 차이, 유의성 검정(예: 두 비율 z-검정)을 포함하세요. 계산된 각 열의 공식을 밝히세요.
3. 해석: 어떤 수치를 신뢰하고 어떤 수치를 신뢰하지 않는지, 그 이유는 무엇인지.
4. 김철수 님께 드리는 권고 (약 400자 이내): 배포, 배포 보류, 또는 구체적인 대안 중 하나. 권고를 바꾸려면 무엇을 확인해야 하는지도 포함하세요.

## A strong answer

- Detects a sample ratio mismatch: 10,000 vs 9,200 against an expected 9,600 each gives χ² ≈ 33 (p < 0.001). It is traced to iOS (2,500 vs 1,700) and linked to the crash before assignment logging. Web and Android are balanced.
- Refuses to report the pooled +13% relative lift, or the iOS lift (20% → 26%), as valid, because the surviving iOS users are a biased sample.
- Analyses the platforms with valid splits separately. Web activation rises from 25.0% to 27.0% (z ≈ 2.5, p ≈ 0.01). Android goes from 20.0% to 22.0% (z ≈ 1.3, not significant).
- Notes that paid conversion is essentially flat (4.10% vs about 4.20% overall; web 4.5% vs 4.6%), that the test was stopped early at day 9 of 14, and that 48-hour activation is only a proxy for retention and revenue.
- Recommends a specific path, such as not shipping on the pooled result, fixing logging, and rerunning or extending to the full 14 days (optionally starting web-first), with a stated decision criterion. Formulas are shown.
