---
profession: designer
task: review-usability
language: ko
deliverable: web
---

## Prompt

귀하는 가상의 공연·페스티벌 예매 사이트 "스테이지빛 티켓"의 디자인 리드입니다. 트래픽이 몰리는 페스티벌 티켓 오픈을 앞두고, 팀이 결제 단계 중 "예매자 정보" 화면의 사용성·접근성 리뷰를 요청했습니다. 엔지니어 박영수 님은 이렇게 말합니다. "WCAG AA는 통과했습니다. Lighthouse 접근성 점수가 100점이에요. 마케팅팀은 뉴스레터 수신 동의 체크박스를 미리 체크해 두길 원합니다. 가입자가 두 배로 늘거든요."

현재 마크업(일부 생략):

```html
<style>
  body { font: 14px/1.4 system-ui; color: #222; }
  input { border: 1px solid #ddd; padding: 6px; width: 100%; }
  input:focus { outline: none; }
  .hint { color: #a0a0a0; font-size: 12px; }
  .err { border-color: #e53935; }
  .timer { position: fixed; top: 0; right: 0; background: #fff3; }
  .pay { background: #ff7a00; color: #fff; padding: 6px 10px; font-size: 13px; }
  .tiny a { font-size: 11px; }
</style>

<div class="timer">좌석 선점 남은 시간 <span id="t">2:00</span></div>
<h3>예매자 정보</h3>
<form>
  <input type="text" name="name" placeholder="이름">
  <input type="text" name="email" placeholder="이메일" class="err">
  <span class="hint">모바일 티켓이 이 주소로 발송됩니다</span>
  <input type="text" name="phone" placeholder="휴대폰 번호(선택)">
  <input type="text" name="card" placeholder="카드 번호" maxlength="16">
  <div style="display:flex;gap:4px">
    <input name="exp" placeholder="MM/YY"><input name="cvc" placeholder="CVC">
  </div>
  <img src="captcha.png">
  <input name="captcha" placeholder="보안문자 입력">
  <label><input type="checkbox" name="news" checked> 이벤트·혜택 소식 받기</label>
  <div class="pay" onclick="submitOrder()">결제하기</div>
  <p class="tiny"><a href="/terms">이용약관</a> · <a href="/refunds">취소·환불 규정</a></p>
</form>
<script>
  // 타이머가 0:00이 되면 좌석 선점이 해제되고 공연 상세 페이지로 이동한다.
</script>
```

맥락: 결제 트래픽의 68%가 모바일입니다. 고객센터에는 "카드 번호를 입력하는 동안 시간이 끝나 버렸다"는 불만과, 이메일 주소 오타 때문에 티켓이 "오지 않았다"는 불만이 접수되고 있습니다. 이 페이지는 한국과 EU 고객이 함께 사용합니다.

**산출물** (설명은 약 2,500자 이내, 코드는 더 길어도 됩니다):

1. 우선순위를 매긴 발견 사항 표: 문제, 영향을 받는 사용자, 심각도(blocker/major/minor), 해당되는 WCAG 2.2 성공 기준, 수정 방안.
2. Lighthouse 주장에 대한 박영수 님에게의 짧은 답변과, 미리 체크된 뉴스레터 체크박스에 대한 결정 및 근거.
3. 같은 필드와 브랜드 오렌지를 유지하면서 발견한 문제를 고친 단일 HTML/CSS/JS 수정본(코드 블록 하나). 가정해야 했던 비즈니스 결정이 있다면 적어 주십시오.

## A strong answer

