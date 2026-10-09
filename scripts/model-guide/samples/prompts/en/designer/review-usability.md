---
profession: designer
task: review-usability
language: en
deliverable: web
---

## Prompt

You are the design lead at Stagelight Tickets, a fictional event-ticketing site. Before a high-traffic festival on-sale, the team wants a usability and accessibility review of the checkout "Your details" step. The engineer, Richard Miles, writes: "We pass WCAG AA: Lighthouse accessibility is 100. Marketing also wants the newsletter box pre-ticked, since it doubles sign-ups."

Here is the current markup, trimmed:

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

<div class="timer">Tickets held for <span id="t">2:00</span></div>
<h3>Your details</h3>
<form>
  <input type="text" name="name" placeholder="Full name">
  <input type="text" name="email" placeholder="Email" class="err">
  <span class="hint">Tickets are sent here</span>
  <input type="text" name="phone" placeholder="Phone (optional)">
  <input type="text" name="card" placeholder="Card number" maxlength="16">
  <div style="display:flex;gap:4px">
    <input name="exp" placeholder="MM/YY"><input name="cvc" placeholder="CVC">
  </div>
  <img src="captcha.png">
  <input name="captcha" placeholder="Type the characters">
  <label><input type="checkbox" name="news" checked> Send me news and offers</label>
  <div class="pay" onclick="submitOrder()">Pay now</div>
  <p class="tiny"><a href="/terms">Terms</a> · <a href="/refunds">Refunds</a></p>
</form>
<script>
  // When the timer hits 0:00 the hold is released and the page redirects to the event page.
</script>
```

Context: 68% of checkout traffic is mobile. Support logs show complaints that "the timer ran out while I was typing my card", and that tickets "never arrived" because of mistyped email addresses. The page is used in the EU and the US.

**Deliver** (at most ~1,200 words of prose; code may run longer):

1. A prioritized findings table: issue, who it affects, severity (blocker/major/minor), WCAG 2.2 success criterion where one applies, and the fix.
2. A short reply to Richard on the Lighthouse claim, and your decision on the pre-ticked newsletter box, with reasoning.
3. A corrected single-file HTML/CSS/JS version of the step in one code block, keeping the same fields and brand orange, that fixes the issues you found. Note any business decision you had to assume.

## A strong answer

- Explains that automated tools catch only a share of WCAG issues and that a Lighthouse score of 100 does not show conformance. Points to failures the tool can miss, such as the 2-minute timer with no way to extend (2.2.1 Timing Adjustable) and the CAPTCHA image with no alt text or alternative (1.1.1).
- Finds the core form defects: placeholders used as labels (1.3.1/3.3.2/4.1.2), an error shown only by a red border (1.4.1/3.3.1), the hint not tied to its field, removed focus outlines (2.4.7), the hint text #a0a0a0 at about 2.6:1 (1.4.3), white on #ff7a00 failing contrast, and a clickable div instead of a button (2.1.1).
- Covers mobile and error-prevention issues: input types and autocomplete (email, tel, cc-number, cc-exp, cc-csc; 1.3.5), a card maxlength of 16 that blocks 19-digit cards, small targets (2.5.8) and the timer overlay. Suggests ways to catch email typos.
- Declines the pre-ticked newsletter box, since pre-ticked consent is not valid under GDPR in the EU and is a dark pattern, and proposes an honest unticked opt-in.
- The corrected HTML runs, keeps the fields, includes a timer warning and an extend option announced to assistive technology, and keeps the orange by using dark text or a darker shade for contrast.
