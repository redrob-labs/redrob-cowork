---
profession: engineer
task: debug-fix
language: ko
deliverable: none
---

## Prompt

귀하는 미국 중부(Central) 시간대에서 한인 마트 매장을 운영하는 가상의 기업 (주)들녘마트 미주법인 데이터팀의 당직 엔지니어입니다. 서울 본사 운영 대시보드의 "일별 순매출"이 재무팀 추출 데이터와 맞지 않게 되었고, 야간 배치가 한 번 실패했습니다. 근본 원인을 찾아 고쳐 주십시오. (미주 매장 매출은 현지 통화인 달러로 기록됩니다.)

**재무팀 이영희 님의 티켓:** "2025년 3월 9일(일) 테스트 매장 매출이 대시보드에서는 $185.00, 저희 쪽에서는 $100.00입니다. 평일에도 가끔 조금씩 높게 나옵니다. 그리고 3월 10일 오전에 배치가 실패했습니다. 재무팀 정의: 매장 현지 달력 기준 하루의 순매출 = 그날 생성된 주문의 (amount − refunded_amount) 합계, 취소(cancelled) 주문은 제외."

**모듈(장시간 실행되는 워커 프로세스 안에서 동작, Python 3.10):**

```python
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

STORE_TZ = ZoneInfo("America/Chicago")
UTC = ZoneInfo("UTC")


def day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime(d.year, d.month, d.day, tzinfo=STORE_TZ).astimezone(UTC)
    end = start + timedelta(hours=24)
    return start, end


def daily_revenue(orders: list[dict], d: date, _cache={}) -> Decimal:
    if d in _cache:
        return _cache[d]
    start, end = day_bounds(d)
    total = Decimal("0")
    for o in orders:
        ts = datetime.fromisoformat(o["created_at"])
        if start <= ts <= end and o["status"] != "refunded":
            total += Decimal(str(o["amount"]))
    _cache[d] = total
    return total
```

대시보드는 오늘과 어제에 대해 15분마다 `daily_revenue(fetch_orders(store_id), d)`를 호출합니다.

**해당 날짜 전후의 테스트 매장 주문:**

```json
[
  {"id": "A1", "created_at": "2025-03-09T05:30:00+00:00", "amount": 40.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A2", "created_at": "2025-03-09T06:00:00+00:00", "amount": 25.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A3", "created_at": "2025-03-09T18:15:00+00:00", "amount": 60.0, "refunded_amount": 15.0, "status": "partially_refunded"},
  {"id": "A6", "created_at": "2025-03-09T20:00:00+00:00", "amount": 20.0, "refunded_amount": 0, "status": "cancelled"},
  {"id": "A4", "created_at": "2025-03-10T04:59:59Z", "amount": 30.0, "refunded_amount": 0, "status": "paid"},
  {"id": "A5", "created_at": "2025-03-10T05:20:00+00:00", "amount": 50.0, "refunded_amount": 0, "status": "paid"}
]
```

**실패한 실행의 로그:**

```text
2025-03-10T11:00:02Z worker-3 ERROR daily_revenue store=T01 d=2025-03-09
Traceback (most recent call last):
  File "revenue.py", line 21, in daily_revenue
    ts = datetime.fromisoformat(o["created_at"])
ValueError: Invalid isoformat string: '2025-03-10T04:59:59Z'
```

참고로 $185.00이라는 수치는 Python 3.12 스테이징 환경에서 나온 것입니다.

**산출물** (설명은 약 2,500자 이내, 코드는 더 길어도 됩니다):

1. 근본 원인 분석: 각 결함, 그 결함이 설명하는 증상, 그리고 왜 일부 날짜에만 나타나는지.
2. 수정된 모듈. 변경을 정당화하지 않는 한 함수 시그니처를 유지하고, Python 3.10 호환성을 지키십시오.
3. 위 주문 데이터를 사용하는 pytest 회귀 테스트. 최소한 서머타임 종료일(2025년 11월 2일)과 현지 자정 정각에 생성된 주문을 포함하십시오.
4. 수정된 코드 기준 3월 9일의 계산 내역: 어떤 주문이 포함되고 왜 그런지.
5. 캐시를 유지해야 하는지와 그 이유를 한 문장으로.

