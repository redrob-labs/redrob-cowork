---
profession: engineer
task: build-features
language: ko
deliverable: none
---

## Prompt

귀하는 가상의 장보기 배송 앱 "(주)바구니로"의 결제 서비스 개발자입니다(TypeScript, Node 20, Vitest). 장바구니 가격 계산 모듈에 프로모션 코드 기능을 구현해 주십시오. 현재 모듈은 다음과 같습니다.

```ts
// pricing.ts
export type Category = 'grocery' | 'household' | 'alcohol';

export interface LineItem {
  sku: string;
  name: string;
  unitPrice: number; // 원, 부가세 포함 판매가 (예: 1990)
  qty: number;
  category: Category;
}

export interface Cart {
  items: LineItem[];
  memberTier: 'none' | 'plus';
}

export function priceCart(cart: Cart) {
  const subtotal = cart.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const memberDiscount = cart.memberTier === 'plus' ? subtotal * 0.05 : 0;
  const taxable = subtotal - memberDiscount;
  const tax = taxable * 0.1;
  return { subtotal, memberDiscount, tax, total: taxable + tax };
}
```

**스펙(PM 이영희, 재무·법무 메모 포함)**

1. 장바구니에는 프로모션 코드를 최대 1개만 적용할 수 있습니다. 코드는 대소문자를 구분하지 않습니다.
2. 프로모션 코드:

   | 코드 | 유형 | 값 | 최소 적용 대상 금액 | 유효기간(해당일 포함, 매장 현지 날짜 Asia/Seoul) |
   |---|---|---|---|---|
   | FRESH10 | 정률 | 10% | 40,000원 | 2025-12-31 |
   | SAVE5000 | 정액 | 5,000원 | 25,000원 | 2025-06-30 |
   | HOME15 | 정률 | 15%, 생활용품(household)만 | 0원 | 2025-12-31 |

3. 주류(온라인 판매가 허용되는 전통주)는 프로모션이든 멤버십이든 절대 할인하지 않습니다(법무 요구사항: 주류 할인·경품 제한). 최소 적용 대상 금액에는 주류가 아닌 상품만 포함됩니다.
4. Plus 멤버 할인(5%)을 먼저 적용하고, 프로모션은 적용 대상 상품의 남은 금액에 적용합니다.
5. 정액 할인은 적용 대상 금액을 초과할 수 없으며, 라인별 부가세를 계산할 수 있도록 적용 대상 라인에 금액 비례로 배분해야 합니다.
6. 부가세(재무팀): 판매가는 부가세 포함가입니다. grocery(미가공·단순가공 식료품)는 부가세 면세입니다. household와 alcohol은 과세 상품이며, 할인 후 라인 금액에서 부가세(금액 × 10/110)를 분리해 라인별로 표시합니다(영수증·신고용). 결제 총액에 부가세를 더하지 않습니다.
7. 모든 금액은 정수 원 단위로 다룹니다. 라인별 할인과 부가세는 원 단위에서 반올림(half-up)하고, 배분 잔액은 금액이 가장 큰 라인에 넣습니다.
8. 유효하지 않은 코드가 결제를 막아서는 안 됩니다. 프로모션 없이 계산한 가격과 기계가 읽을 수 있는 사유(`unknown`, `expired`, `below_minimum`, `no_eligible_items`)를 반환하십시오.

**산출물** (설명은 약 2,500자 이내, 코드는 더 길어도 됩니다):

1. 새 `pricing.ts`: 타입을 갖춘 순수 함수, 코드 표는 데이터로. `priceCart(cart, promoCode?, today?)` 진입점을 유지하고, 라인별 내역과 합계를 원 단위 정수로 반환하십시오.
2. 위 규칙을 검증하는 Vitest 테스트 파일. 반올림과 배분의 경계 사례를 포함하십시오.
3. Plus 멤버가 2025-07-02에 코드 `fresh10`으로 다음 장바구니를 결제한 결과를 짧은 표로 보여 주십시오.

   | 상품 | 단가 | 수량 | 카테고리 |
   |---|---|---|---|
   | 국산 두부 300g | 1,990원 | 3 | grocery |
   | 무항생제 계란 10구 | 6,490원 | 1 | grocery |
   | 주방세제 1L | 4,250원 | 2 | household |
   | 전통 막걸리 세트 | 11,990원 | 1 | alcohol |
   | 쌀 4kg | 14,500원 | 1 | grocery |

4. 현재 모듈의 버그 목록과, 해결한 스펙상의 모호한 점 및 선택한 방식.

## A strong answer

- Lists the current bugs: fractional won from unrounded floating-point arithmetic, the member discount applied to alcohol, VAT added on top of VAT-inclusive prices, VAT charged on tax-exempt groceries, and VAT computed on the whole cart rather than per line.
- Correctly rejects FRESH10 for the sample cart with `below_minimum`. The cart totals ₩47,450, but the eligible non-alcohol subtotal is ₩35,460, which is under ₩40,000 even before the member discount. The answer also notes whether the minimum is checked before or after the member discount, as a stated choice.
- Prices the sample cart with only the Plus discount applied to the ₩35,460 of non-alcohol items (per-line half-up: 299 + 325 + 425 + 725 = ₩1,774; or ₩1,773 if computed on the total and allocated, as a stated choice), VAT extracted only from the dish soap (₩734 of ₩8,075) and the makgeolli (₩1,090 of ₩11,990), a total of ₩45,676, and line results that sum exactly to the totals in won.
- Implements fixed-discount proportional allocation with remainder handling, caps the discount at the eligible amount, and makes the date check inclusive in Asia/Seoul.
- The tests are meaningful, cover each reason code, case-insensitivity, the alcohol exclusion, HOME15 scoped to household items, and rounding at half-won boundaries, and would pass against the code as written.
