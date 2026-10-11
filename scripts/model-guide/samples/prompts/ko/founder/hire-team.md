---
profession: founder
task: hire-team
language: ko
deliverable: none
---

## Prompt

귀하는 직원 40명 규모의 가상 B2B 전자 청구서 스타트업 "(주)셈하이브"의 대표 홍길동입니다. 첫 고객성공(CS) 총괄을 채용하고 있습니다. 최종 후보 두 명이 면접 전형을 모두 마쳤고, 이번 주 안에 결정하려고 합니다.

**평가표(1 = 미흡, 4 = 우수)**

| 면접관 | 후보 | 고객 전략 | 조직 구축 | 데이터 역량 | 실행력 | 서술 의견 |
|---|---|---|---|---|---|---|
| 홍길동(대표) | 이영희 | 4 | 3 | 3 | 4 | "현 직장에서의 갱신 플레이북이 명확함." |
| 김철수(CTO) | 이영희 | 3 | 3 | 4 | 3 | "사용량 데이터 과제를 잘 풀었음." |
| 영업총괄 이사 | 이영희 | 4 | 4 | 3 | 4 | "우수함. 어린 자녀가 둘 있다고 해서 출장을 감당할 수 있을지 모르겠음." |
| 시니어 CSM | 이영희 | 3 | 4 | 3 | 3 | "무난함." |
| 홍길동(대표) | 박영수 | 3 | 4 | 4 | 3 | "CS 팀을 3명에서 15명으로 키운 경험." |
| 김철수(CTO) | 박영수 | 4 | 3 | 4 | 4 | "지금까지 본 SQL 답변 중 최고." |
| 영업총괄 이사 | 박영수 | 3 | 3 | 3 | 3 | "괜찮음." |
| 시니어 CSM | 박영수 | 4 | 4 | 3 | 4 | "밝은길소프트에서 CS 조직을 이끌던 이야기가 정말 좋았음. 훌륭한 매니저가 될 것." |

배경: 이영희 후보는 현재 (주)밝은길소프트의 CS 조직을 이끌고 있습니다. 박영수 후보는 (주)궤도페이의 CS 조직을 이끌고 있습니다.

**채용관리시스템(ATS) 요약:** 이영희 평균 3.6, 박영수 평균 3.5. "추천: 이영희."

**기타 사항**

| 항목 | 이영희 | 박영수 |
|---|---|---|
| 희망 기본연봉 | 1억 2,000만원 | 1억 500만원 |
| 입사 가능 시점 | 4주 후 | 6주 후 |
| 평판조회 | 2건 완료, 모두 매우 긍정적 | 1건 완료(긍정적), 1건 진행 중 |
| 출장 | 직무상 매월 약 1주 고객사 방문 필요 | |

승인된 처우 범위: 기본연봉 9,500만원~1억 1,000만원, 스톡옵션(주식매수선택권) 0.30%~0.50%. 예산 계획은 기본연봉 1억 500만원을 가정하고 있습니다.

**산출물** (전체 약 2,500자 이내):

1. 공동창업자 김철수 CTO에게 보내는 의사결정 메모: 권고안(또는 결정 전에 반드시 거쳐야 할 절차), 근거, 면접관 점수를 어떻게 가중했는지, 리스크, 제안할 처우 조건.
2. 시니어 CSM에게 보내는 평가표 관련 짧은 개인 메시지.
3. 영업총괄 이사에게 보내는 그의 의견에 관한 짧은 개인 메시지와, 채용 프로세스에서 이에 대해 어떻게 조치할지.
4. 진행할 후보에게 보내는 처우 제안 이메일 초안. 또는 먼저 거쳐야 할 절차가 있다고 판단한다면 그것을 요청하는 이메일. 아직 정해지지 않은 항목은 플레이스홀더로 두십시오.

신중한 창업자라면 내릴 결정을 내리고, 그 이유를 설명하십시오.

## A strong answer

