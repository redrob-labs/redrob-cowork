---
profession: engineer
task: design-systems
language: ko
deliverable: presentations
---

## Prompt

귀하는 온라인 쇼핑몰 판매자(머천트)들이 사용하는 가상의 택배 송장 API 회사 "(주)소포로"의 테크 리드입니다. 고객은 HTTPS 웹훅 엔드포인트를 등록해 배송 이벤트(`label.created`, `shipment.in_transit`, `shipment.delivered` 등)를 받습니다. 현재는 크론 잡이 1분마다 이벤트 테이블을 폴링하고, 고객 엔드포인트에 한 번에 하나씩 동기 방식으로 POST합니다. 다음 주 엔지니어링 리더십 리뷰에서 재설계안을 발표해야 합니다.

**현재 문제(장애 기록에서)**

- 지난달 한 머천트의 엔드포인트가 매 호출마다 30초 만에 타임아웃되었습니다. 전송이 순차적이어서 다른 모든 머천트의 이벤트가 최대 47분 지연되었습니다.
- 실패한 전송은 다음 크론 주기에만 재시도되며 백오프가 없습니다. 머천트 두 곳이 자사 장애 중에 재시도로 "디도스를 당했다"고 항의했습니다.
- 머천트는 전송 이력을 보거나 이벤트를 재전송(replay)할 수 없습니다.
- 같은 배송 건의 이벤트가 순서가 뒤바뀌어 도착하기도 합니다(`in_transit`보다 `delivered`가 먼저).

**수치**

| 지표 | 값 |
|---|---|
| 일일 이벤트 수(현재 평균) | 2,000,000 |
| 예상 성장 | 18개월 내 3배 |
| 피크 시간대 | 평균 처리율의 10배 |
| 등록된 엔드포인트 | 18,000개(약 1,200개가 트래픽의 80%를 받음) |
| 이벤트당 평균 시도 횟수(재시도 포함) | 1.3 |
| 전송 시도 1건당 저장 용량(페이로드, 헤더, 응답 일부) | 2 KB |
| 전송 이력 보관 요구 기간 | 30일 |

PM의 요구사항 초안: "피크 부하는 초당 약 2,300 이벤트. 전송은 정확히 한 번(exactly-once). 재시도는 최대 24시간."

**제약 조건**

- 팀: 백엔드 엔지니어 4명, 한 분기 안에 출시해야 함.
- 현재 스택: 관리형 관계형 DB(PostgreSQL), 관리형 오케스트레이터 위의 컨테이너, 다른 팀이 이미 쓰고 있는 관리형 메시지 큐. 팀원 중 자체 운영 분산 로그를 프로덕션에서 운영해 본 사람은 없음.
- 보안: 머천트가 웹훅이 소포로에서 보낸 것임을 검증할 수 있어야 함. 페이로드에 수취인 이름·연락처가 포함되므로 개인정보 보호법 적용 대상.

**산출물:** 마크다운 설계 리뷰 덱, 슬라이드 10~12장, 약 2,500자 이내. `### Slide n: 제목`, 그다음 글머리표, 그다음 한 줄짜리 발표자 노트를 쓰십시오. 다음을 포함하십시오.

- 문제 정의와 목표/비목표. 요구사항 초안 중 동의하지 않는 부분은 바로잡을 것.
- 용량 추정(현재와 18개월 후의 처리량을 평균과 피크로, 그리고 전송 이력 저장 용량). 계산 과정을 보여 줄 것.
- 아키텍처: 컴포넌트와 데이터 흐름을 한 장의 슬라이드에 간단한 ASCII 또는 Mermaid 다이어그램으로.
- 전송 보장 수준, 순서 보장, 재시도와 백오프 정책, 엔드포인트별 격리와 서킷 브레이커, 서명, 재전송 API.
- 큐잉 계층에 대해 검토한 옵션 최소 2가지와 명확한 권고 및 트레이드오프.
- 롤아웃과 마이그레이션 계획, 관측성(SLO와 알림), 주요 리스크.

## A strong answer