## A strong answer

- Identifies the DST bug: adding 24 hours in UTC makes 9 March run to 06:00Z on 10 March instead of 05:00Z (the local day has 23 hours), which pulls in A5. The fix computes the next local midnight and then converts it, and the answer notes that 2 November has 25 hours.
- Identifies the inclusive end bound (`<= end`), which double-counts orders at exactly local midnight (A2 lands in both 8 and 9 March), and switches to a half-open interval [start, end).
- Fixes the business logic to subtract `refunded_amount`, exclude `cancelled`, and deal with fully refunded orders consistently, and reconciles the staging figure: $185.00 = 25 + 60 + 20 + 30 + 50.
- Explains the 3.10 crash (`fromisoformat` accepts "Z" only from 3.11) and parses robustly. Also explains that the mutable-default `_cache`, keyed only by date in a long-lived process, serves stale totals for today, and removes it or keys it properly with invalidation.
- The fixed code gives $100.00 for 9 March (A2 25 + A3 45 + A4 30), and the tests cover DST start and end and the midnight boundary.

## Card

brief: 마트 일별 순매출이 재무팀 수치와 어긋나고 배치가 실패한 원인을 찾아 Python 모듈을 고치고 테스트합니다.
given:
- 재무팀 티켓: 3월 9일 불일치, 배치 실패, 재무팀의 순매출 정의
- 모듈: 장시간 실행 워커에서 도는 Python 3.10 day_bounds·daily_revenue 함수
- 호출 방식: 대시보드가 15분마다 오늘과 어제에 대해 호출
- 테스트 매장 주문: 3월 9~10일 전후 주문 6건, JSON
- 오류 로그: 실패한 실행의 트레이스백 1건
- 스테이징 메모: $185.00은 Python 3.12 환경에서 나온 수치
asked:
- 근본 원인 분석: 결함별 증상과 일부 날짜에만 나타나는 이유
- Python 3.10과 호환되는 수정 모듈(정당화 없이 시그니처 유지)
- 주어진 주문, 서머타임 종료일, 현지 자정 정각 주문을 포함한 pytest 회귀 테스트
- 수정된 코드 기준 3월 9일 계산 내역
- 캐시 유지 여부와 이유를 한 문장으로
limit: 설명은 약 2,500자 이내, Markdown; 코드는 더 길어도 됨
hard: 서로 독립적인 여러 결함이 하나의 증상으로 합쳐지고, 특정 날짜나 런타임에서만 드러나며, 코드의 로직이 업무 정의와 다릅니다.

## Scorecard

- DST bug: +24h ends 9 March at 06:00Z, not 05:00Z, pulling in A5; notes 25-hour 2 November
- Uses next local midnight for the end and a half-open [start, end); explains A2 double-counted at midnight
- Subtracts refunded_amount, excludes cancelled, handles full refunds; reconciles $185.00 (25+60+20+30+50)
- Explains the 3.10 crash (fromisoformat accepts "Z" only from 3.11) and parses robustly
- Removes or properly keys the date-only mutable-default cache that serves stale totals for today
- Fixed code gives $100.00 for 9 March (A2 25, A3 45, A4 30); tests cover DST, midnight

## Scorecard, shown

- 서머타임 버그: +24시간이면 3월 9일이 05:00Z가 아닌 06:00Z에 끝나 A5가 포함되며, 25시간인 11월 2일도 언급한다
- 종료 시점을 다음 현지 자정으로 계산해 반열린 구간 [start, end)를 쓰고, 자정 정각 A2의 이중 집계를 설명한다
- refunded_amount를 빼고 cancelled를 제외하며 전액 환불을 처리하고, $185.00(25+60+20+30+50)을 맞춘다
- 3.10에서의 실패(fromisoformat은 3.11부터 "Z"를 받음)를 설명하고 견고하게 파싱한다
- 날짜만 키로 쓰는 가변 기본값 캐시가 오늘 합계를 낡은 값으로 내므로 제거하거나 제대로 키를 잡는다
- 수정 코드가 3월 9일 $100.00(A2 25, A3 45, A4 30)을 내고, 테스트가 서머타임과 자정 경계를 다룬다
