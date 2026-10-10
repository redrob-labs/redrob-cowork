---
profession: engineer
task: write-tests
language: ko
deliverable: none
---

## Prompt

귀하는 가상의 SaaS 노트 앱 회사 "(주)퀼스택"에서 결제(billing) 라이브러리 v2.4.0 릴리스 검증을 맡은 엔지니어입니다(Python 3.12, pytest). 릴리스 노트는 다음과 같습니다.

> **v2.4.0.** 요금제 변경 당일을 새 요금제 가격으로 청구하도록 일할 계산을 수정했습니다. 이제 원 단위에서 반올림(half-up)합니다. API 변경 없음.

릴리스 매니저 홍길동 님이 오늘 업무 종료 전까지 go/no-go 판단을 원합니다. 현재 이 모듈에는 테스트가 없습니다. 코드는 다음과 같습니다.

```python
# billing/proration.py
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP


@dataclass(frozen=True)
class Plan:
    code: str
    monthly_price: Decimal  # 결제 주기당 금액(원)


def days_in_period(start: date, end: date) -> int:
    """결제 주기 [start, end)의 일수."""
    return (end - start).days


def prorate_change(
    old: Plan,
    new: Plan,
    period_start: date,
    period_end: date,
    change_date: date,
) -> Decimal:
    """주기 중간에 요금제를 바꿀 때 청구(양수) 또는 환급(음수)할 금액.
    주기의 남은 일수를 사용하며, 변경 당일도 남은 일수에 포함한다.
    원 단위에서 반올림(half-up)한다."""
    if not (period_start <= change_date < period_end):
        raise ValueError("change_date outside billing period")
    total_days = days_in_period(period_start, period_end)
    remaining = (period_end - change_date).days - 1
    diff = new.monthly_price - old.monthly_price
    amount = diff * remaining / total_days
    return amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
```

운영 중인 요금제:

| 코드 | monthly_price(원) |
|---|---|
| BASIC | 20000 |
| PRO | 49000 |
| TEAM | 99000 |

이번 릴리스에 대한 프로덕트팀의 기대 동작:

- 2024년 2월 1일 ~ 3월 1일 주기에서 2월 15일에 BASIC에서 PRO로 바꾸면 15,000원을 청구한다.
- 주기 마지막 날 변경하면 하루치 차액을 청구한다.
- 주기 첫날 변경하면 차액 전체를 청구한다.
- 다운그레이드는 대응하는 업그레이드와 같은 크기의 음수 금액(환급)을 준다.
- 같은 요금제로 바꾸면 0을 반환한다.
- 결제 서비스는 JSON에서 읽은 가격을 넘기는 경우가 있어, float로 들어올 수 있다.

**산출물** (설명은 약 2,500자 이내, 테스트 코드는 더 길어도 됩니다):

1. `tests/test_proration.py`: 위 기대 동작, 경계값(주기 시작일, 마지막 날, 주기 밖, 윤년 2월, 30일·31일 달), 반올림(0.5원 경계 사례와 음수 0.5원 사례 포함), 입력 타입을 다루는 pytest 테스트. 도움이 되면 parametrize를 쓰십시오. 선택적으로 Hypothesis 속성 테스트 하나를 추가하고 불변식을 명시하십시오.
2. 현재 코드에서 실패하는 각 테스트에 대해: 기대값, 실제값, 원인.
3. v2.4.0에 대한 go/no-go 권고와 근거, 요청할 최소한의 코드 수정, 릴리스 노트에서 부정확한 부분.

음수 0.5원을 어떻게 반올림할지, float를 받을지 거부할지처럼 기대 동작이 모호한 부분은 테스트에 반영한 결정과 그 이유를 명시하십시오.

## A strong answer

- Shows that the `- 1` excludes the change day, contradicting both the docstring and the release note. For 15 February 2024 (a 29-day period with 15 days remaining) the expected charge is ₩15,000, but the code returns ₩14,000, and a last-day change returns ₩0 instead of 29,000 × 1/29 = ₩1,000.
- Recommends no-go: the headline fix in the release notes is not actually in the code. The minimal fix is removing `- 1`.
- Covers boundaries correctly: a change on period_start charges the full difference; a change on period_end or before period_start raises ValueError; leap-year February has 29 days; 30- and 31-day months are tested.
- Handles rounding deliberately, noting that Decimal ROUND_HALF_UP rounds away from zero for negatives (−0.5 becomes −1), so downgrade credits mirror upgrades; the half-won cases need custom test plans, since the production price differences never produce an exact .5. Picks a policy for float prices and tests for it. Today, mixing a float with a Decimal raises TypeError, and two floats fail at `.quantize`.
- The tests are runnable, well named and parametrized, and any property test states a real invariant, such as antisymmetry between upgrade and downgrade or that the result is bounded by the full difference.
