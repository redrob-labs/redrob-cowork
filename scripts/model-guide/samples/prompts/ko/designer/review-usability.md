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