- Explains that automated tools catch only a share of WCAG issues and that a Lighthouse score of 100 does not show conformance. Points to failures the tool can miss, such as the 2-minute timer with no way to extend (2.2.1 Timing Adjustable) and the CAPTCHA (보안문자) image with no alt text or alternative (1.1.1).
- Finds the core form defects: placeholders used as labels (1.3.1/3.3.2/4.1.2), an error shown only by a red border (1.4.1/3.3.1), the hint not tied to its field, removed focus outlines (2.4.7), the hint text #a0a0a0 at about 2.6:1 (1.4.3), white on #ff7a00 failing contrast, and a clickable div instead of a button (2.1.1).
- Covers mobile and error-prevention issues: input types and autocomplete (email, tel, cc-number, cc-exp, cc-csc; 1.3.5), a card maxlength of 16 that blocks 19-digit cards, small targets (2.5.8) and the timer overlay. Suggests ways to catch email typos.
- Declines the pre-ticked newsletter box: under Korea's 개인정보 보호법 marketing consent must be a separate, optional consent that is not pre-selected (and 정보통신망법 requires prior opt-in for advertising messages), pre-ticked consent is not valid under GDPR in the EU, and it is a dark pattern. Proposes an honest unticked opt-in.
- The corrected HTML runs, keeps the fields, includes a timer warning and an extend option announced to assistive technology, and keeps the orange by using dark text or a darker shade for contrast.

## Card

brief: 예매 결제 단계의 예매자 정보 화면을 리뷰하고 Lighthouse 주장과 수신 동의 사전 체크에 답합니다.
given:
- 엔지니어의 말: Lighthouse 점수 주장과 마케팅팀의 수신 동의 사전 체크 요청
- 현재 마크업: "예매자 정보" 화면의 일부 생략한 HTML·CSS와 타이머 주석
- 맥락: 모바일 트래픽 68%, 고객센터 불만 2가지, 한국과 EU 고객 공용
asked:
- 우선순위를 매긴 발견 사항 표: 문제, 영향받는 사용자, 심각도, WCAG 2.2 성공 기준, 수정 방안
- Lighthouse 주장에 대한 박영수 님 답변과, 사전 체크된 체크박스에 대한 결정과 근거
- 같은 필드와 브랜드 오렌지를 유지한 단일 HTML/CSS/JS 수정본
limit: 설명은 약 2,500자 이내, Markdown; 코드는 더 길어도 됨
hard: 자동 점수를 수동 검토와 저울질해야 하고, 짧은 마크업에 심각도가 다른 결함이 많이 숨어 있으며, 비즈니스 요청이 법적·윤리적 한계에 부딪힙니다.

## Scorecard

- Explains Lighthouse 100 doesn't prove conformance; cites the unextendable 2-minute timer (2.2.1) and CAPTCHA (1.1.1)
- Flags placeholder-only labels, colour-only error, unlinked hint, removed focus outline and clickable div
- Flags contrast failures: #a0a0a0 hint at about 2.6:1 and white on #ff7a00
- Covers input types and autocomplete (1.3.5), 16-digit card maxlength, small targets, timer overlay, email typos
- Declines the pre-ticked box (개인정보 보호법, 정보통신망법, GDPR; a dark pattern); proposes an unticked opt-in
- Corrected HTML runs, keeps fields, adds an announced timer warning and extend option, keeps orange accessibly

## Scorecard, shown

- Lighthouse 100점이 적합성을 증명하지 않음을 설명하고, 연장할 수 없는 2분 타이머(2.2.1)와 보안문자(1.1.1)를 예로 든다
- 플레이스홀더만 있는 레이블, 색으로만 표시한 오류, 연결되지 않은 힌트, 제거된 포커스 표시, 클릭 가능한 div를 지적한다
- 명도 대비 미달을 지적한다: 약 2.6:1인 #a0a0a0 힌트, #ff7a00 위 흰색 글자
- 입력 타입과 autocomplete(1.3.5), 카드 번호 maxlength 16, 작은 터치 영역, 타이머 오버레이, 이메일 오타를 다룬다
- 사전 체크를 거부하고(개인정보 보호법, 정보통신망법, GDPR, 다크 패턴) 체크되지 않은 선택 동의를 제안한다
- 수정한 HTML이 동작하고 필드를 유지하며, 보조기기에 안내되는 타이머 경고와 연장 기능을 넣고 오렌지를 접근 가능하게 유지한다