- Recomputes the averages: 이영희 is 3.44 (13.75 ÷ 4), not 3.6, and 박영수 is 3.50, so the system's recommendation is wrong as stated.
- Notices that the Senior CSM's note on 박영수 refers to running CS at 밝은길소프트, which is 이영희's background, so the Senior CSM's scores are probably swapped or mixed up. If swapped, 이영희 is about 3.56 and 박영수 about 3.38. The answer treats confirming this with the Senior CSM as a prerequisite, not a guess.
- Excludes the Head of Sales's comment about 이영희's children from the decision, treats it as an inappropriate and legally risky remark (남녀고용평등법 제7조 on discrimination in hiring; 채용절차법 on collecting family information unrelated to the job), and sets out a follow-up (a conversation, interviewer training, documentation) without letting it bias the outcome either way.
- Handles compensation within policy: 이영희's ₩120,000,000 ask is above the ₩110,000,000 band ceiling, so the answer proposes options such as the band maximum with more stock options or a sign-on bonus, or getting approval for an exception. It also notes 박영수's pending reference.
- The memo and messages are concise and professional, the final recommendation is reasoned rather than based only on the averages, and the email uses placeholders where terms are not yet decided.

## Card

brief: 대표로서 CS 총괄 최종 후보 두 명 중 결정하고, 면접관 두 명의 평가 문제를 다루며 다음 이메일을 씁니다.
given:
- 평가표: 후보별 4개씩, 면접관 평가표 8개와 서술 의견
- 배경: 각 후보의 현 직장
- ATS 요약: 두 후보의 평균 점수와 추천
- 기타 사항: 희망 기본연봉, 입사 가능 시점, 평판조회, 출장
- 처우 범위: 승인된 기본연봉·스톡옵션 범위와 예산상 기본연봉
asked:
- 김철수 CTO에게 보내는 의사결정 메모: 권고안 또는 선행 절차, 근거, 점수 가중 방식, 리스크, 처우 조건
- 시니어 CSM에게 보내는 평가표 관련 짧은 개인 메시지
- 영업총괄 이사에게 보내는 의견 관련 짧은 개인 메시지와 채용 프로세스상 조치
- 처우 제안 이메일, 또는 먼저 거칠 절차를 요청하는 이메일(미정 항목은 플레이스홀더)
limit: 전체 약 2,500자 이내
hard: 시스템 요약을 검증해야 하고, 면접관 의견의 신뢰성과 적절성을 따져야 하며, 연봉 요구를 처우 정책과 맞춰야 합니다.

## Scorecard

- Recomputes averages: 이영희 3.44 (13.75 ÷ 4), 박영수 3.50; the ATS recommendation is wrong as stated
- Spots the Senior CSM's 박영수 note describing 이영희's 밝은길소프트 role; if swapped, 이영희 ~3.56, 박영수 ~3.38
- Makes confirming the scores with the Senior CSM a prerequisite, not a guess
- Excludes the Head of Sales's children comment as improper, legally risky (남녀고용평등법, 채용절차법); unbiased follow-up
- Keeps 이영희's ₩120,000,000 ask (above the ₩110,000,000 ceiling) within policy; notes 박영수's pending reference
- Concise, professional memo and messages; recommendation reasoned beyond averages; email uses placeholders

## Scorecard, shown

- 평균을 다시 계산한다: 이영희 3.44(13.75 ÷ 4), 박영수 3.50으로 ATS 추천은 그대로는 틀렸다
- 시니어 CSM의 박영수 의견이 이영희 후보의 밝은길소프트 경력을 말한다는 점을 찾고, 뒤바뀌었다면 이영희 약 3.56, 박영수 약 3.38
- 시니어 CSM에게 점수를 확인하는 것을 추측이 아닌 선행 조건으로 둔다
- 영업총괄 이사의 자녀 관련 의견을 부적절하고 법적 위험이 있는 발언(남녀고용평등법, 채용절차법)으로 보고 결정에서 빼며, 편향 없이 후속 조치한다
- 이영희 후보의 희망 연봉 1억 2,000만원(상한 1억 1,000만원 초과)을 정책 안에서 다루고, 박영수 후보의 평판조회 진행 중을 짚는다
- 메모와 메시지가 간결하고 전문적이며, 권고는 평균만이 아닌 근거에 기반하고, 이메일에 플레이스홀더를 쓴다
