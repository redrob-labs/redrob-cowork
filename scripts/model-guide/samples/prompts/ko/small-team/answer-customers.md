---
profession: small-team
task: answer-customers
language: ko
deliverable: none
---

## Prompt

당신은 수제 도자기를 온라인으로 판매하고 원데이 클래스를 운영하는 4인 도예 공방 '흙과불'의 운영을 돕고 있습니다. 오늘은 **2026년 4월 14일(화)**입니다. 공방 대표 이영희 님이 공용 문의함 정리를 부탁했습니다. 모든 문의를 분류하고, 답장 초안을 쓰고, 대표가 결정해야 할 사항을 알려 주세요.

**운영 정책**

- 고객의 클래스 취소: 수업 7일 이상 전 전액 환불, 2~6일 전 50% 환불, 48시간 이내 환불 불가. **공방 사정으로** 클래스를 취소하면 전액 환불 또는 무료 일정 변경 중 고객이 선택.
- 배송 파손: **배송 완료 후 7일 이내** 사진과 함께 알려 주시면 무료 교환 또는 환불. 연락 채널은 무관합니다.
- 단체·B2B 주문: 최소 48개, 소비자가의 40% 할인. 로고 각인은 개당 3,000원 추가. 제작 기간 6주. B2B 주문용 가마 생산 능력은 주당 머그 40개.
- 머그 소비자가: 38,000원.

**클래스 일정**

| 클래스 | 일시 | 예약 / 정원 |
|---|---|---|
| 물레 입문 | 4월 18일(토) 10:00 | 8 / 8 |
| 물레 입문 | 4월 23일(목) 18:30 | 5 / 8 |
| 유약 워크숍 | 4월 4일(토) 14:00 | **4월 2일 공방 사정으로 취소(가마 수리)** |
| 유약 워크숍 | 4월 25일(토) 14:00 | 6 / 10 |

**예약·주문 시스템 메모**

- 온라인 스토어는 '샵프런트' 플랫폼에서 운영합니다. 정식 계정 메일은 no-reply@shopfront.example.com에서만 발송됩니다.
- 김철수: 4월 4일 유약 워크숍 예약(70,000원). 취소 안내 메일 **반송됨**(등록된 주소: cheolsu.kmi@example.com).
- 주문 #1042(박영수): 머그 1개, 3월 25일(수) 배송 완료.
- 인스타그램 DM, 3월 27일(금), @ys_park_pots: "1042번 주문 머그가 금이 간 채로 왔어요 😞 [사진]" 상태: 읽지 않음.

**문의함**

1. **이영희**(고객, 대표와 동명이인): "4월 18일 토요일 물레 입문에 2자리 예약했어요. 동생도 같이 갈 수 있을까요? 그리고 저녁 수업도 있나요? 토요일은 너무 정신이 없어서요."
2. **김철수:** "4월 4일 유약 워크숍 환불받고 싶어요. 결국 못 갔네요. 늦게 연락드려서 죄송합니다."
3. **홍길동**(카페 사장): "저희 카페 로고 넣은 머그 60개를 개당 20,000원에 만들어 주실 수 있나요? 5월 1일 오픈이라 그 전에 받아야 해요."
4. **"스토어 고객센터" <security@shopfront-billing-alerts.example.com>:** "24시간 후 스토어가 정지됩니다. 여기에서 결제 정보를 인증하세요: [링크]"
5. **박영수:** "다시 연락드립니다. 1042번 주문 머그가 깨져서 왔어요. 아직 아무도 답이 없네요. 꽤 실망스럽습니다."

**제출물** (마크다운, 약 2,500자 이내):

1. 분류 표: 문의, 유형, 우선순위, 조치, 대표 결정 필요 여부.
2. 답장이 필요한 모든 문의에 대해 바로 보낼 수 있는 답장 (각 약 300자 이내, 따뜻한 동네 공방 말투).
3. 내부 메모: 시스템 수정 사항과 대표가 승인해야 할 사항(금액 포함).

## A strong answer

- Doesn't add a third person to the full Sat 18 Apr class. Offers to move all three to the Thu 23 Apr 18:30 class, which has exactly 3 seats left and answers the evening question.
- Gives Kim Cheol-su a full ₩70,000 refund, or a free reschedule, because the studio cancelled the class. The answer realises he may never have been told (the email bounced to a misspelt address), apologises, and fixes the address.
- For the wholesale request, calculates ₩25,800 per mug (₩38,000 × 60% + ₩3,000), or ₩1,548,000 for 60, and doesn't accept ₩20,000 without flagging it to the owner. It flags that 1 May is impossible (6-week lead time; 60 mugs take 1.5 weeks of the 40-a-week capacity) and offers alternatives, such as a later date or a partial or stock order.
- Identifies message 4 as phishing (a lookalike domain and urgency). No reply, no clicking, and a note to report it and check the real store admin directly.
- Honours Park Young-su's replacement or refund, because he reported the damage with a photo via Instagram DM on 27 Mar, within 7 days of delivery. The reply apologises for the missed DM.