- Corrects the peak figure: 2,000,000 ÷ 86,400 ≈ 23 events/s on average, about 230/s at a 10× peak, and about 700/s at peak after 3× growth. The PM's 2,300/s is 10× too high, though it can be kept as deliberate headroom if the answer says so.
- Rejects exactly-once delivery over HTTP and proposes at-least-once with a stable event ID or idempotency key, plus guidance for merchants on deduplication.
- Sizes storage: about 2.6M attempts per day × 2 KB ≈ 5.2 GB a day, or about 156 GB over 30 days today and roughly 470 GB at 3× growth. Picks a partitioning or TTL approach to match, and treats the recipient PII in stored payloads appropriately (masking or minimisation, deletion at the 30-day limit).
- Solves head-of-line blocking with per-endpoint queues or concurrency limits, short timeouts, and exponential backoff with jitter over 24 hours plus circuit breaking. Addresses per-shipment ordering, for example by keying on shipment ID or including sequence numbers and timestamps.
- Recommends a queueing option that fits the team (for example the existing managed queue, or a Postgres outbox, rather than a self-hosted log), adds HMAC signing with timestamp and replay protection, and gives a phased migration with SLOs. The slide format is followed.

## Card

brief: 택배 송장 API의 웹훅 전송 재설계안을 요구사항 초안을 바로잡고 용량을 추정해 리더십에 발표합니다.
given:
- 현재 설계: 1분마다 이벤트를 폴링해 엔드포인트에 하나씩 POST하는 크론 잡
- 장애 기록: 지연, 재시도, 전송 이력, 순서에 관한 문제 4건
- 수치: 이벤트 수, 성장, 피크, 엔드포인트, 시도 횟수, 저장 용량, 보관 기간 7개 지표
- PM 요구사항 초안: 피크 부하, 전송 보장, 재시도 기간
- 제약 조건: 팀 규모와 기한, 현재 스택과 운영 경험, 서명과 개인정보 보호법 요건
asked:
- 문제 정의와 목표/비목표, 요구사항 초안 바로잡기
- 처리량과 전송 이력 저장 용량 추정, 계산 과정 포함
- 한 장의 다이어그램으로 보인 아키텍처
- 전송 보장, 순서, 재시도·백오프, 엔드포인트별 격리와 서킷 브레이커, 서명, 재전송 API
- 큐잉 계층 옵션 2가지 이상과 권고, 트레이드오프
- 롤아웃·마이그레이션 계획, 관측성(SLO와 알림), 주요 리스크
limit: 슬라이드 10~12장, 약 2,500자 이내, Markdown 슬라이드 형식
hard: 요구사항 초안을 수치와 HTTP가 보장할 수 있는 범위에 비추어 검증해야 하고, 설계가 소규모 팀의 역량과 한 분기 기한에 맞아야 합니다.

## Scorecard

- Computes ~23 events/s average, ~230/s peak, ~700/s peak after 3× growth; calls 2,300/s 10× high
- Rejects exactly-once over HTTP; proposes at-least-once with stable event IDs and merchant dedup guidance
- Sizes storage ~5.2 GB/day, ~156 GB/30 days, ~470 GB at 3×; partitions or TTL; minimises recipient PII
- Per-endpoint isolation, short timeouts, jittered backoff over 24h, circuit breaking; per-shipment ordering by key or sequence
- Recommends the managed queue or a Postgres outbox over a self-hosted log; HMAC signing with timestamp
- Gives a phased migration with SLOs, and a speaker note on every slide

## Scorecard, shown

- 평균 초당 약 23건, 피크 약 230건, 3배 성장 후 피크 약 700건을 계산하고 초당 2,300건은 10배 과다라고 지적한다
- HTTP에서 exactly-once를 거부하고, 안정적인 이벤트 ID를 쓰는 at-least-once와 머천트 중복 제거 가이드를 제안한다
- 저장 용량을 하루 약 5.2GB, 30일 약 156GB, 3배 성장 시 약 470GB로 추정해 파티션·TTL을 정하고 수취인 개인정보를 최소화한다
- 엔드포인트별 격리, 짧은 타임아웃, 24시간에 걸친 지터 백오프, 서킷 브레이커, 키나 시퀀스로 배송 건별 순서를 보장한다
- 자체 운영 분산 로그 대신 관리형 큐나 Postgres 아웃박스를 권고하고, 타임스탬프를 포함한 HMAC 서명을 쓴다
- 단계적 마이그레이션과 SLO를 제시하고, 슬라이드마다 발표자 노트를 단다
